package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func (r *nativeSettlementRepo) ListNativeVideoReviews(context.Context, int, int) ([]NativeVideoReview, int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []NativeVideoReview
	for k, row := range r.rows {
		if r.states[k] == "review" {
			out = append(out, NativeVideoReview{TaskID: row.TaskID, APIKeyID: row.APIKeyID, Kind: row.Kind, Reason: r.notes[k], Submitting: row.Submitting()})
		}
	}
	return out, len(out), nil
}
func (r *nativeSettlementRepo) CountNativeVideoReviews(ctx context.Context) (int, error) {
	_, n, err := r.ListNativeVideoReviews(ctx, 0, 0)
	return n, err
}
func (r *nativeSettlementRepo) ClaimNativeVideoReview(_ context.Context, id string, keyID int64, check func(*NativeVideoSettlement) error) (*NativeVideoSettlement, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	k := nativeRowKey(id, keyID)
	row, ok := r.rows[k]
	if !ok || r.states[k] != "review" {
		return nil, ErrNativeVideoReviewNotFound
	}
	if row.Submitting() || row.Validate() != nil {
		return nil, ErrNativeVideoReviewUnsettleable
	}
	cp := *row
	if check != nil {
		if err := check(&cp); err != nil {
			return nil, err
		}
	}
	r.states[k] = "pending"
	return &cp, nil
}
func (r *nativeSettlementRepo) ResolveNativeVideoReview(_ context.Context, id string, keyID int64, state, note string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	k := nativeRowKey(id, keyID)
	if r.states[k] != "review" {
		return ErrNativeVideoReviewNotFound
	}
	r.states[k], r.notes[k] = state, note
	return nil
}

func (r *nativeSettlementRepo) putReview(t *NativeVideoSettlement, reason string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	k := nativeRowKey(t.TaskID, t.APIKeyID)
	cp := *t
	r.rows[k], r.states[k], r.notes[k] = &cp, "review", reason
}

func (r *nativeSettlementRepo) note(id string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.notes[nativeRowKey(id, 20)]
}

func TestNativeVideoReviewChargesGrokFromCreateSnapshot(t *testing.T) {
	ctx := context.Background()
	repo := newNativeSettlementRepo()
	repo.putReview(nativeSettlementFixture(NativeVideoKindGrok, "xai-req-1"), "unsettled at deadline: status lookup: HTTP 500")
	up := &nativeStatusHTTP{status: 500}
	svc, loader := newNativeSettlementService(t, repo, up, nativeGrokAccount())

	n, err := svc.CountNativeVideoReviews(ctx)
	require.NoError(t, err)
	require.Equal(t, 1, n)
	require.NoError(t, svc.ChargeNativeVideoReview(ctx, loader, "xai-req-1", 20, 0, "#1"))
	require.Equal(t, "complete", repo.state("xai-req-1"))
	require.Equal(t, 1, repo.charged("xai-req-1"))
	require.Zero(t, up.calls, "a manual charge never queries the upstream")
	e := repo.event("xai-req-1")
	require.Equal(t, StableGrokVideoBillingRequestID("xai-req-1"), e.Command.RequestID, "same request ID as the worker")
	require.Equal(t, HashUsageRequestPayload([]byte("xai-req-1")), e.Command.RequestPayloadHash, "same fingerprint as the worker")
	require.InDelta(t, 0.6, e.Usage.TotalCost, 1e-9, "720p × 6s at 0.1/s")
	require.Contains(t, repo.note("xai-req-1"), "charged by admin #1")

	require.ErrorIs(t, svc.ChargeNativeVideoReview(ctx, loader, "xai-req-1", 20, 0, "#1"), ErrNativeVideoReviewNotFound)
	_, err = svc.RetryNativeVideoReview(ctx, loader, "xai-req-1", 20)
	require.ErrorIs(t, err, ErrNativeVideoReviewNotFound)
	require.Equal(t, 1, repo.charged("xai-req-1"), "a settled task is never charged again")
}

func TestNativeVideoReviewChargeAfterAnotherChargeIsDeduplicated(t *testing.T) {
	ctx := context.Background()
	repo := newNativeSettlementRepo()
	task := nativeSettlementFixture(NativeVideoKindGrok, "xai-req-1")
	repo.putReview(task, "unsettled at deadline")
	// An older binary's client poll charged it meanwhile, with its own fingerprint.
	legacy := UsageBillingCommand{RequestID: StableGrokVideoBillingRequestID("xai-req-1"), APIKeyID: 20, UserID: 10, AccountID: 3, BalanceCost: 0.48}
	require.NoError(t, repo.StageUsageBilling(ctx, &legacy, &UsageLog{RequestID: legacy.RequestID}))
	_, err := repo.ApplyStagedUsageBilling(ctx, UsageBillingEventKey{RequestID: legacy.RequestID, APIKeyID: 20})
	require.NoError(t, err)
	svc, loader := newNativeSettlementService(t, repo, &nativeStatusHTTP{}, nativeGrokAccount())

	require.NoError(t, svc.ChargeNativeVideoReview(ctx, loader, "xai-req-1", 20, 0, "#1"))
	require.Equal(t, "complete", repo.state("xai-req-1"))
	require.Equal(t, 1, repo.charged("xai-req-1"))
	require.InDelta(t, 0.48, repo.event("xai-req-1").Command.BalanceCost, 1e-9, "the first charge stands")
	require.Contains(t, repo.note("xai-req-1"), "already billed")
}

func TestNativeVideoReviewChargesArkByEnteredTokens(t *testing.T) {
	ctx := context.Background()
	repo := newNativeSettlementRepo()
	repo.putReview(nativeSettlementFixture(NativeVideoKindArk, "seedance:cgt-1"), "upstream succeeded without completion tokens")
	svc, loader := newNativeSettlementService(t, repo, &nativeStatusHTTP{}, nativeArkAccount())

	for _, tokens := range []int{0, -5, nativeVideoReviewMaxTokens + 1} {
		require.ErrorIs(t, svc.ChargeNativeVideoReview(ctx, loader, "seedance:cgt-1", 20, tokens, "#1"), ErrNativeVideoReviewInvalidTokens)
	}
	require.Equal(t, "review", repo.state("seedance:cgt-1"), "a rejected charge leaves the row in review")
	require.Equal(t, "upstream succeeded without completion tokens", repo.note("seedance:cgt-1"), "with its original reason")

	require.NoError(t, svc.ChargeNativeVideoReview(ctx, loader, "seedance:cgt-1", 20, 1000, "#1"))
	require.Equal(t, "complete", repo.state("seedance:cgt-1"))
	require.Equal(t, 1, repo.charged("seedance:cgt-1"))
	e := repo.event("seedance:cgt-1")
	require.Equal(t, 1000, e.Usage.OutputTokens)
	require.Zero(t, e.Usage.VideoCount, "Ark is token billed")
	require.Greater(t, e.Command.BalanceCost, 0.0)
}

func TestNativeVideoReviewChargeRefusesUnpricedGrok(t *testing.T) {
	ctx := context.Background()
	repo := newNativeSettlementRepo()
	task := nativeSettlementFixture(NativeVideoKindGrok, "xai-req-1")
	task.Pending.VideoResolution = ""
	repo.putReview(task, "unsettled at deadline")
	svc, loader := newNativeSettlementService(t, repo, &nativeStatusHTTP{}, nativeGrokAccount())
	require.ErrorIs(t, svc.ChargeNativeVideoReview(ctx, loader, "xai-req-1", 20, 0, "#1"), ErrNativeVideoReviewMissingUnits)
	require.Equal(t, "review", repo.state("xai-req-1"))
	require.Zero(t, repo.charged("xai-req-1"))
}

func TestNativeVideoReviewRetryQueriesUpstreamAgain(t *testing.T) {
	for _, tc := range []struct {
		name, body, state string
		age               time.Duration
		charges           int
	}{
		{"now done", `{"status":"done","video":{"url":"https://vidgen.x.ai/a.mp4","duration":6}}`, "complete", 30 * time.Hour, 1},
		{"now failed", `{"status":"failed"}`, "failed", 30 * time.Hour, 0},
		{"still running before deadline", `{"status":"pending"}`, "pending", time.Hour, 0},
		{"still running past deadline", `{"status":"pending"}`, "review", 30 * time.Hour, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			repo := newNativeSettlementRepo()
			task := nativeSettlementFixture(NativeVideoKindGrok, "xai-req-1")
			task.CreatedAt = time.Now().Add(-tc.age)
			repo.putReview(task, "unsettled at deadline")
			up := &nativeStatusHTTP{body: tc.body}
			svc, loader := newNativeSettlementService(t, repo, up, nativeGrokAccount())
			state, err := svc.RetryNativeVideoReview(ctx, loader, "xai-req-1", 20)
			require.NoError(t, err)
			require.Equal(t, tc.state, state)
			require.Equal(t, tc.state, repo.state("xai-req-1"))
			require.Equal(t, tc.charges, repo.charged("xai-req-1"))
			require.Equal(t, 1, up.calls)
		})
	}
}

func TestNativeVideoReviewDismissAndUnboundSubmissions(t *testing.T) {
	ctx := context.Background()
	repo := newNativeSettlementRepo()
	intent := nativeSettlementFixture(NativeVideoKindGrok, "unused")
	intent.TaskID = intent.SubmissionID
	repo.putReview(intent, "submission outcome unknown: task ID never bound")
	repo.putReview(nativeSettlementFixture(NativeVideoKindGrok, "xai-req-1"), "unsettled at deadline")
	up := &nativeStatusHTTP{}
	svc, loader := newNativeSettlementService(t, repo, up, nativeGrokAccount())

	items, total, err := svc.ListNativeVideoReviews(ctx, 1, 20)
	require.NoError(t, err)
	require.Equal(t, 2, total)
	require.Len(t, items, 2)

	// No upstream task ID: nothing to query and nothing to price.
	_, err = svc.RetryNativeVideoReview(ctx, loader, intent.SubmissionID, 20)
	require.ErrorIs(t, err, ErrNativeVideoReviewUnsettleable)
	require.ErrorIs(t, svc.ChargeNativeVideoReview(ctx, loader, intent.SubmissionID, 20, 0, "#1"), ErrNativeVideoReviewUnsettleable)
	require.NoError(t, svc.DismissNativeVideoReview(ctx, intent.SubmissionID, 20, "#1", " no task id "))
	require.Equal(t, "failed", repo.state(intent.SubmissionID))
	require.Equal(t, "dismissed by admin #1: no task id", repo.note(intent.SubmissionID))

	require.NoError(t, svc.DismissNativeVideoReview(ctx, "xai-req-1", 20, "#2", strings.Repeat("x", 600)))
	require.Equal(t, "failed", repo.state("xai-req-1"))
	require.LessOrEqual(t, len(repo.note("xai-req-1")), 500)
	require.ErrorIs(t, svc.DismissNativeVideoReview(ctx, "xai-req-1", 20, "#2", ""), ErrNativeVideoReviewNotFound)
	require.Zero(t, up.calls)
	require.Zero(t, repo.charged("xai-req-1"))
	n, err := svc.CountNativeVideoReviews(ctx)
	require.NoError(t, err)
	require.Zero(t, n)
}

func TestNativeVideoReviewUnavailableOutsideDurableMode(t *testing.T) {
	svc := &OpenAIGatewayService{usageBillingRepo: &openAIRecordUsageBillingRepoStub{}}
	n, err := svc.CountNativeVideoReviews(context.Background())
	require.NoError(t, err)
	require.Zero(t, n)
	require.ErrorIs(t, svc.DismissNativeVideoReview(context.Background(), "x", 1, "#1", ""), ErrNativeVideoReviewUnavailable)
}
