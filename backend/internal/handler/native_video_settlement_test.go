//go:build unit

package handler

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

type nativeHandlerRepo struct {
	service.UsageBillingRepository
	mu        sync.Mutex
	rows      map[string]service.NativeVideoSettlement
	states    map[string]string
	failStore bool
}

func (r *nativeHandlerRepo) StoreNativeVideoSettlement(_ context.Context, t *service.NativeVideoSettlement) error {
	if err := t.Validate(); err != nil {
		return err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.failStore {
		return errors.New("database unavailable")
	}
	r.rows[t.TaskID] = *t
	if t.Submitting() {
		r.states[t.TaskID] = "submitting"
	} else {
		r.states[t.TaskID] = "pending"
		delete(r.rows, t.SubmissionID)
		delete(r.states, t.SubmissionID)
	}
	return nil
}
func (r *nativeHandlerRepo) DiscardNativeVideoSubmission(_ context.Context, id string, _ int64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.states[id] == "submitting" {
		delete(r.rows, id)
		delete(r.states, id)
	}
	return nil
}
func (r *nativeHandlerRepo) HasNativeVideoSettlement(_ context.Context, id string, _ int64) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.states[id]
	return ok && s != "submitting", nil
}
func (*nativeHandlerRepo) DueNativeVideoSettlements(context.Context, int) ([]service.NativeVideoSettlement, error) {
	return nil, nil
}
func (*nativeHandlerRepo) RescheduleNativeVideoSettlement(context.Context, string, int64, time.Duration, string) error {
	return nil
}
func (*nativeHandlerRepo) FinishNativeVideoSettlement(context.Context, string, int64, string, string) error {
	return nil
}
func (*nativeHandlerRepo) StageUsageBilling(context.Context, *service.UsageBillingCommand, *service.UsageLog) error {
	return errors.New("handler tests never charge")
}
func (*nativeHandlerRepo) ApplyStagedUsageBilling(context.Context, service.UsageBillingEventKey) (*service.UsageBillingRecovery, error) {
	return nil, errors.New("handler tests never charge")
}
func (*nativeHandlerRepo) PendingUsageBilling(context.Context, int) ([]service.UsageBillingEventKey, error) {
	return nil, nil
}
func (*nativeHandlerRepo) AcknowledgeUsageBillingCache(context.Context, service.UsageBillingEventKey) error {
	return nil
}

// The legacy slot fixture runs in simple mode; durable settlement needs the
// standard gateway, while admission checks stay relaxed in the billing cache.
func newNativeVideoHandler(t *testing.T) (*OpenAIGatewayHandler, *nativeHandlerRepo, *grokMediaSlotBindings, *grokMediaSlotUpstream) {
	t.Helper()
	_, _, bindings, upstream := newGrokMediaSlotHandler(t, false, false)
	concurrency := service.NewConcurrencyService(&grokMediaSlotsCache{accounts: map[string]int64{}, users: map[string]int64{}})
	repo := &nativeHandlerRepo{rows: map[string]service.NativeVideoSettlement{}, states: map[string]string{}}
	accounts := make([]service.Account, 3)
	for i := range accounts {
		accounts[i] = service.Account{ID: int64(i + 1), Platform: service.PlatformGrok, Type: service.AccountTypeAPIKey,
			Status: service.StatusActive, Schedulable: true, Concurrency: 50, Priority: i,
			GroupIDs: []int64{24}, Credentials: map[string]any{"api_key": "test-key"}}
	}
	accountRepo := grokMediaSlotRepo{openAIImagesFailoverAccountRepo: openAIImagesFailoverAccountRepo{accounts: accounts}}
	cfg := &config.Config{RunMode: config.RunModeStandard}
	cfg.Gateway.Scheduling.StickySessionWaitTimeout = 20 * time.Millisecond
	gateway := service.NewOpenAIGatewayService(accountRepo, nil, nil, repo, nil, nil, nil, bindings, cfg, nil, concurrency,
		nil, nil, nil, upstream, nil, nil, service.NewGrokTokenProvider(accountRepo, nil), nil, nil, nil, nil, nil)
	groupID := int64(24)
	require.NoError(t, gateway.BindGrokMediaVideoRequestAccount(context.Background(), &groupID, "task", 10, 20, 1))
	simple := &config.Config{RunMode: config.RunModeSimple}
	billing := service.NewBillingCacheService(nil, nil, nil, nil, nil, nil, simple, nil)
	t.Cleanup(billing.Stop)
	h := NewOpenAIGatewayHandler(gateway, concurrency, billing, service.NewAPIKeyService(nil, nil, nil, nil, nil, nil, simple), nil, nil, nil, nil, simple)
	return h, repo, bindings, upstream
}

func TestNativeGrokVideoCreatePersistsDurableSettlement(t *testing.T) {
	h, repo, bindings, upstream := newNativeVideoHandler(t)
	var intentSeen bool
	upstream.call = func(req *http.Request, _ int64) (*http.Response, error) {
		repo.mu.Lock()
		for _, s := range repo.states {
			intentSeen = intentSeen || s == "submitting"
		}
		repo.mu.Unlock()
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{"request_id":"task"}`))}, nil
	}
	c, w := grokMediaSlotContext(context.Background(), true)
	// Creator tasks too: new native tasks bill on upstream success.
	c.Request.Header.Set("X-Sub2API-Creator", "video")
	h.GrokVideoGeneration(c)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.True(t, intentSeen, "the intent is committed before the generation POST")
	require.Equal(t, "pending", repo.states["task"])
	row := repo.rows["task"]
	require.Equal(t, service.NativeVideoKindGrok, row.Kind)
	require.Equal(t, int64(24), row.GroupID)
	require.Equal(t, int64(10), row.UserID)
	require.Equal(t, 6, row.Pending.VideoDurationSeconds)
	require.False(t, row.Pending.BillOnContent)
	require.Len(t, repo.states, 1, "the intent was replaced by the bound task")
	require.Empty(t, bindings.billed, "creating a task never charges")
}

func TestNativeVideoCreateFailsClosedWithoutDurableIntent(t *testing.T) {
	h, repo, _, upstream := newNativeVideoHandler(t)
	repo.failStore = true
	c, w := grokMediaSlotContext(context.Background(), true)
	h.GrokVideoGeneration(c)
	require.Equal(t, http.StatusServiceUnavailable, w.Code)
	require.Zero(t, upstream.calls, "no generation is submitted that could not be billed")
}

func TestNativeVideoRejectedCreateDiscardsIntent(t *testing.T) {
	h, repo, _, upstream := newNativeVideoHandler(t)
	upstream.call = func(*http.Request, int64) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusBadRequest, Header: http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{"error":{"message":"bad prompt"}}`))}, nil
	}
	c, w := grokMediaSlotContext(context.Background(), true)
	h.GrokVideoGeneration(c)
	require.NotEqual(t, http.StatusOK, w.Code)
	require.Empty(t, repo.states, "a rejected submission leaves no row")
}

func TestNativeVideoPollsNeverChargeDurableTasks(t *testing.T) {
	h, repo, bindings, upstream := newNativeVideoHandler(t)
	repo.states["task"] = "pending"
	upstream.call = func(*http.Request, int64) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{"status":"done","video":{"url":"https://vidgen.x.ai/task.mp4","duration":6}}`))}, nil
	}
	for range 3 {
		c, w := grokMediaSlotContext(context.Background(), false)
		h.GrokVideoStatus(c)
		require.Equal(t, http.StatusOK, w.Code)
	}
	require.Empty(t, bindings.billed, "the settlement worker alone bills durable tasks")

	// A task created before this build has no row and keeps the legacy poll billing.
	delete(repo.states, "task")
	c, _ := grokMediaSlotContext(context.Background(), false)
	key, ok := middleware2.GetAPIKeyFromContext(c)
	require.True(t, ok)
	require.NoError(t, h.gatewayService.StoreGrokVideoPendingBilling(context.Background(), "task", 10, key.ID, service.GrokVideoPendingBilling{
		Model: "grok-imagine-video", VideoResolution: "720p", VideoDurationSeconds: 6}))
	h.GrokVideoStatus(c)
	require.Len(t, bindings.billed, 1)
}
