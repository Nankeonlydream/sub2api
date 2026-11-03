package handler

import (
	"context"
	"mime"
	"net/http"
	"strings"
	"time"

	middleware "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

// MiniMaxH3Videos exposes the custom relay's JSON OpenAI Videos API.
func (h *OpenAIGatewayHandler) MiniMaxH3Videos(c *gin.Context) {
	h.relayVideos(c, "MiniMax-H3", service.MiniMaxH3EndpointCreate, service.MiniMaxH3EndpointStatus, service.MiniMaxH3EndpointContent, service.MiniMaxH3TaskKey)
}

// SeedanceVideos exposes the Seedance relays, which speak the same JSON
// OpenAI Videos API as H3 (not Ark's native task API; see SeedanceTasks).
func (h *OpenAIGatewayHandler) SeedanceVideos(c *gin.Context) {
	h.relayVideos(c, "Seedance", service.SeedanceVideoEndpointCreate, service.SeedanceVideoEndpointStatus, service.SeedanceVideoEndpointContent, service.SeedanceVideoTaskKey)
}

func (h *OpenAIGatewayHandler) relayVideos(c *gin.Context, name string, create, status, content service.GrokMediaEndpoint, taskKey func(string) string) {
	endpoint, taskID := create, ""
	if c.Request.Method != http.MethodPost {
		endpoint = status
		taskID = taskKey(c.Param("request_id"))
		if strings.HasSuffix(c.Request.URL.Path, "/content") {
			endpoint = content
		}
	} else {
		mediaType, _, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
		if err != nil || mediaType != "application/json" {
			h.errorResponse(c, http.StatusUnsupportedMediaType, "invalid_request_error", name+" requires application/json")
			return
		}
	}
	setActualUpstreamEndpoint(c, "/v1/videos")
	h.handleGrokMedia(c, endpoint, taskID)
}

// Successful status and content requests share one claim and durable billing ID.
// Failed/queued/unknown jobs never charge. Always bill requested seconds, even
// when the completed MP4 duration differs or the upstream omits billing fields.
// Creator jobs charge only once the full video is delivered, as for Grok.
// Shared by the MiniMax-H3 and Seedance relays.
func prepareRelayVideoCompletionBilling(ctx context.Context, h *OpenAIGatewayHandler, key *service.APIKey, subject middleware.AuthSubject, taskID string, result *service.OpenAIForwardResult) *service.OpenAIForwardResult {
	if result == nil || result.VideoCount != 1 {
		return nil
	}
	pending, err := h.gatewayService.LoadGrokVideoPendingBilling(ctx, taskID, subject.UserID, key.ID)
	if err != nil || pending == nil || pending.MiniMaxH3BaseCost == nil {
		return nil
	}
	if (isCreatorStudioAPIKey(key) || pending.BillOnContent) && !result.VideoContentDelivered {
		return nil
	}
	claimed, err := h.gatewayService.ClaimGrokVideoBilling(ctx, taskID, subject.UserID, key.ID)
	if err != nil || !claimed {
		return nil
	}
	merged := *result
	merged.Model, merged.BillingModel, merged.UpstreamModel = pending.Model, pending.BillingModel, pending.UpstreamModel
	merged.RequestID, merged.ResponseID = service.StableGrokVideoBillingRequestID(taskID), taskID
	merged.VideoResolution, merged.VideoDurationSeconds = pending.VideoResolution, pending.VideoDurationSeconds
	merged.MiniMaxH3BaseCost = pending.MiniMaxH3BaseCost
	merged.Duration = service.GrokVideoE2EDuration(pending.CreatedAt, time.Now())
	return &merged
}
