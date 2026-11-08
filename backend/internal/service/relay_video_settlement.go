package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
	"github.com/tidwall/gjson"
	"go.uber.org/zap"
)

// The immutable billing snapshot contains no prompt, credentials or output URL.
type RelayVideoSettlement struct {
	SubmissionID string                  `json:"submission_id"`
	TaskID       string                  `json:"task_id"`
	Pending      GrokVideoPendingBilling `json:"pending"`
	Event        UsageBillingEvent       `json:"event"`
}

func (t *RelayVideoSettlement) Validate() error {
	if t == nil || len(t.TaskID) > 244 || (!strings.HasPrefix(t.TaskID, "seedance-video:") && !strings.HasPrefix(t.TaskID, "minimax-h3:")) {
		return errors.New("invalid relay settlement task")
	}
	rawID := strings.TrimPrefix(strings.TrimPrefix(t.TaskID, "seedance-video:"), "minimax-h3:")
	if validateUpstreamPathSegment("video ID", rawID) != nil || t.SubmissionID == "" || len(t.SubmissionID) > 244 {
		return errors.New("invalid relay submission identity")
	}
	if _, err := time.Parse(time.RFC3339Nano, t.Pending.CreatedAt); err != nil {
		return errors.New("invalid relay acceptance time")
	}
	c, u := &t.Event.Command, &t.Event.Usage
	if t.Event.Version != 1 || t.Pending.MiniMaxH3BaseCost == nil || c.UserID <= 0 || c.APIKeyID <= 0 || c.AccountID <= 0 ||
		c.RequestID != StableGrokVideoBillingRequestID(t.TaskID) || u.RequestID != c.RequestID || u.UserID != c.UserID || u.APIKeyID != c.APIKeyID || u.AccountID != c.AccountID || u.VideoCount != 1 ||
		u.CreatedAt.IsZero() || strings.TrimSpace(u.Model) == "" || t.Pending.VideoDurationSeconds <= 0 ||
		u.User != nil || u.APIKey != nil || u.Account != nil || u.Group != nil || u.Subscription != nil {
		return errors.New("invalid relay billing snapshot")
	}
	for _, amount := range []float64{*t.Pending.MiniMaxH3BaseCost, c.BalanceCost, c.SubscriptionCost, c.APIKeyQuotaCost, c.APIKeyRateLimitCost, c.AccountQuotaCost, c.PlatformQuotaCost, u.ActualCost, u.TotalCost} {
		if math.IsNaN(amount) || math.IsInf(amount, 0) || amount < 0 {
			return errors.New("invalid relay billing amount")
		}
	}
	return nil
}

type RelayVideoSettlementRepository interface {
	StoreRelayVideoSettlement(context.Context, *RelayVideoSettlement) error
	LoadRelayVideoSettlement(context.Context, string, int64) (*RelayVideoSettlement, error)
	DueRelayVideoSettlements(context.Context, int) ([]RelayVideoSettlement, error)
	FinishRelayVideoSettlement(context.Context, string, int64, string) error
}

type relayVideoAcceptanceKey struct{}
type RelayVideoAcceptance struct {
	Prepare func(context.Context, *OpenAIForwardResult) error
	Accept  func(context.Context, *OpenAIForwardResult) error
}

// Called after upstream acceptance and before acknowledging success to the client.
func WithRelayVideoAcceptance(ctx context.Context, fn RelayVideoAcceptance) context.Context {
	return context.WithValue(ctx, relayVideoAcceptanceKey{}, fn)
}

func (s *OpenAIGatewayService) PersistRelayVideoSettlement(ctx context.Context, task *RelayVideoSettlement, input *OpenAIRecordUsageInput) error {
	if err := prepareRelayVideoSpool(); err != nil {
		return err
	}
	repo, ok := s.usageBillingRepo.(RelayVideoSettlementRepository)
	if !ok {
		return errors.New("durable relay video billing is unavailable")
	}
	// Capture the exact existing billing command, including subscription, key,
	// account and platform quotas, at creation; never reconstruct it after edits.
	input.relaySettlement = task
	if err := s.RecordUsage(ctx, input); err != nil {
		return err
	}
	if err := task.Validate(); err != nil {
		return err
	}
	return repo.StoreRelayVideoSettlement(ctx, task)
}

func (s *OpenAIGatewayService) HasRelayVideoSettlementStore() bool {
	if s == nil || s.regionalMetering != nil || (s.cfg != nil && s.cfg.RunMode == "simple") {
		return false
	}
	_, ok := s.usageBillingRepo.(RelayVideoSettlementRepository)
	return ok
}

// Admission is committed before POST. Acceptance only binds the returned ID;
// retries never call generation again and use the original monetary snapshot.
func (s *OpenAIGatewayService) AcceptRelayVideoSettlement(ctx context.Context, intent *RelayVideoSettlement, taskID string) error {
	if intent == nil {
		return errors.New("missing video submission intent")
	}
	task := *intent
	task.TaskID = taskID
	task.Event.Command.RequestID = StableGrokVideoBillingRequestID(taskID)
	task.Event.Command.RequestPayloadHash = HashUsageRequestPayload([]byte(taskID))
	task.Event.Command.RequestFingerprint = ""
	task.Event.Usage.RequestID = task.Event.Command.RequestID
	repo, ok := s.usageBillingRepo.(RelayVideoSettlementRepository)
	if !ok {
		return errors.New("video settlement unavailable")
	}
	var err error
	path, spoolErr := saveRelayVideoSpool(&task)
	for attempt := 0; attempt < 3; attempt++ {
		if err = repo.StoreRelayVideoSettlement(ctx, &task); err == nil {
			if path != "" {
				_ = os.Remove(path)
			}
			return nil
		}
		if errors.Is(err, ErrUsageBillingRequestConflict) {
			return errors.Join(err, spoolErr)
		}
		select {
		case <-ctx.Done():
			return errors.Join(err, ctx.Err())
		case <-time.After(100 * time.Millisecond):
		}
	}
	return errors.Join(err, spoolErr)
}

// Both background discovery and client status/content use this same immutable
// command and the existing durable billing journal. Redis is never the money lock.
func (s *OpenAIGatewayService) SettleRelayVideo(ctx context.Context, taskID string, userID, keyID int64, delivered bool, auth APIKeyAuthCacheInvalidator) (bool, error) {
	repo, ok := s.usageBillingRepo.(RelayVideoSettlementRepository)
	if !ok {
		return false, nil
	}
	task, err := repo.LoadRelayVideoSettlement(ctx, taskID, keyID)
	if err != nil {
		return true, err
	}
	if task == nil {
		return false, nil
	}
	if task.Event.Command.UserID != userID {
		return true, ErrUsageBillingRequestConflict
	}
	if task.Pending.BillOnContent && !delivered {
		return true, nil
	}
	return true, s.applyRelayVideoSettlement(ctx, repo, task, auth)
}

func (s *OpenAIGatewayService) applyRelayVideoSettlement(ctx context.Context, repo RelayVideoSettlementRepository, task *RelayVideoSettlement, auth APIKeyAuthCacheInvalidator) error {
	if err := task.Validate(); err != nil {
		return err
	}
	durable, ok := s.usageBillingRepo.(DurableUsageBillingRepository)
	if !ok {
		return errors.New("durable video billing unavailable")
	}
	duration := int(GrokVideoE2EDuration(task.Pending.CreatedAt, time.Now()).Milliseconds())
	task.Event.Usage.DurationMs = &duration
	if err := durable.StageUsageBilling(ctx, &task.Event.Command, &task.Event.Usage); err != nil {
		return err
	}
	key := UsageBillingEventKey{RequestID: task.Event.Command.RequestID, APIKeyID: task.Event.Command.APIKeyID}
	recovered, err := durable.ApplyStagedUsageBilling(ctx, key)
	if err != nil {
		return err
	}
	if err = invalidateDurableUsageBilling(ctx, recovered, s.billingCacheService, auth); err != nil {
		return err
	}
	if recovered != nil && recovered.NeedsCache {
		if err = durable.AcknowledgeUsageBillingCache(ctx, key); err != nil {
			return err
		}
	}
	return repo.FinishRelayVideoSettlement(ctx, task.TaskID, key.APIKeyID, "complete")
}

// Poll only the accepted upstream task. This never submits generation or downloads
// output. Redirects stay disabled, and the credential uses the bound account only.
func (s *OpenAIGatewayService) pollRelayVideoSettlement(ctx context.Context, task *RelayVideoSettlement) (string, error) {
	account, err := s.accountRepo.GetByID(ctx, task.Event.Command.AccountID)
	if err != nil {
		return "", err
	}
	if account == nil {
		return "", errors.New("bound video account unavailable")
	}
	relay := seedanceVideoRelay
	if strings.HasPrefix(task.TaskID, "minimax-h3:") {
		relay = miniMaxH3Relay
	}
	base, err := s.validateUpstreamBaseURL(account.GetCredential("base_url"))
	if err != nil {
		return "", err
	}
	target, err := relay.buildURL(base, relay.Status, strings.TrimPrefix(task.TaskID, relay.TaskPrefix))
	if err != nil {
		return "", err
	}
	token := strings.TrimSpace(account.GetCredential("api_key"))
	if token == "" {
		return "", errors.New("video account credential unavailable")
	}
	req, err := http.NewRequestWithContext(WithHTTPUpstreamRedirectsDisabled(ctx), http.MethodGet, target, nil)
	if err != nil {
		return "", err
	}
	account.ApplyHeaderOverrides(req.Header)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := s.httpUpstream.Do(req, relayAccountProxy(account), account.ID, account.Concurrency)
	if err != nil {
		return "", errors.New("video status transport failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("video status HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
	if err != nil {
		return "", err
	}
	if len(body) > 1<<20 || !gjson.ValidBytes(body) || !gjson.ParseBytes(body).IsObject() {
		return "", errors.New("invalid video status response")
	}
	id := gjson.GetBytes(body, "id").String()
	if id == "" {
		id = gjson.GetBytes(body, "task_id").String()
	}
	if id == "" || id != strings.TrimPrefix(task.TaskID, relay.TaskPrefix) {
		return "", errors.New("video status task mismatch")
	}
	if e := gjson.GetBytes(body, "error"); e.Exists() && e.Type != gjson.Null {
		return "failed", nil
	}
	if miniMaxH3StatusCompleted(body) {
		return "complete", nil
	}
	switch strings.ToLower(gjson.GetBytes(body, "status").String()) {
	case "failed", "cancelled", "canceled", "rejected":
		return "failed", nil
	}
	return "pending", nil
}

func (s *OpenAIGatewayService) recoverRelayVideos(ctx context.Context, auth APIKeyAuthCacheInvalidator) error {
	repo, ok := s.usageBillingRepo.(RelayVideoSettlementRepository)
	if !ok {
		return nil
	}
	if err := recoverRelayVideoSpool(ctx, repo); err != nil {
		logger.L().Warn("relay_video.spool_recovery_failed", zap.Error(err))
	}
	tasks, err := repo.DueRelayVideoSettlements(ctx, 8)
	if err != nil {
		return err
	}
	for i := range tasks {
		task := &tasks[i]
		if ctx.Err() != nil {
			return ctx.Err()
		}
		cycle, cancel := context.WithTimeout(ctx, 15*time.Second)
		state, pollErr := s.pollRelayVideoSettlement(cycle, task)
		if pollErr == nil {
			switch state {
			case "complete":
				pollErr = s.applyRelayVideoSettlement(cycle, repo, task, auth)
			case "failed":
				pollErr = repo.FinishRelayVideoSettlement(cycle, task.TaskID, task.Event.Command.APIKeyID, state)
			}
		}
		cancel()
		if pollErr != nil {
			logger.L().Warn("relay_video.settlement_retry", zap.String("task_id", task.TaskID), zap.Int64("api_key_id", task.Event.Command.APIKeyID), zap.Error(pollErr))
		}
	}
	return nil
}

// Join on the existing usage pool shutdown boundary. Only production wiring
// starts polling; constructors and tests do not perform financial background work.
func (p *UsageRecordWorkerPool) StartRelayVideoSettlement(s *OpenAIGatewayService, auth APIKeyAuthCacheInvalidator) {
	if p == nil || s == nil || !s.HasRelayVideoSettlementStore() || s.regionalMetering != nil {
		return
	}
	if s.cfg != nil && (!s.cfg.RunsBackgroundJobs() || s.cfg.RunMode == "simple") {
		return
	}
	p.relayVideoMu.Lock()
	defer p.relayVideoMu.Unlock()
	if p.relayVideoCancel != nil || p.relayVideoStopped {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	p.relayVideoCancel = cancel
	p.lifecycleWg.Add(1)
	go func() {
		defer p.lifecycleWg.Done()
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cycle, stop := context.WithTimeout(ctx, 2*time.Minute)
				if err := s.recoverRelayVideos(cycle, auth); err != nil && ctx.Err() == nil {
					logger.L().Warn("relay_video.recovery_failed", zap.Error(err))
				}
				stop()
				cycle, stop = context.WithTimeout(ctx, 2*time.Minute)
				if err := s.recoverNativeVideos(cycle, auth); err != nil && ctx.Err() == nil {
					logger.L().Warn("native_video.recovery_failed", zap.Error(err))
				}
				stop()
			}
		}
	}()
}
