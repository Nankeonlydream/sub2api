//go:build integration

package repository

import (
	"context"
	"io/fs"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/Wei-Shaw/sub2api/migrations"
	"github.com/stretchr/testify/require"
)

func nativeIntegrationTask(cmd service.UsageBillingCommand, kind, taskID, submission string) *service.NativeVideoSettlement {
	return &service.NativeVideoSettlement{SubmissionID: service.NewNativeVideoSubmissionID(submission), TaskID: taskID, Kind: kind,
		UserID: cmd.UserID, APIKeyID: cmd.APIKeyID, GroupID: 24, AccountID: cmd.AccountID,
		Pending: service.GrokVideoPendingBilling{Model: "grok-imagine-video", VideoResolution: "720p", VideoDurationSeconds: 6,
			CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}}
}

func TestNativeVideoSettlementDurableLifecycle(t *testing.T) {
	ctx := context.Background()
	repo, cmd, _, _ := durableBillingFixture(t)
	task := nativeIntegrationTask(cmd, service.NativeVideoKindGrok, "xai-"+strings.Repeat("a", 120), "s1")
	intent := *task
	intent.TaskID = intent.SubmissionID
	require.NoError(t, repo.StoreNativeVideoSettlement(ctx, &intent))
	owned, err := repo.HasNativeVideoSettlement(ctx, intent.SubmissionID, cmd.APIKeyID)
	require.NoError(t, err)
	require.False(t, owned, "an intent is not a billable task")
	due, err := repo.DueNativeVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Empty(t, due, "unbound intents are never polled")

	require.NoError(t, repo.StoreNativeVideoSettlement(ctx, task))
	require.NoError(t, repo.StoreNativeVideoSettlement(ctx, task), "acceptance replays are idempotent")
	bad := *task
	bad.Pending.VideoResolution = "1080p"
	require.ErrorIs(t, repo.StoreNativeVideoSettlement(ctx, &bad), service.ErrUsageBillingRequestConflict)
	var submitting int
	require.NoError(t, repo.db.QueryRowContext(ctx, "SELECT count(*) FROM native_video_settlements WHERE state='submitting'").Scan(&submitting))
	require.Zero(t, submitting, "binding replaces the intent")
	owned, err = repo.HasNativeVideoSettlement(ctx, task.TaskID, cmd.APIKeyID)
	require.NoError(t, err)
	require.True(t, owned)
	owned, err = repo.HasNativeVideoSettlement(ctx, task.TaskID, cmd.APIKeyID+1)
	require.NoError(t, err)
	require.False(t, owned, "ownership is per key")

	due, err = repo.DueNativeVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Empty(t, due, "first poll waits for next_poll_at")
	_, err = repo.db.ExecContext(ctx, "UPDATE native_video_settlements SET next_poll_at=NOW()-INTERVAL '1 second'")
	require.NoError(t, err)
	due, err = repo.DueNativeVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Len(t, due, 1)
	require.Equal(t, task.TaskID, due[0].TaskID)
	require.Equal(t, 1, due[0].Attempts)
	require.False(t, due[0].CreatedAt.IsZero())
	require.Equal(t, "720p", due[0].Pending.VideoResolution)
	again, err := repo.DueNativeVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Empty(t, again, "the lease excludes concurrent workers")

	require.NoError(t, repo.RescheduleNativeVideoSettlement(ctx, task.TaskID, cmd.APIKeyID, 0, "status lookup: HTTP 500"))
	var lastError string
	require.NoError(t, repo.db.QueryRowContext(ctx, "SELECT last_error FROM native_video_settlements WHERE task_id=$1", task.TaskID).Scan(&lastError))
	require.Equal(t, "status lookup: HTTP 500", lastError)
	due, err = repo.DueNativeVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Len(t, due, 1)

	require.NoError(t, repo.FinishNativeVideoSettlement(ctx, task.TaskID, cmd.APIKeyID, "complete", ""))
	require.NoError(t, repo.FinishNativeVideoSettlement(ctx, task.TaskID, cmd.APIKeyID, "failed", "late"), "finished rows are final")
	var state string
	require.NoError(t, repo.db.QueryRowContext(ctx, "SELECT state FROM native_video_settlements WHERE task_id=$1", task.TaskID).Scan(&state))
	require.Equal(t, "complete", state)
	require.Error(t, repo.FinishNativeVideoSettlement(ctx, task.TaskID, cmd.APIKeyID, "pending", ""))
	_, err = repo.db.ExecContext(ctx, "UPDATE native_video_settlements SET next_poll_at=NOW()-INTERVAL '1 second'")
	require.NoError(t, err)
	due, err = repo.DueNativeVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Empty(t, due, "settled tasks are never polled again")
}

func TestNativeVideoSettlementReviewsUnknownOutcomes(t *testing.T) {
	ctx := context.Background()
	repo, cmd, _, _ := durableBillingFixture(t)
	stale := nativeIntegrationTask(cmd, service.NativeVideoKindArk, "", "stale")
	stale.TaskID = stale.SubmissionID
	require.NoError(t, repo.StoreNativeVideoSettlement(ctx, stale))
	_, err := repo.db.ExecContext(ctx, "UPDATE native_video_settlements SET created_at=NOW()-INTERVAL '2 hours' WHERE task_id=$1", stale.SubmissionID)
	require.NoError(t, err)

	good := nativeIntegrationTask(cmd, service.NativeVideoKindArk, "seedance:cgt-good", "good")
	good.Pending.Model = "doubao-seedance"
	require.NoError(t, repo.StoreNativeVideoSettlement(ctx, good))
	_, err = repo.db.ExecContext(ctx, `INSERT INTO native_video_settlements(task_id,api_key_id,user_id,account_id,group_id,kind,payload,state,next_poll_at)
        VALUES('broken',$1,$2,$3,24,'grok','{"kind":"grok"}','pending',NOW()-INTERVAL '1 minute')`, cmd.APIKeyID, cmd.UserID, cmd.AccountID)
	require.NoError(t, err)
	_, err = repo.db.ExecContext(ctx, "UPDATE native_video_settlements SET next_poll_at=NOW()-INTERVAL '1 second' WHERE state='pending'")
	require.NoError(t, err)

	due, err := repo.DueNativeVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Len(t, due, 1, "an unreadable row does not block other settlements")
	require.Equal(t, "seedance:cgt-good", due[0].TaskID)
	states := map[string]string{}
	rows, err := repo.db.QueryContext(ctx, "SELECT task_id,state FROM native_video_settlements")
	require.NoError(t, err)
	for rows.Next() {
		var id, s string
		require.NoError(t, rows.Scan(&id, &s))
		states[id] = s
	}
	require.NoError(t, rows.Close())
	require.Equal(t, "review", states[stale.SubmissionID], "a POST that may have been accepted without a task ID goes to manual review")
	require.Equal(t, "review", states["broken"])
	require.Equal(t, "pending", states["seedance:cgt-good"])
}

// An older binary only knows relay_video_settlements and its migration set ends
// before 337. Native rows must not affect its startup or its relay worker.
func TestNativeVideoSettlementRollbackSafety(t *testing.T) {
	ctx := context.Background()
	repo, cmd, usage, _ := durableBillingFixture(t)
	native := nativeIntegrationTask(cmd, service.NativeVideoKindGrok, "xai-rollback", "rollback")
	require.NoError(t, repo.StoreNativeVideoSettlement(ctx, native))
	_, err := repo.db.ExecContext(ctx, "UPDATE native_video_settlements SET next_poll_at=NOW()-INTERVAL '1 second'")
	require.NoError(t, err)

	due, err := repo.DueRelayVideoSettlements(ctx, 8)
	require.NoError(t, err, "the relay worker of an older binary never sees native rows")
	require.Empty(t, due)
	loaded, err := repo.LoadRelayVideoSettlement(ctx, native.TaskID, cmd.APIKeyID)
	require.NoError(t, err)
	require.Nil(t, loaded, "older poll paths fall back to their Redis snapshot")

	// Relay settlement keeps working next to native rows.
	relayID := "minimax-h3:task_rollback"
	cmd.RequestID = service.StableGrokVideoBillingRequestID(relayID)
	usage.RequestID, usage.VideoCount, usage.User, usage.APIKey = cmd.RequestID, 1, nil, nil
	base := 1.0
	relay := &service.RelayVideoSettlement{SubmissionID: "minimax-h3:submission_rollback", TaskID: relayID,
		Pending: service.GrokVideoPendingBilling{MiniMaxH3BaseCost: &base, Model: "test-video", VideoDurationSeconds: 6, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)},
		Event:   service.UsageBillingEvent{Version: 1, Command: cmd, Usage: usage}}
	require.NoError(t, repo.StoreRelayVideoSettlement(ctx, relay))
	_, err = repo.db.ExecContext(ctx, "UPDATE relay_video_settlements SET next_poll_at=NOW()-INTERVAL '1 second'")
	require.NoError(t, err)
	due, err = repo.DueRelayVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Len(t, due, 1)
	require.Equal(t, relayID, due[0].TaskID)

	// The older migration runner starts on a database that already has 337.
	older := fstest.MapFS{}
	entries, err := fs.ReadDir(migrations.FS, ".")
	require.NoError(t, err)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") || strings.HasPrefix(e.Name(), "337_native_video_settlement") {
			continue
		}
		body, readErr := fs.ReadFile(migrations.FS, e.Name())
		require.NoError(t, readErr)
		older[e.Name()] = &fstest.MapFile{Data: body}
	}
	require.NoError(t, applyMigrationsFS(ctx, repo.db, older))
	var rows int
	require.NoError(t, repo.db.QueryRowContext(ctx, "SELECT count(*) FROM native_video_settlements").Scan(&rows))
	require.Equal(t, 1, rows, "rolling back leaves native rows for the next upgrade")
	// Upgrading again is a no-op.
	require.NoError(t, ApplyMigrations(ctx, repo.db))
}

func TestNativeVideoReviewQueue(t *testing.T) {
	ctx := context.Background()
	repo, cmd, _, _ := durableBillingFixture(t)
	task := nativeIntegrationTask(cmd, service.NativeVideoKindGrok, "xai-review", "review")
	require.NoError(t, repo.StoreNativeVideoSettlement(ctx, task))
	intent := nativeIntegrationTask(cmd, service.NativeVideoKindGrok, "", "lost")
	intent.TaskID = intent.SubmissionID
	require.NoError(t, repo.StoreNativeVideoSettlement(ctx, intent))
	require.NoError(t, repo.FinishNativeVideoSettlement(ctx, task.TaskID, cmd.APIKeyID, "review", "unsettled at deadline"))
	_, err := repo.db.ExecContext(ctx, "UPDATE native_video_settlements SET created_at=NOW()-INTERVAL '2 hours' WHERE task_id=$1", intent.SubmissionID)
	require.NoError(t, err)
	_, err = repo.DueNativeVideoSettlements(ctx, 8) // sweeps the stale intent into review
	require.NoError(t, err)

	n, err := repo.CountNativeVideoReviews(ctx)
	require.NoError(t, err)
	require.Equal(t, 2, n)
	items, total, err := repo.ListNativeVideoReviews(ctx, 1, 0)
	require.NoError(t, err)
	require.Equal(t, 2, total)
	require.Len(t, items, 1, "paged")
	items, _, err = repo.ListNativeVideoReviews(ctx, 10, 0)
	require.NoError(t, err)
	byID := map[string]service.NativeVideoReview{}
	for _, it := range items {
		byID[it.TaskID] = it
	}
	got := byID[task.TaskID]
	require.Equal(t, "720p", got.VideoResolution)
	require.Equal(t, 6, got.VideoDurationSeconds)
	require.Equal(t, "unsettled at deadline", got.Reason)
	require.False(t, got.Submitting)
	require.NotEmpty(t, got.UserEmail)
	require.True(t, byID[intent.SubmissionID].Submitting)

	// An unbound intent cannot be claimed for retry or charge.
	_, err = repo.ClaimNativeVideoReview(ctx, intent.SubmissionID, cmd.APIKeyID, nil)
	require.ErrorIs(t, err, service.ErrNativeVideoReviewUnsettleable)
	// A failing check leaves the row and its reason untouched.
	_, err = repo.ClaimNativeVideoReview(ctx, task.TaskID, cmd.APIKeyID, func(*service.NativeVideoSettlement) error { return service.ErrNativeVideoReviewMissingUnits })
	require.ErrorIs(t, err, service.ErrNativeVideoReviewMissingUnits)
	var state, reason string
	require.NoError(t, repo.db.QueryRowContext(ctx, "SELECT state,last_error FROM native_video_settlements WHERE task_id=$1", task.TaskID).Scan(&state, &reason))
	require.Equal(t, "review", state)
	require.Equal(t, "unsettled at deadline", reason)

	claimed, err := repo.ClaimNativeVideoReview(ctx, task.TaskID, cmd.APIKeyID, nil)
	require.NoError(t, err)
	require.Equal(t, task.TaskID, claimed.TaskID)
	require.False(t, claimed.CreatedAt.IsZero())
	_, err = repo.ClaimNativeVideoReview(ctx, task.TaskID, cmd.APIKeyID, nil)
	require.ErrorIs(t, err, service.ErrNativeVideoReviewNotFound, "one admin action at a time")
	due, err := repo.DueNativeVideoSettlements(ctx, 8)
	require.NoError(t, err)
	require.Empty(t, due, "the worker skips a claimed row until its lease ends")
	require.NoError(t, repo.FinishNativeVideoSettlement(ctx, task.TaskID, cmd.APIKeyID, "complete", "charged by admin #1"))

	require.NoError(t, repo.ResolveNativeVideoReview(ctx, intent.SubmissionID, cmd.APIKeyID, "failed", "dismissed by admin #1"))
	require.ErrorIs(t, repo.ResolveNativeVideoReview(ctx, intent.SubmissionID, cmd.APIKeyID, "failed", "again"), service.ErrNativeVideoReviewNotFound)
	require.Error(t, repo.ResolveNativeVideoReview(ctx, task.TaskID, cmd.APIKeyID, "pending", ""))
	n, err = repo.CountNativeVideoReviews(ctx)
	require.NoError(t, err)
	require.Zero(t, n)
}
