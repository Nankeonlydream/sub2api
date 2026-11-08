package admin

import (
	"strconv"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"

	"github.com/gin-gonic/gin"
)

// NativeVideoReviewHandler lets admins settle native video tasks the
// settlement worker left for review.
type NativeVideoReviewHandler struct {
	gateway *service.OpenAIGatewayService
	keys    service.VideoBillingKeyLoader
}

func NewNativeVideoReviewHandler(gateway *service.OpenAIGatewayService, keys service.VideoBillingKeyLoader) *NativeVideoReviewHandler {
	return &NativeVideoReviewHandler{gateway: gateway, keys: keys}
}

// List GET /api/v1/admin/video-settlements/reviews
func (h *NativeVideoReviewHandler) List(c *gin.Context) {
	page, pageSize := response.ParsePagination(c)
	if pageSize > 100 {
		pageSize = 100
	}
	items, total, err := h.gateway.ListNativeVideoReviews(c.Request.Context(), page, pageSize)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Paginated(c, items, int64(total), page, pageSize)
}

// Summary GET /api/v1/admin/video-settlements/reviews/summary
func (h *NativeVideoReviewHandler) Summary(c *gin.Context) {
	count, err := h.gateway.CountNativeVideoReviews(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"pending_count": count})
}

type nativeVideoReviewActionRequest struct {
	TaskID       string `json:"task_id" binding:"required"`
	APIKeyID     int64  `json:"api_key_id" binding:"required"`
	Action       string `json:"action" binding:"required"`
	OutputTokens int    `json:"output_tokens"`
	Reason       string `json:"reason"`
}

// Act POST /api/v1/admin/video-settlements/reviews/action
// action: retry | charge | dismiss
func (h *NativeVideoReviewHandler) Act(c *gin.Context) {
	var req nativeVideoReviewActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}
	req.TaskID = strings.TrimSpace(req.TaskID)
	if req.TaskID == "" || len(req.TaskID) > 244 || req.APIKeyID <= 0 || len(req.Reason) > 300 {
		response.BadRequest(c, "Invalid video settlement")
		return
	}
	actor := "unknown"
	if subject, ok := middleware.GetAuthSubjectFromContext(c); ok {
		actor = "#" + strconv.FormatInt(subject.UserID, 10)
	}
	ctx := c.Request.Context()
	switch req.Action {
	case "retry":
		state, err := h.gateway.RetryNativeVideoReview(ctx, h.keys, req.TaskID, req.APIKeyID)
		if state == "" && err != nil {
			response.ErrorFrom(c, err)
			return
		}
		// The lookup itself may fail and leave the task pending or in review;
		// the resulting state is the answer.
		data := gin.H{"state": state}
		if err != nil {
			data["error"] = err.Error()
		}
		response.Success(c, data)
	case "charge":
		if err := h.gateway.ChargeNativeVideoReview(ctx, h.keys, req.TaskID, req.APIKeyID, req.OutputTokens, actor); err != nil {
			response.ErrorFrom(c, err)
			return
		}
		response.Success(c, gin.H{"state": "complete"})
	case "dismiss":
		if err := h.gateway.DismissNativeVideoReview(ctx, req.TaskID, req.APIKeyID, actor, req.Reason); err != nil {
			response.ErrorFrom(c, err)
			return
		}
		response.Success(c, gin.H{"state": "failed"})
	default:
		response.BadRequest(c, "Unknown action")
	}
}
