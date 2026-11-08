package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"go.uber.org/zap"
)

// Native Grok videos and Seedance Ark tasks are priced at completion (Grok by
// resolution × seconds, Ark by completion tokens), so unlike relay jobs no
// money snapshot can be captured at creation. A durable row is written before
// the generation POST, bound to the upstream task ID on acceptance, and the
// settlement worker polls the bound account and bills on confirmed upstream
// success, whether or not the client ever polls. Client polls never bill these
// tasks; usage_billing_dedup on the stable task request ID is the backstop.
//
// Rows live in their own table: older binaries only read
// relay_video_settlements and fall back to their Redis-based poll billing.

const (
	NativeVideoKindGrok = "grok"
	NativeVideoKindArk  = "ark"

	nativeVideoSubmissionPrefix = NativeVideoSubmissionPrefix
	// Same horizon as the Redis pending snapshot: past it the task outcome is
	// left to manual review instead of guessed.
	nativeVideoSettlementLifetime = 24 * time.Hour
	nativeVideoRetryMin           = 30 * time.Second
	nativeVideoRetryMax           = 10 * time.Minute
	nativeVideoBatch              = 8
	nativeVideoTaskTimeout        = 15 * time.Second
)

// NativeVideoSettlement is the immutable billing context of one native task.
// It contains no prompt, credential or output URL.
type NativeVideoSettlement struct {
	SubmissionID     string                  `json:"submission_id"`
	TaskID           string                  `json:"task_id"`
	Kind             string                  `json:"kind"`
	UserID           int64                   `json:"user_id"`
	APIKeyID         int64                   `json:"api_key_id"`
	GroupID          int64                   `json:"group_id"`
	AccountID        int64                   `json:"account_id"`
	Pending          GrokVideoPendingBilling `json:"pending"`
	QuotaPlatform    string                  `json:"quota_platform,omitempty"`
	InboundEndpoint  string                  `json:"inbound_endpoint,omitempty"`
	UpstreamEndpoint string                  `json:"upstream_endpoint,omitempty"`
	UserAgent        string                  `json:"user_agent,omitempty"`
	IPAddress        string                  `json:"ip_address,omitempty"`
	SessionID        string                  `json:"session_id,omitempty"`

	// Row metadata, not part of the payload.
	Attempts  int       `json:"-"`
	CreatedAt time.Time `json:"-"`
}

// NativeVideoKindForEndpoint reports which native settlement a create belongs to.
func NativeVideoKindForEndpoint(endpoint GrokMediaEndpoint) string {
	switch endpoint {
	case SeedanceEndpointCreate:
		return NativeVideoKindArk
	case GrokMediaEndpointVideosGenerations, GrokMediaEndpointVideosEdits, GrokMediaEndpointVideosExtensions:
		return NativeVideoKindGrok
	}
	return ""
}

// NewNativeVideoSubmissionID returns the placeholder task ID of an unbound intent.
func NewNativeVideoSubmissionID(unique string) string {
	return nativeVideoSubmissionPrefix + strings.TrimSpace(unique)
}

// Submitting reports whether the row is a pre-POST intent without a task ID.
func (t *NativeVideoSettlement) Submitting() bool {
	return t != nil && t.TaskID == t.SubmissionID
}

func (t *NativeVideoSettlement) Validate() error {
	if t == nil || (t.Kind != NativeVideoKindGrok && t.Kind != NativeVideoKindArk) {
		return errors.New("invalid native video settlement kind")
	}
	if !strings.HasPrefix(t.SubmissionID, nativeVideoSubmissionPrefix) || len(t.SubmissionID) > 244 ||
		strings.TrimPrefix(t.SubmissionID, nativeVideoSubmissionPrefix) == "" {
		return errors.New("invalid native video submission identity")
	}
	if t.TaskID == "" || len(t.TaskID) > 244 || t.TaskID != strings.TrimSpace(t.TaskID) {
		return errors.New("invalid native video task")
	}
	if !t.Submitting() {
		raw := t.TaskID
		if t.Kind == NativeVideoKindArk {
			if !strings.HasPrefix(raw, "seedance:") {
				return errors.New("invalid native video task")
			}
			raw = strings.TrimPrefix(raw, "seedance:")
		} else if strings.HasPrefix(raw, "seedance:") || strings.HasPrefix(raw, nativeVideoSubmissionPrefix) ||
			strings.HasPrefix(raw, "seedance-video:") || strings.HasPrefix(raw, "minimax-h3:") {
			return errors.New("invalid native video task")
		}
		if raw == "" || validateUpstreamPathSegment("video ID", raw) != nil {
			return errors.New("invalid native video task")
		}
		if strings.TrimSpace(t.Pending.Model) == "" {
			return errors.New("invalid native video billing model")
		}
	}
	if t.UserID <= 0 || t.APIKeyID <= 0 || t.GroupID <= 0 || t.AccountID <= 0 {
		return errors.New("invalid native video billing owner")
	}
	if _, err := time.Parse(time.RFC3339Nano, t.Pending.CreatedAt); err != nil {
		return errors.New("invalid native video acceptance time")
	}
	if t.Pending.MiniMaxH3BaseCost != nil || t.Pending.BillOnContent || t.Pending.DurableRelay {
		return errors.New("invalid native video billing snapshot")
	}
	for _, v := range []string{t.QuotaPlatform, t.InboundEndpoint, t.UpstreamEndpoint, t.IPAddress, t.SessionID, t.UserAgent} {
		if len(v) > 512 {
			return errors.New("invalid native video request metadata")
		}
	}
	return nil
}

type NativeVideoSettlementRepository interface {
	StoreNativeVideoSettlement(context.Context, *NativeVideoSettlement) error
	DiscardNativeVideoSubmission(ctx context.Context, submissionID string, keyID int64) error
	HasNativeVideoSettlement(ctx context.Context, taskID string, keyID int64) (bool, error)
	DueNativeVideoSettlements(ctx context.Context, limit int) ([]NativeVideoSettlement, error)
	RescheduleNativeVideoSettlement(ctx context.Context, taskID string, keyID int64, after time.Duration, lastError string) error
	FinishNativeVideoSettlement(ctx context.Context, taskID string, keyID int64, state, note string) error
}

// VideoBillingKeyLoader rebuilds the key, owner and group an accepted task bills to.
type VideoBillingKeyLoader interface {
	LoadVideoBillingKey(ctx context.Context, keyID, userID, groupID int64) (*APIKey, error)
}

func (s *OpenAIGatewayService) nativeVideoRepo() (NativeVideoSettlementRepository, bool) {
	if s == nil || s.regionalMetering != nil || (s.cfg != nil && s.cfg.RunMode == "simple") {
		return nil, false
	}
	repo, ok := s.usageBillingRepo.(NativeVideoSettlementRepository)
	if !ok {
		return nil, false
	}
	if _, durable := s.usageBillingRepo.(DurableUsageBillingRepository); !durable {
		return nil, false
	}
	return repo, true
}

// HasNativeVideoSettlementStore reports whether native video tasks settle durably.
func (s *OpenAIGatewayService) HasNativeVideoSettlementStore() bool {
	_, ok := s.nativeVideoRepo()
	return ok
}

// PrepareNativeVideoSettlement commits the submission intent before the
// generation POST. Failure must block the POST: an accepted task without a
// durable row could never be billed.
func (s *OpenAIGatewayService) PrepareNativeVideoSettlement(ctx context.Context, intent *NativeVideoSettlement) error {
	repo, ok := s.nativeVideoRepo()
	if !ok {
		return errors.New("native video settlement unavailable")
	}
	intent.TaskID = intent.SubmissionID
	intent.Pending.BillOnContent, intent.Pending.DurableRelay, intent.Pending.MiniMaxH3BaseCost = false, false, nil
	if err := intent.Validate(); err != nil {
		return err
	}
	return repo.StoreNativeVideoSettlement(ctx, intent)
}

// DiscardNativeVideoSubmission removes an intent whose POST was not accepted.
func (s *OpenAIGatewayService) DiscardNativeVideoSubmission(ctx context.Context, intent *NativeVideoSettlement) error {
	repo, ok := s.nativeVideoRepo()
	if !ok || intent == nil {
		return nil
	}
	return repo.DiscardNativeVideoSubmission(ctx, intent.SubmissionID, intent.APIKeyID)
}

// AcceptNativeVideoSettlement binds the accepted upstream task to its intent.
// pending carries the create-time pricing units (resolution, seconds, model).
func (s *OpenAIGatewayService) AcceptNativeVideoSettlement(ctx context.Context, intent *NativeVideoSettlement, taskID string, pending GrokVideoPendingBilling) error {
	if intent == nil {
		return errors.New("missing native video submission intent")
	}
	repo, ok := s.nativeVideoRepo()
	if !ok {
		return errors.New("native video settlement unavailable")
	}
	task := *intent
	task.TaskID = strings.TrimSpace(taskID)
	pending.BillOnContent, pending.DurableRelay, pending.MiniMaxH3BaseCost = false, false, nil
	pending.CreatedAt = firstNonEmpty(pending.CreatedAt, intent.Pending.CreatedAt)
	task.Pending = normalizeGrokVideoPendingBilling(pending)
	if err := task.Validate(); err != nil {
		return err
	}
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		if err = repo.StoreNativeVideoSettlement(ctx, &task); err == nil || errors.Is(err, ErrUsageBillingRequestConflict) {
			return err
		}
		select {
		case <-ctx.Done():
			return errors.Join(err, ctx.Err())
		case <-time.After(100 * time.Millisecond):
		}
	}
	return err
}

// IsNativeVideoSettled reports whether the worker owns billing for this task.
// Lookup errors count as owned: the worker bills it, a poll never guesses.
func (s *OpenAIGatewayService) IsNativeVideoSettled(ctx context.Context, taskID string, keyID int64) bool {
	repo, ok := s.nativeVideoRepo()
	if !ok || strings.TrimSpace(taskID) == "" {
		return false
	}
	owned, err := repo.HasNativeVideoSettlement(ctx, strings.TrimSpace(taskID), keyID)
	if err != nil {
		logger.L().Warn("native_video.settlement_lookup_failed", zap.String("task_id", taskID), zap.Int64("api_key_id", keyID), zap.Error(err))
		return true
	}
	return owned
}

type nativeVideoOutcome int

const (
	nativeVideoRunning nativeVideoOutcome = iota
	nativeVideoSucceeded
	nativeVideoFailed
	// Upstream success that cannot be priced (Ark without completion tokens).
	nativeVideoNeedsReview
)

// The worker reuses the client status forwarders, which write to a gin
// response; that response is discarded.
func nativeVideoStatusContext(ctx context.Context, path string) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "http://native-video-settlement.local"+path, nil)
	c.Request = req
	return c, recorder
}

// queryNativeVideo reads the accepted task from its bound account. It never
// submits generation or downloads output.
func (s *OpenAIGatewayService) queryNativeVideo(ctx context.Context, account *Account, task *NativeVideoSettlement) (nativeVideoOutcome, *OpenAIForwardResult, error) {
	ctx = WithHTTPUpstreamRedirectsDisabled(ctx)
	if task.Kind == NativeVideoKindArk {
		raw := strings.TrimPrefix(task.TaskID, "seedance:")
		c, recorder := nativeVideoStatusContext(ctx, "/api/v3/contents/generations/tasks/"+raw)
		status, err := s.ForwardSeedance(ctx, c, account, SeedanceEndpointStatus, task.TaskID, nil)
		if err != nil {
			return nativeVideoRunning, nil, err
		}
		body := recorder.Body.Bytes()
		if id := gjson.GetBytes(body, "id").String(); id != "" && id != raw {
			return nativeVideoRunning, nil, errors.New("seedance status task mismatch")
		}
		switch strings.ToLower(strings.TrimSpace(gjson.GetBytes(body, "status").String())) {
		case "succeeded":
			if status != nil && status.Usage.OutputTokens > 0 {
				return nativeVideoSucceeded, MergeSeedanceCompletion(status, &task.Pending, task.TaskID), nil
			}
			return nativeVideoNeedsReview, nil, nil
		case "failed", "expired", "cancelled", "canceled":
			return nativeVideoFailed, nil, nil
		}
		return nativeVideoRunning, nil, nil
	}
	if account.Platform != PlatformGrok {
		return nativeVideoRunning, nil, fmt.Errorf("account %d cannot serve native Grok video", account.ID)
	}
	c, recorder := nativeVideoStatusContext(ctx, "/v1/videos/"+task.TaskID)
	status, err := s.ForwardGrokMedia(ctx, c, account, GrokMediaEndpointVideoStatus, task.TaskID, nil, "")
	if err != nil {
		return nativeVideoRunning, nil, err
	}
	body := recorder.Body.Bytes()
	if status != nil && status.VideoCount > 0 {
		merged := MergeGrokVideoCompletion(status, &task.Pending, task.TaskID)
		// Bill under the bound task ID whatever ID shape the status echoes.
		merged.ResponseID = task.TaskID
		merged.RequestID = StableGrokVideoBillingRequestID(task.TaskID)
		return nativeVideoSucceeded, merged, nil
	}
	switch strings.ToLower(strings.TrimSpace(gjson.GetBytes(body, "status").String())) {
	case "failed", "expired":
		return nativeVideoFailed, nil, nil
	}
	// Done without billable output (moderated, errored, no URL) is a failed
	// generation; client polls never charged it either.
	if isOfficialGrokVideoStatusDone(body) {
		return nativeVideoFailed, nil, nil
	}
	return nativeVideoRunning, nil, nil
}

func (s *OpenAIGatewayService) billNativeVideo(ctx context.Context, loader VideoBillingKeyLoader, account *Account, task *NativeVideoSettlement, result *OpenAIForwardResult) error {
	apiKey, err := loader.LoadVideoBillingKey(ctx, task.APIKeyID, task.UserID, task.GroupID)
	if err != nil {
		return fmt.Errorf("load billing key: %w", err)
	}
	var subscription *UserSubscription
	if apiKey.Group != nil && apiKey.Group.IsSubscriptionType() {
		if s.userSubRepo == nil {
			return errors.New("subscription lookup unavailable")
		}
		if subscription, err = s.userSubRepo.GetActiveByUserIDAndGroupID(ctx, task.UserID, task.GroupID); err != nil {
			return fmt.Errorf("load subscription: %w", err)
		}
	}
	quota, _ := loader.(APIKeyQuotaUpdater)
	return s.RecordUsage(ctx, &OpenAIRecordUsageInput{
		Result: result, APIKey: apiKey, User: apiKey.User, Account: account, Subscription: subscription,
		InboundEndpoint: task.InboundEndpoint, UpstreamEndpoint: task.UpstreamEndpoint,
		UserAgent: task.UserAgent, IPAddress: task.IPAddress, SessionID: task.SessionID,
		// Same fingerprint input as a client status poll of this task.
		RequestPayloadHash: HashUsageRequestPayload([]byte(task.TaskID)),
		APIKeyService:      quota,
		QuotaPlatform:      task.QuotaPlatform,
		ChannelUsageFields: ChannelUsageFields{
			OriginalModel:      firstNonEmpty(task.Pending.OriginalModel, result.Model),
			ChannelMappedModel: firstNonEmpty(task.Pending.Model, result.Model),
		},
	})
}

func nativeVideoRetryDelay(created, now time.Time) time.Duration {
	delay := time.Duration(0)
	if !created.IsZero() && now.After(created) {
		delay = now.Sub(created) / 10
	}
	if delay < nativeVideoRetryMin {
		return nativeVideoRetryMin
	}
	if delay > nativeVideoRetryMax {
		return nativeVideoRetryMax
	}
	return delay
}

func truncateNativeVideoNote(note string) string {
	if len(note) > 500 {
		return note[:500]
	}
	return note
}

// settleNativeVideo returns the row state it left behind.
func (s *OpenAIGatewayService) settleNativeVideo(ctx context.Context, repo NativeVideoSettlementRepository, loader VideoBillingKeyLoader, task *NativeVideoSettlement) (string, error) {
	now := time.Now()
	created := task.CreatedAt
	if created.IsZero() {
		created, _ = time.Parse(time.RFC3339Nano, task.Pending.CreatedAt)
	}
	expired := !created.IsZero() && now.Sub(created) > nativeVideoSettlementLifetime
	retry := func(cause error) (string, error) {
		note := truncateNativeVideoNote(cause.Error())
		if expired {
			return "review", repo.FinishNativeVideoSettlement(ctx, task.TaskID, task.APIKeyID, "review", "unsettled at deadline: "+note)
		}
		return "pending", errors.Join(cause, repo.RescheduleNativeVideoSettlement(ctx, task.TaskID, task.APIKeyID, nativeVideoRetryDelay(created, now), note))
	}
	account, err := s.accountRepo.GetByID(ctx, task.AccountID)
	if err != nil || account == nil {
		return retry(errors.Join(errors.New("bound video account unavailable"), err))
	}
	outcome, result, err := s.queryNativeVideo(ctx, account, task)
	if err != nil {
		return retry(fmt.Errorf("status lookup: %w", err))
	}
	switch outcome {
	case nativeVideoFailed:
		return "failed", repo.FinishNativeVideoSettlement(ctx, task.TaskID, task.APIKeyID, "failed", "upstream reported failure")
	case nativeVideoNeedsReview:
		return "review", repo.FinishNativeVideoSettlement(ctx, task.TaskID, task.APIKeyID, "review", "upstream succeeded without completion tokens")
	case nativeVideoRunning:
		if expired {
			return retry(errors.New("upstream task not finished"))
		}
		return "pending", repo.RescheduleNativeVideoSettlement(ctx, task.TaskID, task.APIKeyID, nativeVideoRetryDelay(created, now), "")
	}
	if loader == nil {
		return retry(errors.New("billing key loader unavailable"))
	}
	err = s.billNativeVideo(ctx, loader, account, task, result)
	note := ""
	if errors.Is(err, ErrUsageBillingRequestConflict) {
		// The stable task request ID was already charged with another
		// fingerprint (an older binary's poll); never charge it twice.
		note, err = "already billed under the task request ID", nil
	}
	if err != nil {
		return retry(fmt.Errorf("record usage: %w", err))
	}
	// Older binaries' poll paths only consult this claim; best effort.
	if s.cache != nil {
		_, _ = s.ClaimGrokVideoBilling(ctx, task.TaskID, task.UserID, task.APIKeyID)
	}
	return "complete", repo.FinishNativeVideoSettlement(ctx, task.TaskID, task.APIKeyID, "complete", note)
}

func (s *OpenAIGatewayService) recoverNativeVideos(ctx context.Context, auth APIKeyAuthCacheInvalidator) error {
	repo, ok := s.nativeVideoRepo()
	if !ok {
		return nil
	}
	loader, _ := auth.(VideoBillingKeyLoader)
	tasks, err := repo.DueNativeVideoSettlements(ctx, nativeVideoBatch)
	if err != nil {
		return err
	}
	for i := range tasks {
		task := &tasks[i]
		if ctx.Err() != nil {
			return ctx.Err()
		}
		cycle, cancel := context.WithTimeout(ctx, nativeVideoTaskTimeout)
		state, settleErr := s.settleNativeVideo(cycle, repo, loader, task)
		cancel()
		log := logger.L().With(zap.String("task_id", task.TaskID), zap.Int64("api_key_id", task.APIKeyID), zap.String("kind", task.Kind))
		switch {
		case settleErr != nil:
			log.Warn("native_video.settlement_retry", zap.String("state", state), zap.Int("attempts", task.Attempts), zap.Error(settleErr))
		case state == "review":
			log.Error("native_video.settlement_review")
		case state != "pending":
			log.Info("native_video.settled", zap.String("state", state))
		}
	}
	return nil
}

// LoadVideoBillingKey rebuilds the billing context of an accepted video task.
// The task was admitted at creation, so admission rules are not re-checked; a
// key deleted after submission still bills its owner.
func (s *APIKeyService) LoadVideoBillingKey(ctx context.Context, keyID, userID, groupID int64) (*APIKey, error) {
	if s == nil || s.apiKeyRepo == nil || s.groupRepo == nil || s.userRepo == nil {
		return nil, errors.New("video billing key loader unavailable")
	}
	key, err := s.apiKeyRepo.GetByID(ctx, keyID)
	if errors.Is(err, ErrAPIKeyNotFound) {
		key, err = &APIKey{ID: keyID, UserID: userID}, nil
	}
	if err != nil {
		return nil, err
	}
	if key.UserID != userID {
		return nil, ErrUsageBillingRequestConflict
	}
	copyKey := *key
	if copyKey.User == nil || copyKey.User.ID != userID {
		if copyKey.User, err = s.userRepo.GetByID(ctx, userID); err != nil {
			return nil, fmt.Errorf("load video billing user: %w", err)
		}
	}
	if copyKey.Group == nil || copyKey.Group.ID != groupID {
		if copyKey.Group, err = s.groupRepo.GetByIDLite(ctx, groupID); err != nil {
			return nil, fmt.Errorf("load video billing group: %w", err)
		}
	}
	id := groupID
	copyKey.GroupID = &id
	return &copyKey, nil
}
