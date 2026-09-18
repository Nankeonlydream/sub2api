package handler

import (
	"net/http"
	"strings"

	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/gin-gonic/gin"
)

// CreatorVideoPricing is an authenticated, read-only price preview.
func (h *OpenAIGatewayHandler) CreatorVideoPricing(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	key, ok := middleware2.GetAPIKeyFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "User context not found")
		return
	}
	model := strings.TrimSpace(c.Query("model"))
	if model == "" || len(model) > 256 {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Invalid video model")
		return
	}
	quote, err := h.gatewayService.CreatorVideoPricing(c.Request.Context(), key, subject.UserID, model)
	if err != nil {
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "Video pricing is unavailable")
		return
	}
	c.JSON(http.StatusOK, quote)
}
