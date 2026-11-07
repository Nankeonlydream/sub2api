package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/Wei-Shaw/sub2api/internal/service"
)

var _ service.RelayVideoSettlementRepository = (*usageBillingRepository)(nil)

func (r *usageBillingRepository) StoreRelayVideoSettlement(ctx context.Context, task *service.RelayVideoSettlement) error {
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
	if task.TaskID == task.SubmissionID {
		state = "submitting"
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO relay_video_settlements
        (task_id,api_key_id,user_id,account_id,payload,bill_on_content,state)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT(task_id,api_key_id) DO NOTHING`,
		task.TaskID, task.Event.Command.APIKeyID, task.Event.Command.UserID, task.Event.Command.AccountID, string(payload), task.Pending.BillOnContent, state)
	if err != nil {
		return err
	}
	var same bool
	err = tx.QueryRowContext(ctx, `SELECT payload=$3::jsonb FROM relay_video_settlements WHERE task_id=$1 AND api_key_id=$2`, task.TaskID, task.Event.Command.APIKeyID, string(payload)).Scan(&same)
	if err != nil {
		return err
	}
	if !same {
		return service.ErrUsageBillingRequestConflict
	}
	if state == "pending" {
		_, err = tx.ExecContext(ctx, `DELETE FROM relay_video_settlements WHERE task_id=$1 AND api_key_id=$2 AND state='submitting'`, task.SubmissionID, task.Event.Command.APIKeyID)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (r *usageBillingRepository) LoadRelayVideoSettlement(ctx context.Context, taskID string, keyID int64) (*service.RelayVideoSettlement, error) {
	var raw []byte
	err := r.db.QueryRowContext(ctx, `SELECT payload FROM relay_video_settlements WHERE task_id=$1 AND api_key_id=$2`, taskID, keyID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var task service.RelayVideoSettlement
	if err = json.Unmarshal(raw, &task); err != nil {
		return nil, err
	}
	if err = task.Validate(); err != nil {
		return nil, err
	}
	return &task, nil
}

func (r *usageBillingRepository) DueRelayVideoSettlements(ctx context.Context, limit int) ([]service.RelayVideoSettlement, error) {
	rows, err := r.db.QueryContext(ctx, `WITH due AS (
        SELECT task_id,api_key_id FROM relay_video_settlements
        WHERE state='pending' AND NOT bill_on_content AND next_poll_at<=NOW()
        ORDER BY next_poll_at LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE relay_video_settlements t SET next_poll_at=NOW()+INTERVAL '2 minutes',attempts=attempts+1
      FROM due WHERE t.task_id=due.task_id AND t.api_key_id=due.api_key_id RETURNING t.payload`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tasks := make([]service.RelayVideoSettlement, 0)
	for rows.Next() {
		var raw []byte
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		var task service.RelayVideoSettlement
		if err = json.Unmarshal(raw, &task); err != nil {
			return nil, err
		}
		if err = task.Validate(); err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func (r *usageBillingRepository) FinishRelayVideoSettlement(ctx context.Context, taskID string, keyID int64, state string) error {
	if state != "complete" && state != "failed" && state != "review" {
		return errors.New("invalid relay settlement state")
	}
	_, err := r.db.ExecContext(ctx, `UPDATE relay_video_settlements SET state=$3,completed_at=NOW()
        WHERE task_id=$1 AND api_key_id=$2 AND state='pending'`, taskID, keyID, state)
	return err
}
