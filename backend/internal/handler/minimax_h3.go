package handler

import (
	"bytes"
	"context"
	"io"
	"mime"
	"net/http"
	"strings"

	middleware "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
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

// GrokGroupRelayVideo reports whether a Grok-group video request belongs to the
// Seedance relay: a create naming a relay catalog model (e.g. heavy-grok-720p),
// or a lookup of a task such a create returned. The body is restored.
func (h *OpenAIGatewayHandler) GrokGroupRelayVideo(c *gin.Context) bool {
	apiKey, ok := middleware.GetAPIKeyFromContext(c)
	if !ok || apiKey.Group == nil || apiKey.Group.Platform != service.PlatformGrok {
		return false
	}
	if c.Request.Method == http.MethodPost {
		if c.Request.Body == nil {
			return false
		}
		body, err := io.ReadAll(c.Request.Body)
		c.Request.Body = io.NopCloser(io.MultiReader(bytes.NewReader(body), c.Request.Body))
		if err != nil {
			return false
		}
		return service.IsSeedanceVideoModel(gjson.GetBytes(body, "model").String())
	}
	requestID := strings.TrimSpace(c.Param("request_id"))
	subject, okSubject := middleware.GetAuthSubjectFromContext(c)
	if requestID == "" || !okSubject {
		return false
	}
	accountID, err := h.gatewayService.ResolveGrokMediaVideoRequestAccount(
		c.Request.Context(), apiKey.GroupID, service.SeedanceVideoTaskKey(requestID), subject.UserID, apiKey.ID,
	)
	return err == nil && accountID > 0
}

// Successful status and content requests share one claim and durable billing ID.
// Failed/queued/unknown jobs never charge. Always bill requested seconds, even
// when the completed MP4 duration differs or the upstream omits billing fields.
// Durable relay jobs settle in the background on confirmed success; legacy
// Creator snapshots still charge only once the full video is delivered.
// Shared by the MiniMax-H3 and Seedance relays.
func prepareRelayVideoCompletionBilling(ctx context.Context, h *OpenAIGatewayHandler, key *service.APIKey, subject middleware.AuthSubject, taskID string, result *service.OpenAIForwardResult) *service.OpenAIForwardResult {
	if result == nil || result.VideoCount != 1 {
		return nil
	}
	pending, err := h.gatewayService.LoadGrokVideoPendingBilling(ctx, taskID, subject.UserID, key.ID)
	if err != nil || pending == nil || pending.MiniMaxH3BaseCost == nil {
		return nil
	}
	if pending.DurableRelay {
		return nil
	}
	if (isCreatorStudioAPIKey(key) || pending.BillOnContent) && !result.VideoContentDelivered {
		return nil
	}
	claimed, err := h.gatewayService.ClaimGrokVideoBilling(ctx, taskID, subject.UserID, key.ID)
	if err != nil || !claimed {
		return nil
	}
	return service.MergeRelayVideoCompletion(result, pending, taskID)
}
