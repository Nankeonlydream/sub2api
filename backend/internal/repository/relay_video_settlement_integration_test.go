//go:build integration

package repository

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

func TestRelaySettlementDurableLongIDAndConcurrentRecovery(t *testing.T) {
	ctx := context.Background()
	repo, cmd, usage, _ := durableBillingFixture(t)
	id := "minimax-h3:task_17359b97ae4aa8459ba69046ddfa927d2ff9e6d3fecff103"
	cmd.RequestID = service.StableGrokVideoBillingRequestID(id)
	usage.RequestID = cmd.RequestID
	usage.VideoCount = 1
	usage.User = nil
	usage.APIKey = nil
	base := 1.0
	intentID := "minimax-h3:submission_test"
	task := &service.RelayVideoSettlement{SubmissionID: intentID, TaskID: id, Pending: service.GrokVideoPendingBilling{MiniMaxH3BaseCost: &base, Model: "test-video", VideoDurationSeconds: 15, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}, Event: service.UsageBillingEvent{Version: 1, Command: cmd, Usage: usage}}
	intent := *task
	intent.TaskID = intentID
	intent.Event.Command.RequestID = service.StableGrokVideoBillingRequestID(intentID)
	intent.Event.Usage.RequestID = intent.Event.Command.RequestID
	require.NoError(t, repo.StoreRelayVideoSettlement(ctx, &intent))
	due, err := repo.DueRelayVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Empty(t, due, "unbound submissions must never be polled or charged")
	require.NoError(t, repo.StoreRelayVideoSettlement(ctx, task))
	require.NoError(t, repo.StoreRelayVideoSettlement(ctx, task))
	var intents int
	require.NoError(t, repo.db.QueryRowContext(ctx, "SELECT count(*) FROM relay_video_settlements WHERE state='submitting'").Scan(&intents))
	require.Zero(t, intents)
	bad := *task
	bad.Event.Command.BalanceCost = 2
	require.ErrorIs(t, repo.StoreRelayVideoSettlement(ctx, &bad), service.ErrUsageBillingRequestConflict)
	loaded, err := (&usageBillingRepository{db: repo.db}).LoadRelayVideoSettlement(ctx, id, cmd.APIKeyID)
	require.NoError(t, err)
	require.Equal(t, 1.0, loaded.Event.Command.BalanceCost)
	_, err = repo.db.ExecContext(ctx, "UPDATE relay_video_settlements SET next_poll_at=NOW()-INTERVAL '1 second'")
	require.NoError(t, err)
	due, err = repo.DueRelayVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Len(t, due, 1)
	other, err := repo.DueRelayVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Empty(t, other, "lease excludes concurrent workers")
	var wg sync.WaitGroup
	errs := make(chan error, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			local := *loaded
			fresh := &usageBillingRepository{db: repo.db}
			e := fresh.StageUsageBilling(ctx, &local.Event.Command, &local.Event.Usage)
			if e == nil {
				_, e = fresh.ApplyStagedUsageBilling(ctx, service.UsageBillingEventKey{RequestID: cmd.RequestID, APIKeyID: cmd.APIKeyID})
			}
			errs <- e
		}()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		require.NoError(t, e)
	}
	var balance, quota string
	var logs, length int
	require.NoError(t, repo.db.QueryRowContext(ctx, "SELECT balance::text FROM users WHERE id=$1", cmd.UserID).Scan(&balance))
	require.Equal(t, "99.00000000", balance)
	require.NoError(t, repo.db.QueryRowContext(ctx, "SELECT quota_used::text FROM api_keys WHERE id=$1", cmd.APIKeyID).Scan(&quota))
	require.Equal(t, "1.00000000", quota)
	require.NoError(t, repo.db.QueryRowContext(ctx, "SELECT count(*),max(length(request_id)) FROM usage_logs WHERE request_id=$1 AND api_key_id=$2", cmd.RequestID, cmd.APIKeyID).Scan(&logs, &length))
	require.Equal(t, 1, logs)
	require.Equal(t, 75, length)
	require.NoError(t, repo.FinishRelayVideoSettlement(ctx, id, cmd.APIKeyID, "complete"))
}
