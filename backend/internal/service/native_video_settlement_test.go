package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/pkg/tlsfingerprint"
	"github.com/Wei-Shaw/sub2api/internal/pkg/xai"
	"github.com/stretchr/testify/require"
)

// nativeSettlementRepo fakes the native table plus the durable usage journal,
// with the same dedup semantics: one charge per (request ID, key), and a
// different fingerprint for a charged request ID is a conflict.
type nativeSettlementRepo struct {
	UsageBillingRepository
	mu        sync.Mutex
	rows      map[string]*NativeVideoSettlement
	states    map[string]string
	notes     map[string]string
	events    map[string]UsageBillingEvent
	charges   map[string]int
	failApply bool
}

func newNativeSettlementRepo() *nativeSettlementRepo {
	return &nativeSettlementRepo{rows: map[string]*NativeVideoSettlement{}, states: map[string]string{}, notes: map[string]string{},
		events: map[string]UsageBillingEvent{}, charges: map[string]int{}}
}

func nativeRowKey(taskID string, keyID int64) string { return fmt.Sprintf("%s|%d", taskID, keyID) }

func (r *nativeSettlementRepo) StoreNativeVideoSettlement(_ context.Context, t *NativeVideoSettlement) error {
	if err := t.Validate(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	k := nativeRowKey(t.TaskID, t.APIKeyID)
	if old, ok := r.rows[k]; ok {
		a, _ := json.Marshal(old)
		b, _ := json.Marshal(t)
		if string(a) != string(b) {
			return ErrUsageBillingRequestConflict
		}
		return nil
	}
	cp := *t
	r.rows[k] = &cp
	if t.Submitting() {
		r.states[k] = "submitting"
		return nil
	}
	r.states[k] = "pending"
	sk := nativeRowKey(t.SubmissionID, t.APIKeyID)
	if r.states[sk] == "submitting" {
		delete(r.rows, sk)
		delete(r.states, sk)
	}
	return nil
}
func (r *nativeSettlementRepo) DiscardNativeVideoSubmission(_ context.Context, id string, keyID int64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	k := nativeRowKey(id, keyID)
	if r.states[k] == "submitting" {
		delete(r.rows, k)
		delete(r.states, k)
	}
	return nil
}
func (r *nativeSettlementRepo) HasNativeVideoSettlement(_ context.Context, id string, keyID int64) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.states[nativeRowKey(id, keyID)]
	return ok && s != "submitting", nil
}
func (r *nativeSettlementRepo) DueNativeVideoSettlements(context.Context, int) ([]NativeVideoSettlement, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []NativeVideoSettlement
	for k, row := range r.rows {
		if r.states[k] == "pending" {
			out = append(out, *row)
		}
	}
	return out, nil
}
func (r *nativeSettlementRepo) RescheduleNativeVideoSettlement(_ context.Context, id string, keyID int64, _ time.Duration, note string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.notes[nativeRowKey(id, keyID)] = note
	return nil
}
func (r *nativeSettlementRepo) FinishNativeVideoSettlement(_ context.Context, id string, keyID int64, state, note string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	k := nativeRowKey(id, keyID)
	if r.states[k] == "pending" {
		r.states[k], r.notes[k] = state, note
	}
	return nil
}
func (r *nativeSettlementRepo) StageUsageBilling(_ context.Context, c *UsageBillingCommand, u *UsageLog) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	c.Normalize()
	k := nativeRowKey(c.RequestID, c.APIKeyID)
	if old, ok := r.events[k]; ok {
		if old.Command.RequestFingerprint != c.RequestFingerprint {
			return ErrUsageBillingRequestConflict
		}
		return nil
	}
	r.events[k] = UsageBillingEvent{Version: 1, Command: *c, Usage: *u}
	return nil
}
func (r *nativeSettlementRepo) ApplyStagedUsageBilling(_ context.Context, key UsageBillingEventKey) (*UsageBillingRecovery, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.failApply {
		return nil, errors.New("transient SQL failure")
	}
	k := nativeRowKey(key.RequestID, key.APIKeyID)
	applied := r.charges[k] == 0
	if applied {
		r.charges[k]++
	}
	return &UsageBillingRecovery{Event: r.events[k], Result: UsageBillingApplyResult{Applied: applied}}, nil
}
func (*nativeSettlementRepo) PendingUsageBilling(context.Context, int) ([]UsageBillingEventKey, error) {
	return nil, nil
}
func (*nativeSettlementRepo) AcknowledgeUsageBillingCache(context.Context, UsageBillingEventKey) error {
	return nil
}
func (r *nativeSettlementRepo) state(id string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.states[nativeRowKey(id, 20)]
}
func (r *nativeSettlementRepo) charged(id string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.charges[nativeRowKey(StableGrokVideoBillingRequestID(id), 20)]
}
func (r *nativeSettlementRepo) event(id string) UsageBillingEvent {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.events[nativeRowKey(StableGrokVideoBillingRequestID(id), 20)]
}

type nativeKeyLoader struct {
	key   *APIKey
	err   error
	calls int
}

func (l *nativeKeyLoader) LoadVideoBillingKey(_ context.Context, keyID, userID, groupID int64) (*APIKey, error) {
	l.calls++
	if l.err != nil {
		return nil, l.err
	}
	cp := *l.key
	return &cp, nil
}
func (*nativeKeyLoader) InvalidateAuthCacheByKey(context.Context, string)    {}
func (*nativeKeyLoader) InvalidateAuthCacheByUserID(context.Context, int64)  {}
func (*nativeKeyLoader) InvalidateAuthCacheByGroupID(context.Context, int64) {}

type nativeStatusHTTP struct {
	mu     sync.Mutex
	status int
	body   string
	calls  int
	paths  []string
}

func (s *nativeStatusHTTP) Do(req *http.Request, _ string, _ int64, _ int) (*http.Response, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	s.paths = append(s.paths, req.Method+" "+req.URL.Path)
	code := s.status
	if code == 0 {
		code = http.StatusOK
	}
	return &http.Response{StatusCode: code, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(s.body))}, nil
}
func (s *nativeStatusHTTP) DoWithTLS(req *http.Request, p string, id int64, n int, _ *tlsfingerprint.Profile) (*http.Response, error) {
	return s.Do(req, p, id, n)
}

// Upstream 5xx on a status poll may cool the account down, as for client polls.
type nativeAccountRepo struct {
	openAIRecordUsageAccountRepoStub
	cooled int
}

// Concurrent workers read the account; return copies without shared counters.
func (r *nativeAccountRepo) GetByID(context.Context, int64) (*Account, error) {
	cp := *r.account
	return &cp, nil
}

func (r *nativeAccountRepo) SetTempUnschedulable(context.Context, int64, time.Time, string) error {
	r.cooled++
	return nil
}

func nativeGrokAccount() *Account {
	return &Account{ID: 3, Platform: PlatformGrok, Type: AccountTypeAPIKey, Concurrency: 1,
		Credentials: map[string]any{"api_key": "xai-key", "base_url": "https://xai.test/v1"}}
}

func nativeArkAccount() *Account {
	return &Account{ID: 3, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Concurrency: 1, Credentials: map[string]any{
		"api_key": "ark-secret", "base_url": "https://ark.cn-beijing.volces.com/api/v3", "openai_capabilities": []string{"seedance"},
	}}
}

func nativeSettlementFixture(kind, taskID string) *NativeVideoSettlement {
	return &NativeVideoSettlement{SubmissionID: NewNativeVideoSubmissionID("s-" + taskID), TaskID: taskID, Kind: kind,
		UserID: 10, APIKeyID: 20, GroupID: 24, AccountID: 3,
		Pending: GrokVideoPendingBilling{Model: map[string]string{NativeVideoKindGrok: "grok-imagine-video", NativeVideoKindArk: "gpt-5.1"}[kind],
			VideoResolution: "720p", VideoDurationSeconds: 6, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)},
		InboundEndpoint: "/v1/videos/generations", UpstreamEndpoint: "/v1/videos/generations"}
}

func newNativeSettlementService(t *testing.T, repo *nativeSettlementRepo, up *nativeStatusHTTP, account *Account) (*OpenAIGatewayService, *nativeKeyLoader) {
	t.Helper()
	t.Setenv(xai.EnvAllowUnsafeURLOverrides, "true")
	cfg := &config.Config{}
	cfg.Default.RateMultiplier = 1
	billing := NewBillingService(cfg, nil)
	// Collaborators go through the constructor: it starts background loops
	// that read them, so assigning fields afterwards would race.
	svc := NewOpenAIGatewayService(&nativeAccountRepo{openAIRecordUsageAccountRepoStub: openAIRecordUsageAccountRepoStub{account: account}},
		nil, &openAIRecordUsageLogRepoStub{inserted: true}, repo, &openAIRecordUsageUserRepoStub{}, &openAIRecordUsageSubRepoStub{}, nil,
		nil, cfg, nil, nil, billing, nil, &BillingCacheService{}, up, &DeferredService{}, nil, nil,
		NewModelPricingResolver(nil, billing), nil, nil, nil, nil)
	svc.userGroupRateResolver = newUserGroupRateResolver(nil, nil, resolveUserGroupRateCacheTTL(cfg), nil, "service.native_video.test")
	price := 0.1
	groupID := int64(24)
	loader := &nativeKeyLoader{key: &APIKey{ID: 20, UserID: 10, GroupID: &groupID, User: &User{ID: 10, Balance: 100},
		Group: &Group{ID: groupID, Platform: PlatformGrok, RateMultiplier: 1, VideoPrice720P: &price}}}
	return svc, loader
}

func TestNativeVideoSettlementValidation(t *testing.T) {
	require.NoError(t, nativeSettlementFixture(NativeVideoKindGrok, "xai-req-1").Validate())
	require.NoError(t, nativeSettlementFixture(NativeVideoKindArk, "seedance:cgt-1").Validate())
	intent := nativeSettlementFixture(NativeVideoKindGrok, "x")
	intent.TaskID, intent.Pending.Model = intent.SubmissionID, ""
	require.NoError(t, intent.Validate(), "an unbound intent has no pricing units yet")
	for name, mutate := range map[string]func(*NativeVideoSettlement){
		"unknown kind":         func(v *NativeVideoSettlement) { v.Kind = "relay" },
		"ark without prefix":   func(v *NativeVideoSettlement) { v.Kind = NativeVideoKindArk },
		"grok relay prefix":    func(v *NativeVideoSettlement) { v.TaskID = "seedance-video:vid_1" },
		"grok ark prefix":      func(v *NativeVideoSettlement) { v.TaskID = "seedance:cgt-1" },
		"path traversal":       func(v *NativeVideoSettlement) { v.TaskID = "../admin" },
		"missing group":        func(v *NativeVideoSettlement) { v.GroupID = 0 },
		"missing account":      func(v *NativeVideoSettlement) { v.AccountID = 0 },
		"missing model":        func(v *NativeVideoSettlement) { v.Pending.Model = "" },
		"bad created at":       func(v *NativeVideoSettlement) { v.Pending.CreatedAt = "yesterday" },
		"bill on content":      func(v *NativeVideoSettlement) { v.Pending.BillOnContent = true },
		"relay quote":          func(v *NativeVideoSettlement) { base := 1.0; v.Pending.MiniMaxH3BaseCost = &base },
		"bad submission":       func(v *NativeVideoSettlement) { v.SubmissionID = "minimax-h3:submission_1" },
		"oversized user agent": func(v *NativeVideoSettlement) { v.UserAgent = strings.Repeat("a", 513) },
	} {
		t.Run(name, func(t *testing.T) {
			v := nativeSettlementFixture(NativeVideoKindGrok, "xai-req-1")
			mutate(v)
			require.Error(t, v.Validate())
		})
	}
	// Native rows never satisfy the relay validator that older binaries use.
	relay := &RelayVideoSettlement{TaskID: "xai-req-1", SubmissionID: NewNativeVideoSubmissionID("s")}
	require.Error(t, relay.Validate())
}
func TestNativeGrokVideoSettlesWithoutClientPolling(t *testing.T) {
	for _, tc := range []struct {
		name, body, state string
		charges           int
	}{
		{"done", `{"status":"done","model":"grok-imagine-video","video":{"url":"https://vidgen.x.ai/a.mp4","duration":6}}`, "complete", 1},
		{"pending", `{"status":"pending"}`, "pending", 0},
		{"failed", `{"status":"failed","error":{"message":"boom"}}`, "failed", 0},
		{"expired", `{"status":"expired"}`, "failed", 0},
		{"moderated", `{"status":"done","video":{"url":"https://vidgen.x.ai/a.mp4","respect_moderation":false}}`, "failed", 0},
		{"done without url", `{"status":"done","video":{}}`, "failed", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := newNativeSettlementRepo()
			require.NoError(t, repo.StoreNativeVideoSettlement(context.Background(), nativeSettlementFixture(NativeVideoKindGrok, "xai-req-1")))
			up := &nativeStatusHTTP{body: tc.body}
			svc, loader := newNativeSettlementService(t, repo, up, nativeGrokAccount())
			for range 3 {
				require.NoError(t, svc.recoverNativeVideos(context.Background(), loader))
			}
			require.Equal(t, tc.state, repo.state("xai-req-1"))
			require.Equal(t, tc.charges, repo.charged("xai-req-1"))
			require.Contains(t, up.paths[0], "GET /v1/videos/xai-req-1")
			for _, p := range up.paths {
				require.NotContains(t, p, "/content", "the worker never downloads output")
				require.NotContains(t, p, "POST", "the worker never submits generation")
			}
			if tc.charges == 1 {
				e := repo.event("xai-req-1")
				require.Equal(t, StableGrokVideoBillingRequestID("xai-req-1"), e.Command.RequestID)
				require.Equal(t, HashUsageRequestPayload([]byte("xai-req-1")), e.Command.RequestPayloadHash)
				require.Equal(t, 1, e.Usage.VideoCount)
				require.Equal(t, "720p", *e.Usage.VideoResolution, "resolution comes from the create request")
				require.Equal(t, 6, *e.Usage.VideoDurationSeconds)
				require.InDelta(t, 0.6, e.Usage.TotalCost, 1e-9, "720p × 6s at 0.1/s")
				require.InDelta(t, 0.6, e.Command.BalanceCost, 1e-9)
			}
		})
	}
}

func TestNativeArkSettlesByCompletionTokensOnly(t *testing.T) {
	for _, tc := range []struct {
		name, body, state string
		charges           int
	}{
		{"succeeded", `{"id":"cgt-1","status":"succeeded","usage":{"completion_tokens":1000}}`, "complete", 1},
		{"succeeded without tokens", `{"id":"cgt-1","status":"succeeded"}`, "review", 0},
		{"running", `{"id":"cgt-1","status":"running"}`, "pending", 0},
		{"failed", `{"id":"cgt-1","status":"failed"}`, "failed", 0},
		{"cancelled", `{"id":"cgt-1","status":"cancelled"}`, "failed", 0},
		{"expired", `{"id":"cgt-1","status":"expired"}`, "failed", 0},
		{"other task", `{"id":"cgt-2","status":"succeeded","usage":{"completion_tokens":1000}}`, "pending", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := newNativeSettlementRepo()
			require.NoError(t, repo.StoreNativeVideoSettlement(context.Background(), nativeSettlementFixture(NativeVideoKindArk, "seedance:cgt-1")))
			up := &nativeStatusHTTP{body: tc.body}
			svc, loader := newNativeSettlementService(t, repo, up, nativeArkAccount())
			for range 2 {
				require.NoError(t, svc.recoverNativeVideos(context.Background(), loader))
			}
			require.Equal(t, tc.state, repo.state("seedance:cgt-1"))
			require.Equal(t, tc.charges, repo.charged("seedance:cgt-1"))
			require.Equal(t, "GET /api/v3/contents/generations/tasks/cgt-1", up.paths[0])
			if tc.charges == 1 {
				e := repo.event("seedance:cgt-1")
				require.Equal(t, 1000, e.Usage.OutputTokens)
				require.Zero(t, e.Usage.VideoCount, "Ark is token billed, never Grok seconds")
				require.Greater(t, e.Command.BalanceCost, 0.0)
			}
		})
	}
}

func TestNativeVideoUnreadableStatusGoesToReviewAtDeadline(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		body   string
	}{
		{"http error", http.StatusInternalServerError, `{"error":{"message":"down"}}`},
		{"still running", http.StatusOK, `{"status":"pending"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := newNativeSettlementRepo()
			task := nativeSettlementFixture(NativeVideoKindGrok, "xai-req-1")
			require.NoError(t, repo.StoreNativeVideoSettlement(context.Background(), task))
			svc, loader := newNativeSettlementService(t, repo, &nativeStatusHTTP{status: tc.status, body: tc.body}, nativeGrokAccount())
			require.NoError(t, svc.recoverNativeVideos(context.Background(), loader))
			require.Equal(t, "pending", repo.state("xai-req-1"), "before the deadline the worker keeps checking")
			repo.mu.Lock()
			repo.rows[nativeRowKey("xai-req-1", 20)].CreatedAt = time.Now().Add(-25 * time.Hour)
			repo.mu.Unlock()
			require.NoError(t, svc.recoverNativeVideos(context.Background(), loader))
			require.Equal(t, "review", repo.state("xai-req-1"))
			require.Zero(t, repo.charged("xai-req-1"), "an unknown outcome is never charged by guess")
		})
	}
}

func TestNativeVideoBillingRetriesAndNeverDoubleCharges(t *testing.T) {
	ctx := context.Background()
	repo := newNativeSettlementRepo()
	require.NoError(t, repo.StoreNativeVideoSettlement(ctx, nativeSettlementFixture(NativeVideoKindGrok, "xai-req-1")))
	up := &nativeStatusHTTP{body: `{"status":"done","video":{"url":"https://vidgen.x.ai/a.mp4","duration":6}}`}
	svc, loader := newNativeSettlementService(t, repo, up, nativeGrokAccount())

	repo.failApply = true
	require.NoError(t, svc.recoverNativeVideos(ctx, loader))
	require.Equal(t, "pending", repo.state("xai-req-1"), "a failed charge is retried")
	require.Zero(t, repo.charged("xai-req-1"))
	loader.err = errors.New("db down")
	repo.failApply = false
	require.NoError(t, svc.recoverNativeVideos(ctx, loader))
	require.Equal(t, "pending", repo.state("xai-req-1"))

	loader.err = nil
	repo.mu.Lock()
	snapshot := *repo.rows[nativeRowKey("xai-req-1", 20)]
	repo.mu.Unlock()
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			task := snapshot
			_, _ = svc.settleNativeVideo(ctx, repo, &nativeKeyLoader{key: loader.key}, &task)
		}()
	}
	wg.Wait()
	require.Equal(t, 1, repo.charged("xai-req-1"), "concurrent workers charge once")
	require.Equal(t, "complete", repo.state("xai-req-1"))
}

func TestNativeVideoAlreadyBilledByLegacyPollIsNotChargedAgain(t *testing.T) {
	ctx := context.Background()
	repo := newNativeSettlementRepo()
	require.NoError(t, repo.StoreNativeVideoSettlement(ctx, nativeSettlementFixture(NativeVideoKindGrok, "xai-req-1")))
	// An older binary's poll already charged this task under a different fingerprint.
	legacy := UsageBillingCommand{RequestID: StableGrokVideoBillingRequestID("xai-req-1"), APIKeyID: 20, UserID: 10, AccountID: 3, BalanceCost: 0.48}
	require.NoError(t, repo.StageUsageBilling(ctx, &legacy, &UsageLog{RequestID: legacy.RequestID}))
	_, err := repo.ApplyStagedUsageBilling(ctx, UsageBillingEventKey{RequestID: legacy.RequestID, APIKeyID: 20})
	require.NoError(t, err)
	up := &nativeStatusHTTP{body: `{"status":"done","video":{"url":"https://vidgen.x.ai/a.mp4","duration":6}}`}
	svc, loader := newNativeSettlementService(t, repo, up, nativeGrokAccount())
	require.NoError(t, svc.recoverNativeVideos(ctx, loader))
	require.Equal(t, "complete", repo.state("xai-req-1"))
	require.Equal(t, 1, repo.charged("xai-req-1"))
	require.InDelta(t, 0.48, repo.event("xai-req-1").Command.BalanceCost, 1e-9, "the first charge stands")
}

func TestNativeVideoSubmissionLifecycle(t *testing.T) {
	ctx := context.Background()
	repo := newNativeSettlementRepo()
	svc := &OpenAIGatewayService{usageBillingRepo: repo}
	require.True(t, svc.HasNativeVideoSettlementStore())
	require.False(t, (&OpenAIGatewayService{usageBillingRepo: repo, cfg: &config.Config{RunMode: config.RunModeSimple}}).HasNativeVideoSettlementStore())
	require.False(t, (&OpenAIGatewayService{usageBillingRepo: &openAIRecordUsageBillingRepoStub{}}).HasNativeVideoSettlementStore(), "needs the durable journal")

	intent := nativeSettlementFixture(NativeVideoKindGrok, "unused")
	intent.Pending = GrokVideoPendingBilling{Model: "grok-imagine-video", CreatedAt: time.Now().UTC().Format(time.RFC3339Nano), BillOnContent: true}
	require.NoError(t, svc.PrepareNativeVideoSettlement(ctx, intent))
	require.Equal(t, "submitting", repo.state(intent.SubmissionID))
	require.False(t, svc.IsNativeVideoSettled(ctx, intent.SubmissionID, 20), "an intent is not a billable task")
	due, err := repo.DueNativeVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Empty(t, due, "unbound intents are never polled")

	// Creator native Grok now bills on upstream success: the bound row drops BillOnContent.
	require.NoError(t, svc.AcceptNativeVideoSettlement(ctx, intent, "xai-req-1", GrokVideoPendingBilling{
		Model: "grok-imagine-video", VideoResolution: "720P", VideoDurationSeconds: 6, BillOnContent: true, CreatedAt: intent.Pending.CreatedAt}))
	require.Equal(t, "pending", repo.state("xai-req-1"))
	require.Empty(t, repo.state(intent.SubmissionID), "binding replaces the intent")
	require.True(t, svc.IsNativeVideoSettled(ctx, "xai-req-1", 20))
	require.False(t, svc.IsNativeVideoSettled(ctx, "xai-req-1", 21), "other keys keep the legacy path")
	bound := repo.rows[nativeRowKey("xai-req-1", 20)]
	require.False(t, bound.Pending.BillOnContent)
	require.Equal(t, "720p", bound.Pending.VideoResolution)
	// Replays of the same acceptance are idempotent; a different snapshot conflicts.
	require.NoError(t, svc.AcceptNativeVideoSettlement(ctx, intent, "xai-req-1", GrokVideoPendingBilling{
		Model: "grok-imagine-video", VideoResolution: "720p", VideoDurationSeconds: 6, CreatedAt: intent.Pending.CreatedAt}))
	require.ErrorIs(t, svc.AcceptNativeVideoSettlement(ctx, intent, "xai-req-1", GrokVideoPendingBilling{
		Model: "grok-imagine-video", VideoResolution: "1080p", VideoDurationSeconds: 6, CreatedAt: intent.Pending.CreatedAt}), ErrUsageBillingRequestConflict)

	failed := nativeSettlementFixture(NativeVideoKindArk, "unused")
	failed.SubmissionID = NewNativeVideoSubmissionID("rejected")
	require.NoError(t, svc.PrepareNativeVideoSettlement(ctx, failed))
	require.NoError(t, svc.DiscardNativeVideoSubmission(ctx, failed))
	require.Empty(t, repo.state(failed.SubmissionID))
}
