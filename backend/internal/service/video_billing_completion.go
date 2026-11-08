package service

import (
	"strings"
	"time"
)

// Completion merges build the usage result for a finished async video from the
// upstream status and the create-time snapshot. Client polls and the
// settlement worker both use them, so both derive the same amounts and the
// same usage_billing_dedup fingerprint, and a task bills once whoever sees it
// finish first.

// MergeRelayVideoCompletion bills a relay video (MiniMax-H3, Seedance relay) at
// its create-time quote for the requested seconds, whatever the upstream or
// MP4 reports.
func MergeRelayVideoCompletion(status *OpenAIForwardResult, pending *GrokVideoPendingBilling, taskID string) *OpenAIForwardResult {
	merged := *status
	merged.Model, merged.BillingModel, merged.UpstreamModel = pending.Model, pending.BillingModel, pending.UpstreamModel
	merged.RequestID, merged.ResponseID = StableGrokVideoBillingRequestID(taskID), taskID
	merged.VideoResolution, merged.VideoDurationSeconds = pending.VideoResolution, pending.VideoDurationSeconds
	merged.MiniMaxH3BaseCost = pending.MiniMaxH3BaseCost
	merged.Duration = GrokVideoE2EDuration(pending.CreatedAt, time.Now())
	return &merged
}

// MergeSeedanceCompletion bills an Ark task by the completion tokens it reports.
func MergeSeedanceCompletion(status *OpenAIForwardResult, pending *GrokVideoPendingBilling, taskID string) *OpenAIForwardResult {
	merged := *status
	merged.Model = pending.Model
	merged.BillingModel = firstNonEmpty(pending.BillingModel, pending.Model)
	merged.UpstreamModel = firstNonEmpty(pending.UpstreamModel, status.UpstreamModel)
	merged.RequestID = StableGrokVideoBillingRequestID(taskID)
	merged.ResponseID = taskID
	merged.Duration = GrokVideoE2EDuration(pending.CreatedAt, time.Now())
	return &merged
}

// MergeGrokVideoCompletion bills a native Grok video. The official status omits
// resolution, so it comes from the create request; model and duration fill gaps.
// pending may be nil when the snapshot was lost.
func MergeGrokVideoCompletion(status *OpenAIForwardResult, pending *GrokVideoPendingBilling, taskID string) *OpenAIForwardResult {
	merged := *status
	if pending != nil {
		if strings.TrimSpace(merged.Model) == "" {
			merged.Model = firstNonEmpty(pending.BillingModel, pending.Model, pending.OriginalModel)
		}
		if strings.TrimSpace(merged.BillingModel) == "" {
			merged.BillingModel = firstNonEmpty(pending.BillingModel, pending.Model, merged.Model)
		}
		if strings.TrimSpace(merged.UpstreamModel) == "" {
			merged.UpstreamModel = pending.UpstreamModel
		}
		if strings.TrimSpace(pending.VideoResolution) != "" {
			merged.VideoResolution = pending.VideoResolution
		}
		if merged.VideoDurationSeconds <= 0 {
			merged.VideoDurationSeconds = pending.VideoDurationSeconds
		}
		if strings.TrimSpace(merged.ResponseID) == "" {
			merged.ResponseID = taskID
		}
	}
	if strings.TrimSpace(merged.Model) == "" {
		merged.Model = "grok-imagine-video"
	}
	if strings.TrimSpace(merged.BillingModel) == "" {
		merged.BillingModel = merged.Model
	}
	// Always the durable task ID, so multi-poll and context-local request IDs
	// share one usage_billing_dedup row.
	merged.RequestID = StableGrokVideoBillingRequestID(firstNonEmpty(merged.ResponseID, taskID))
	merged.ResponseID = firstNonEmpty(merged.ResponseID, taskID)
	merged.VideoCount = 1
	merged.ImageCount = 0
	merged.VideoResolution = NormalizeVideoBillingResolutionOrDefault(merged.VideoResolution)
	merged.VideoDurationSeconds = NormalizeVideoBillingDurationSecondsOrDefault(merged.VideoDurationSeconds)
	if pending != nil {
		if e2e := GrokVideoE2EDuration(pending.CreatedAt, time.Now()); e2e > 0 {
			merged.Duration = e2e
		}
	}
	return &merged
}
