package service

import (
	"context"
	"errors"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/tlsfingerprint"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type relaySettlementTestRepo struct {
	UsageBillingRepository
	mu        sync.Mutex
	task      *RelayVideoSettlement
	event     *UsageBillingEvent
	state     string
	charges   int
	failApply bool
}

func (r *relaySettlementTestRepo) StoreRelayVideoSettlement(_ context.Context, v *RelayVideoSettlement) error {
	if err := v.Validate(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := *v
	r.task = &cp
	r.state = "pending"
	return nil
}
func (r *relaySettlementTestRepo) LoadRelayVideoSettlement(_ context.Context, id string, key int64) (*RelayVideoSettlement, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.task == nil || id != r.task.TaskID || key != r.task.Event.Command.APIKeyID {
		return nil, nil
	}
	cp := *r.task
	return &cp, nil
}
func (r *relaySettlementTestRepo) DueRelayVideoSettlements(context.Context, int) ([]RelayVideoSettlement, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.task == nil || r.state != "pending" || r.task.Pending.BillOnContent {
		return nil, nil
	}
	return []RelayVideoSettlement{*r.task}, nil
}
func (r *relaySettlementTestRepo) FinishRelayVideoSettlement(_ context.Context, _ string, _ int64, state string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.state = state
	return nil
}
func (r *relaySettlementTestRepo) StageUsageBilling(_ context.Context, c *UsageBillingCommand, u *UsageLog) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	c.Normalize()
	if r.event == nil {
		r.event = &UsageBillingEvent{Version: 1, Command: *c, Usage: *u}
	}
	return nil
}
func (r *relaySettlementTestRepo) ApplyStagedUsageBilling(context.Context, UsageBillingEventKey) (*UsageBillingRecovery, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.failApply {
		return nil, errors.New("transient SQL failure")
	}
	applied := r.charges == 0
	if applied {
		r.charges++
	}
	return &UsageBillingRecovery{Event: *r.event, Result: UsageBillingApplyResult{Applied: applied}}, nil
}
func (*relaySettlementTestRepo) PendingUsageBilling(context.Context, int) ([]UsageBillingEventKey, error) {
	return nil, nil
}
func (*relaySettlementTestRepo) AcknowledgeUsageBillingCache(context.Context, UsageBillingEventKey) error {
	return nil
}

type relaySettlementHTTP struct {
	body              string
	calls             int
	method            string
	redirectsDisabled bool
}

func (s *relaySettlementHTTP) Do(req *http.Request, _ string, _ int64, _ int) (*http.Response, error) {
	s.calls++
	s.method = req.Method
	s.redirectsDisabled = HTTPUpstreamRedirectsDisabled(req.Context())
	return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(s.body))}, nil
}
func (s *relaySettlementHTTP) DoWithTLS(req *http.Request, p string, id int64, n int, _ *tlsfingerprint.Profile) (*http.Response, error) {
	return s.Do(req, p, id, n)
}
func relaySettlementFixture() *RelayVideoSettlement {
	base := 1.8
	now := time.Now().UTC()
	id := "seedance-video:vid_123"
	request := StableGrokVideoBillingRequestID(id)
	return &RelayVideoSettlement{SubmissionID: "seedance-video:submission_123", TaskID: id, Pending: GrokVideoPendingBilling{MiniMaxH3BaseCost: &base, Model: "Fseadanco2.0mini", VideoDurationSeconds: 5, CreatedAt: now.Format(time.RFC3339Nano)}, Event: UsageBillingEvent{Version: 1, Command: UsageBillingCommand{RequestID: request, UserID: 1, APIKeyID: 2, AccountID: 3, BalanceCost: base}, Usage: UsageLog{RequestID: request, UserID: 1, APIKeyID: 2, AccountID: 3, Model: "Fseadanco2.0mini", VideoCount: 1, ActualCost: base, TotalCost: base, CreatedAt: now}}}
}
func TestRelaySettlementNoClientPollingAndRetry(t *testing.T) {
	for _, tc := range []struct {
		name, body, state string
		want              int
	}{
		{"completed", `{"id":"vid_123","status":"completed","metadata":{"url":"https://relay.example/video.mp4"}}`, "complete", 1},
		{"queued", `{"id":"vid_123","status":"queued"}`, "pending", 0},
		{"failed", `{"id":"vid_123","status":"failed"}`, "failed", 0},
		{"wrong ID", `{"id":"another","status":"completed","url":"https://relay.example/v.mp4"}`, "pending", 0},
		{"missing ID", `{"status":"completed","url":"https://relay.example/v.mp4"}`, "pending", 0},
		{"error", `{"id":"vid_123","status":"completed","error":{"message":"failed"},"url":"https://relay.example/v.mp4"}`, "failed", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &relaySettlementTestRepo{task: relaySettlementFixture(), state: "pending"}
			up := &relaySettlementHTTP{body: tc.body}
			s := &OpenAIGatewayService{usageBillingRepo: repo, httpUpstream: up, accountRepo: &openAIRecordUsageAccountRepoStub{account: &Account{ID: 3, Credentials: map[string]any{"base_url": "https://relay.example/v1", "api_key": "dummy"}}}}
			require.NoError(t, s.recoverRelayVideos(context.Background(), nil))
			require.Equal(t, tc.want, repo.charges)
			require.Equal(t, tc.state, repo.state)
			require.Equal(t, http.MethodGet, up.method)
			require.True(t, up.redirectsDisabled)
			require.NoError(t, s.recoverRelayVideos(context.Background(), nil))
			require.Equal(t, tc.want, repo.charges)
		})
	}
}
func TestRelaySettlementRestartConcurrentAndCacheLoss(t *testing.T) {
	ctx := context.Background()
	repo := &relaySettlementTestRepo{task: relaySettlementFixture(), state: "pending", failApply: true}
	s := &OpenAIGatewayService{usageBillingRepo: repo}
	owner, err := s.ResolveGrokMediaVideoRequestAccount(ctx, nil, repo.task.TaskID, 1, 2)
	require.NoError(t, err)
	require.Equal(t, int64(3), owner)
	pending, err := s.LoadGrokVideoPendingBilling(ctx, repo.task.TaskID, 1, 2)
	require.NoError(t, err)
	require.Equal(t, 1.8, *pending.MiniMaxH3BaseCost)
	_, err = s.SettleRelayVideo(ctx, repo.task.TaskID, 99, 2, false, nil)
	require.ErrorIs(t, err, ErrUsageBillingRequestConflict)
	handled, err := s.SettleRelayVideo(ctx, repo.task.TaskID, 1, 2, false, nil)
	require.True(t, handled)
	require.Error(t, err)
	require.Zero(t, repo.charges)
	repo.failApply = false
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fresh := &OpenAIGatewayService{usageBillingRepo: repo}
			_, e := fresh.SettleRelayVideo(ctx, repo.task.TaskID, 1, 2, false, nil)
			errs <- e
		}()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		require.NoError(t, e)
	}
	require.Equal(t, 1, repo.charges)
}
func TestRelaySettlementValidationAndLegacyDelivery(t *testing.T) {
	v := relaySettlementFixture()
	require.NoError(t, v.Validate())
	*v.Pending.MiniMaxH3BaseCost = math.NaN()
	require.Error(t, v.Validate())
	repo := &relaySettlementTestRepo{task: relaySettlementFixture(), state: "pending"}
	repo.task.Pending.BillOnContent = true
	s := &OpenAIGatewayService{usageBillingRepo: repo}
	handled, err := s.SettleRelayVideo(context.Background(), repo.task.TaskID, 1, 2, false, nil)
	require.True(t, handled)
	require.NoError(t, err)
	require.Zero(t, repo.charges)
	_, err = s.SettleRelayVideo(context.Background(), repo.task.TaskID, 1, 2, true, nil)
	require.NoError(t, err)
	require.Equal(t, 1, repo.charges)
}
func TestRelaySubmissionFailureNeverReplaysPOST(t *testing.T) {
	for _, admissionFails := range []bool{true, false} {
		t.Run(map[bool]string{true: "admission", false: "acceptance"}[admissionFails], func(t *testing.T) {
			up := &relaySettlementHTTP{body: `{"id":"task_1","status":"queued"}`}
			s := &OpenAIGatewayService{httpUpstream: up}
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", nil)
			account := &Account{ID: 3, Platform: PlatformMiniMax, Type: AccountTypeAPIKey, Credentials: map[string]any{"base_url": "https://relay.example/v1", "api_key": "dummy", "account_mode": AccountModePayG}}
			ctx := WithRelayVideoAcceptance(context.Background(), RelayVideoAcceptance{Prepare: func(context.Context, *OpenAIForwardResult) error {
				if admissionFails {
					return errors.New("SQL unavailable")
				}
				return nil
			}, Accept: func(context.Context, *OpenAIForwardResult) error { return errors.New("SQL unavailable") }})
			result, err := s.ForwardMiniMaxH3(ctx, c, account, MiniMaxH3EndpointCreate, "", []byte(`{"model":"MiniMax-H3-933-1440p-15s","prompt":"test"}`))
			if admissionFails {
				require.Error(t, err)
				require.Zero(t, up.calls)
			} else {
				require.NoError(t, err)
				require.Equal(t, 1, up.calls)
				require.Equal(t, "minimax-h3:task_1", result.ResponseID)
				require.Contains(t, w.Body.String(), "task_1")
				require.Equal(t, "pending-recovery", w.Header().Get("X-Sub2API-Billing-State"))
			}
		})
	}
}
func TestRelaySettlementWorkerStopAndDuplicateStart(t *testing.T) {
	repo := &relaySettlementTestRepo{}
	s := &OpenAIGatewayService{usageBillingRepo: repo}
	p := NewUsageRecordWorkerPoolWithOptions(UsageRecordWorkerPoolOptions{WorkerCount: 1})
	p.StartRelayVideoSettlement(s, nil)
	p.StartRelayVideoSettlement(s, nil)
	p.Stop()
	p.StartRelayVideoSettlement(s, nil)
	require.True(t, p.relayVideoStopped)
}

func TestRelaySettlementCaptureFreezesQuoteBeforeAnyCharge(t *testing.T) {
	t.Setenv("DATA_DIR", t.TempDir())
	ctx := context.Background()
	usageRepo := &openAIRecordUsageLogRepoStub{}
	userRepo := &openAIRecordUsageUserRepoStub{}
	repo := &relaySettlementTestRepo{}
	s := newOpenAIRecordUsageServiceForTest(usageRepo, userRepo, &openAIRecordUsageSubRepoStub{}, nil)
	s.usageBillingRepo = repo
	task := relaySettlementFixture()
	task.TaskID = task.SubmissionID
	key := &APIKey{ID: 2, Quota: 100, Group: &Group{RateMultiplier: 2}}
	account := &Account{ID: 3, Platform: PlatformDeepseek, Type: AccountTypeAPIKey}
	in := &OpenAIRecordUsageInput{Result: &OpenAIForwardResult{RequestID: StableGrokVideoBillingRequestID(task.TaskID), Model: task.Pending.Model, BillingModel: task.Pending.Model, VideoCount: 1, VideoDurationSeconds: 5, MiniMaxH3BaseCost: task.Pending.MiniMaxH3BaseCost}, APIKeyService: &openAIRecordUsageAPIKeyQuotaStub{}, APIKey: key, User: &User{ID: 1}, Account: account}
	require.NoError(t, s.PersistRelayVideoSettlement(ctx, task, in))
	require.Zero(t, userRepo.deductCalls)
	require.Zero(t, usageRepo.calls)
	require.Equal(t, 3.6, task.Event.Command.BalanceCost)
	require.Equal(t, 3.6, task.Event.Command.APIKeyQuotaCost)
	key.Group.RateMultiplier = 99
	require.NoError(t, s.AcceptRelayVideoSettlement(ctx, task, "seedance-video:vid_final"))
	require.Equal(t, 3.6, repo.task.Event.Command.BalanceCost)
	require.Equal(t, "grok-video:seedance-video:vid_final", repo.task.Event.Command.RequestID)
}
func TestRelaySettlementSpoolSurvivesProcessRestart(t *testing.T) {
	t.Setenv("DATA_DIR", t.TempDir())
	require.NoError(t, prepareRelayVideoSpool())
	task := relaySettlementFixture()
	path, err := saveRelayVideoSpool(task)
	require.NoError(t, err)
	require.NotEmpty(t, path)
	stat, err := os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0600), stat.Mode().Perm())
	fresh := &relaySettlementTestRepo{}
	require.NoError(t, recoverRelayVideoSpool(context.Background(), fresh))
	require.Equal(t, task.TaskID, fresh.task.TaskID)
	require.Equal(t, task.Event.Command.BalanceCost, fresh.task.Event.Command.BalanceCost)
	_, err = os.Stat(path)
	require.True(t, os.IsNotExist(err))
	require.Zero(t, fresh.charges)
}
