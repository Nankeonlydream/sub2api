package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
)

var _ service.NativeVideoReviewRepository = (*usageBillingRepository)(nil)

func (r *usageBillingRepository) ListNativeVideoReviews(ctx context.Context, limit, offset int) ([]service.NativeVideoReview, int, error) {
	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT count(*) FROM native_video_settlements WHERE state='review'`).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx, `SELECT s.task_id,s.api_key_id,s.user_id,COALESCE(u.email,''),s.account_id,s.group_id,s.kind,
            s.payload,s.attempts,COALESCE(s.last_error,''),s.created_at,COALESCE(s.completed_at,s.created_at)
        FROM native_video_settlements s LEFT JOIN users u ON u.id=s.user_id
        WHERE s.state='review' ORDER BY s.completed_at DESC NULLS LAST, s.task_id LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = rows.Close() }()
	items := make([]service.NativeVideoReview, 0)
	for rows.Next() {
		var (
			item service.NativeVideoReview
			raw  []byte
		)
		if err = rows.Scan(&item.TaskID, &item.APIKeyID, &item.UserID, &item.UserEmail, &item.AccountID, &item.GroupID, &item.Kind,
			&raw, &item.Attempts, &item.Reason, &item.CreatedAt, &item.ReviewedAt); err != nil {
			return nil, 0, err
		}
		// A damaged payload is still listed so it can be dismissed.
		var task service.NativeVideoSettlement
		if json.Unmarshal(raw, &task) == nil {
			item.Model = firstNonBlank(task.Pending.OriginalModel, task.Pending.Model)
			item.VideoResolution = task.Pending.VideoResolution
			item.VideoDurationSeconds = task.Pending.VideoDurationSeconds
			item.Submitting = task.Submitting()
		}
		item.Submitting = item.Submitting || strings.HasPrefix(item.TaskID, service.NativeVideoSubmissionPrefix)
		items = append(items, item)
	}
	return items, total, rows.Err()
}

func (r *usageBillingRepository) CountNativeVideoReviews(ctx context.Context) (int, error) {
	var total int
	err := r.db.QueryRowContext(ctx, `SELECT count(*) FROM native_video_settlements WHERE state='review'`).Scan(&total)
	return total, err
}

// ClaimNativeVideoReview moves one reviewed task back to pending under a
// worker-length lease, so the periodic worker and other admins skip it while an
// admin action settles it. check runs before the claim; its error leaves the
// row and its review reason untouched.
func (r *usageBillingRepository) ClaimNativeVideoReview(ctx context.Context, taskID string, keyID int64, check func(*service.NativeVideoSettlement) error) (*service.NativeVideoSettlement, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var (
		raw     []byte
		created time.Time
	)
	err = tx.QueryRowContext(ctx, `SELECT payload,created_at FROM native_video_settlements
        WHERE task_id=$1 AND api_key_id=$2 AND state='review' FOR UPDATE`, taskID, keyID).Scan(&raw, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, service.ErrNativeVideoReviewNotFound
	}
	if err != nil {
		return nil, err
	}
	var task service.NativeVideoSettlement
	if json.Unmarshal(raw, &task) != nil || task.Validate() != nil || task.TaskID != taskID || task.APIKeyID != keyID {
		return nil, service.ErrNativeVideoReviewUnsettleable
	}
	if task.Submitting() {
		return nil, service.ErrNativeVideoReviewUnsettleable
	}
	if check != nil {
		if err = check(&task); err != nil {
			return nil, err
		}
	}
	if _, err = tx.ExecContext(ctx, `UPDATE native_video_settlements SET state='pending',completed_at=NULL,
        next_poll_at=NOW()+INTERVAL '2 minutes',attempts=attempts+1 WHERE task_id=$1 AND api_key_id=$2`, taskID, keyID); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	task.CreatedAt = created
	return &task, nil
}

// ResolveNativeVideoReview closes a reviewed row without billing.
func (r *usageBillingRepository) ResolveNativeVideoReview(ctx context.Context, taskID string, keyID int64, state, note string) error {
	if state != "failed" && state != "complete" {
		return errors.New("invalid native video review resolution")
	}
	res, err := r.db.ExecContext(ctx, `UPDATE native_video_settlements SET state=$3,completed_at=NOW(),last_error=NULLIF($4,'')
        WHERE task_id=$1 AND api_key_id=$2 AND state='review'`, taskID, keyID, state, note)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return service.ErrNativeVideoReviewNotFound
	}
	return nil
}

func firstNonBlank(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
