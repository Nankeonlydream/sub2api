package repository

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
)

var _ service.NativeVideoSettlementRepository = (*usageBillingRepository)(nil)

// An unbound intent older than this means the process died between the POST
// and binding the task ID: the outcome is unknown and goes to review.
const nativeVideoSubmittingStale = time.Hour

func (r *usageBillingRepository) StoreNativeVideoSettlement(ctx context.Context, task *service.NativeVideoSettlement) error {
	if err := task.Validate(); err != nil {
		return err
	}
	payload, err := json.Marshal(task)
	if err != nil {
		return err
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	state := "pending"
	if task.Submitting() {
		state = "submitting"
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO native_video_settlements
        (task_id,api_key_id,user_id,account_id,group_id,kind,payload,state)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT(task_id,api_key_id) DO NOTHING`,
		task.TaskID, task.APIKeyID, task.UserID, task.AccountID, task.GroupID, task.Kind, string(payload), state)
	if err != nil {
		return err
	}
	var same bool
	err = tx.QueryRowContext(ctx, `SELECT payload=$3::jsonb FROM native_video_settlements WHERE task_id=$1 AND api_key_id=$2`,
		task.TaskID, task.APIKeyID, string(payload)).Scan(&same)
	if err != nil {
		return err
	}
	if !same {
		return service.ErrUsageBillingRequestConflict
	}
	if state == "pending" {
		if _, err = tx.ExecContext(ctx, `DELETE FROM native_video_settlements WHERE task_id=$1 AND api_key_id=$2 AND state='submitting'`,
			task.SubmissionID, task.APIKeyID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *usageBillingRepository) DiscardNativeVideoSubmission(ctx context.Context, submissionID string, keyID int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM native_video_settlements WHERE task_id=$1 AND api_key_id=$2 AND state='submitting'`, submissionID, keyID)
	return err
}

func (r *usageBillingRepository) HasNativeVideoSettlement(ctx context.Context, taskID string, keyID int64) (bool, error) {
	var exists bool
	err := r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM native_video_settlements WHERE task_id=$1 AND api_key_id=$2 AND state<>'submitting')`, taskID, keyID).Scan(&exists)
	return exists, err
}

func (r *usageBillingRepository) DueNativeVideoSettlements(ctx context.Context, limit int) ([]service.NativeVideoSettlement, error) {
	if _, err := r.db.ExecContext(ctx, `UPDATE native_video_settlements
        SET state='review',completed_at=NOW(),last_error='submission outcome unknown: task ID never bound'
        WHERE state='submitting' AND created_at<NOW()-make_interval(secs => $1)`, nativeVideoSubmittingStale.Seconds()); err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, `WITH due AS (
        SELECT task_id,api_key_id FROM native_video_settlements
        WHERE state='pending' AND next_poll_at<=NOW()
        ORDER BY next_poll_at LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE native_video_settlements t SET next_poll_at=NOW()+INTERVAL '2 minutes',attempts=t.attempts+1
      FROM due WHERE t.task_id=due.task_id AND t.api_key_id=due.api_key_id
      RETURNING t.task_id,t.api_key_id,t.payload,t.attempts,t.created_at`, limit)
	if err != nil {
		return nil, err
	}
	tasks := make([]service.NativeVideoSettlement, 0)
	type badRow struct {
		taskID string
		keyID  int64
	}
	var bad []badRow
	for rows.Next() {
		var (
			taskID   string
			keyID    int64
			raw      []byte
			attempts int
			created  time.Time
		)
		if err = rows.Scan(&taskID, &keyID, &raw, &attempts, &created); err != nil {
			_ = rows.Close()
			return nil, err
		}
		var task service.NativeVideoSettlement
		if json.Unmarshal(raw, &task) != nil || task.Validate() != nil || task.Submitting() || task.TaskID != taskID || task.APIKeyID != keyID {
			bad = append(bad, badRow{taskID, keyID})
			continue
		}
		task.Attempts, task.CreatedAt = attempts, created
		tasks = append(tasks, task)
	}
	if err = rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	_ = rows.Close()
	// One unreadable row must not block every other settlement.
	for _, b := range bad {
		if _, err = r.db.ExecContext(ctx, `UPDATE native_video_settlements SET state='review',completed_at=NOW(),last_error='invalid settlement payload'
            WHERE task_id=$1 AND api_key_id=$2 AND state='pending'`, b.taskID, b.keyID); err != nil {
			return nil, err
		}
	}
	return tasks, nil
}

func (r *usageBillingRepository) RescheduleNativeVideoSettlement(ctx context.Context, taskID string, keyID int64, after time.Duration, lastError string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE native_video_settlements
        SET next_poll_at=NOW()+make_interval(secs => $3),last_error=NULLIF($4,'')
        WHERE task_id=$1 AND api_key_id=$2 AND state='pending'`, taskID, keyID, after.Seconds(), lastError)
	return err
}

func (r *usageBillingRepository) FinishNativeVideoSettlement(ctx context.Context, taskID string, keyID int64, state, note string) error {
	if state != "complete" && state != "failed" && state != "review" {
		return errors.New("invalid native video settlement state")
	}
	_, err := r.db.ExecContext(ctx, `UPDATE native_video_settlements SET state=$3,completed_at=NOW(),last_error=NULLIF($4,'')
        WHERE task_id=$1 AND api_key_id=$2 AND state='pending'`, taskID, keyID, state, note)
	return err
}
