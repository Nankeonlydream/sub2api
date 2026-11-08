package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
)

// Native video tasks the settlement worker could not price (status unreadable
// at the deadline, Ark success without tokens, a POST whose task ID was never
// bound) wait in review. Admins list them and either retry the upstream
// lookup, charge them from the create-time snapshot, or dismiss them. Every
// charge goes through the same stable task request ID as the worker, so no
// action can bill a task twice.

const NativeVideoSubmissionPrefix = "native-video-submission:"

// The largest completion-token count an admin may enter for one Ark task.
const nativeVideoReviewMaxTokens = 10_000_000

var (
	ErrNativeVideoReviewNotFound      = infraerrors.NotFound("NATIVE_VIDEO_REVIEW_NOT_FOUND", "video settlement is not waiting for review")
	ErrNativeVideoReviewUnsettleable  = infraerrors.BadRequest("NATIVE_VIDEO_REVIEW_UNSETTLEABLE", "this record has no upstream task to query or charge; it can only be dismissed")
	ErrNativeVideoReviewMissingUnits  = infraerrors.BadRequest("NATIVE_VIDEO_REVIEW_MISSING_UNITS", "the create request recorded no resolution or duration to price")
	ErrNativeVideoReviewInvalidTokens = infraerrors.BadRequest("NATIVE_VIDEO_REVIEW_INVALID_TOKENS", "Ark charges need a completion token count")
	ErrNativeVideoReviewUnavailable   = infraerrors.ServiceUnavailable("NATIVE_VIDEO_REVIEW_UNAVAILABLE", "durable video settlement is not enabled")
)

// NativeVideoReview is one task waiting for an admin decision.
type NativeVideoReview struct {
	TaskID               string    `json:"task_id"`
	APIKeyID             int64     `json:"api_key_id"`
	UserID               int64     `json:"user_id"`
	UserEmail            string    `json:"user_email"`
	AccountID            int64     `json:"account_id"`
	GroupID              int64     `json:"group_id"`
	Kind                 string    `json:"kind"`
	Model                string    `json:"model"`
	VideoResolution      string    `json:"video_resolution"`
	VideoDurationSeconds int       `json:"video_duration_seconds"`
	Attempts             int       `json:"attempts"`
	Reason               string    `json:"reason"`
	CreatedAt            time.Time `json:"created_at"`
	ReviewedAt           time.Time `json:"reviewed_at"`
	// No upstream task ID was ever bound: it can only be dismissed.
	Submitting bool `json:"submitting"`
}

type NativeVideoReviewRepository interface {
	ListNativeVideoReviews(ctx context.Context, limit, offset int) ([]NativeVideoReview, int, error)
	CountNativeVideoReviews(ctx context.Context) (int, error)
	ClaimNativeVideoReview(ctx context.Context, taskID string, keyID int64, check func(*NativeVideoSettlement) error) (*NativeVideoSettlement, error)
	ResolveNativeVideoReview(ctx context.Context, taskID string, keyID int64, state, note string) error
}

func (s *OpenAIGatewayService) nativeVideoReviewRepo() (NativeVideoSettlementRepository, NativeVideoReviewRepository, error) {
	repo, ok := s.nativeVideoRepo()
	if !ok {
		return nil, nil, ErrNativeVideoReviewUnavailable
	}
	review, ok := s.usageBillingRepo.(NativeVideoReviewRepository)
	if !ok {
		return nil, nil, ErrNativeVideoReviewUnavailable
	}
	return repo, review, nil
}

func (s *OpenAIGatewayService) ListNativeVideoReviews(ctx context.Context, page, pageSize int) ([]NativeVideoReview, int, error) {
	_, review, err := s.nativeVideoReviewRepo()
	if err != nil {
		return []NativeVideoReview{}, 0, nil
	}
	return review.ListNativeVideoReviews(ctx, pageSize, (page-1)*pageSize)
}

// CountNativeVideoReviews is 0 where durable settlement is not enabled.
func (s *OpenAIGatewayService) CountNativeVideoReviews(ctx context.Context) (int, error) {
	_, review, err := s.nativeVideoReviewRepo()
	if err != nil {
		return 0, nil
	}
	return review.CountNativeVideoReviews(ctx)
}

// RetryNativeVideoReview queries the upstream once more and settles on the
// answer. A task still running goes back to the worker until its deadline.
func (s *OpenAIGatewayService) RetryNativeVideoReview(ctx context.Context, loader VideoBillingKeyLoader, taskID string, keyID int64) (string, error) {
	repo, review, err := s.nativeVideoReviewRepo()
	if err != nil {
		return "", err
	}
	task, err := review.ClaimNativeVideoReview(ctx, taskID, keyID, nil)
	if err != nil {
		return "", err
	}
	cycle, cancel := context.WithTimeout(context.WithoutCancel(ctx), nativeVideoTaskTimeout)
	defer cancel()
	return s.settleNativeVideo(cycle, repo, loader, task)
}

// ChargeNativeVideoReview bills a reviewed task without asking the upstream:
// Grok from the create-time resolution × seconds, Ark from the completion
// tokens the admin read off the provider console.
func (s *OpenAIGatewayService) ChargeNativeVideoReview(ctx context.Context, loader VideoBillingKeyLoader, taskID string, keyID int64, outputTokens int, actor string) error {
	repo, review, err := s.nativeVideoReviewRepo()
	if err != nil {
		return err
	}
	if loader == nil {
		return ErrNativeVideoReviewUnavailable
	}
	var account *Account
	task, err := review.ClaimNativeVideoReview(ctx, taskID, keyID, func(t *NativeVideoSettlement) error {
		switch t.Kind {
		case NativeVideoKindGrok:
			if strings.TrimSpace(t.Pending.VideoResolution) == "" || t.Pending.VideoDurationSeconds <= 0 {
				return ErrNativeVideoReviewMissingUnits
			}
		case NativeVideoKindArk:
			if outputTokens <= 0 || outputTokens > nativeVideoReviewMaxTokens {
				return ErrNativeVideoReviewInvalidTokens
			}
		}
		found, lookupErr := s.accountRepo.GetByID(ctx, t.AccountID)
		if lookupErr != nil || found == nil {
			return infraerrors.BadRequest("NATIVE_VIDEO_REVIEW_ACCOUNT_GONE", fmt.Sprintf("bound account %d no longer exists; dismiss the task instead", t.AccountID))
		}
		account = found
		return nil
	})
	if err != nil {
		return err
	}
	var result *OpenAIForwardResult
	if task.Kind == NativeVideoKindArk {
		status := &OpenAIForwardResult{Model: task.Pending.Model, BillingModel: firstNonEmpty(task.Pending.BillingModel, task.Pending.Model)}
		status.Usage.OutputTokens = outputTokens
		result = MergeSeedanceCompletion(status, &task.Pending, task.TaskID)
	} else {
		result = MergeGrokVideoCompletion(&OpenAIForwardResult{VideoCount: 1, ResponseID: task.TaskID}, &task.Pending, task.TaskID)
		result.ResponseID = task.TaskID
		result.RequestID = StableGrokVideoBillingRequestID(task.TaskID)
	}
	// The claim is held; finish it even if the admin's request goes away.
	ctx = context.WithoutCancel(ctx)
	note := "charged by admin " + actor
	err = s.billNativeVideo(ctx, loader, account, task, result)
	if errors.Is(err, ErrUsageBillingRequestConflict) {
		note, err = "already billed under the task request ID; closed by admin "+actor, nil
	}
	if err != nil {
		return errors.Join(err, repo.FinishNativeVideoSettlement(ctx, task.TaskID, task.APIKeyID, "review",
			truncateNativeVideoNote("admin charge failed: "+err.Error())))
	}
	if s.cache != nil {
		_, _ = s.ClaimGrokVideoBilling(ctx, task.TaskID, task.UserID, task.APIKeyID)
	}
	return repo.FinishNativeVideoSettlement(ctx, task.TaskID, task.APIKeyID, "complete", note)
}

// DismissNativeVideoReview closes a reviewed task without charging.
func (s *OpenAIGatewayService) DismissNativeVideoReview(ctx context.Context, taskID string, keyID int64, actor, reason string) error {
	_, review, err := s.nativeVideoReviewRepo()
	if err != nil {
		return err
	}
	note := "dismissed by admin " + actor
	if reason = strings.TrimSpace(reason); reason != "" {
		note += ": " + reason
	}
	return review.ResolveNativeVideoReview(ctx, taskID, keyID, "failed", truncateNativeVideoNote(note))
}
