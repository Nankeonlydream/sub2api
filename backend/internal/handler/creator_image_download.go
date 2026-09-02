package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

type creatorImageDownloadRequest struct {
	URL string `json:"url"`
}

// CreatorImageDownload fetches a generated image server-side so the web UI
// can save cross-origin CDN results without depending on the CDN's CORS policy.
func (h *OpenAIGatewayHandler) CreatorImageDownload(c *gin.Context) {
	var request creatorImageDownloadRequest
	if err := c.ShouldBindJSON(&request); err != nil || strings.TrimSpace(request.URL) == "" {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "url is required")
		return
	}

	downloader := h.creatorImageDownloader
	if downloader == nil {
		maxBytes := int64(0)
		if h.cfg != nil {
			maxBytes = h.cfg.ImageStorage.MaxDownloadByte
		}
		downloader = service.NewCreatorImageDownloader(nil, maxBytes)
	}
	result, err := downloader.Download(c.Request.Context(), request.URL)
	if err != nil {
		h.creatorImageDownloadError(c, err)
		return
	}

	c.Header("Content-Disposition", `attachment; filename="creator-image.`+result.Extension+`"`)
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Length", strconv.Itoa(len(result.Data)))
	c.Data(http.StatusOK, result.ContentType, result.Data)
}

func (h *OpenAIGatewayHandler) creatorImageDownloadError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrCreatorImageDownloadInvalidURL),
		errors.Is(err, service.ErrCreatorImageDownloadBlockedURL):
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "image URL is invalid or not allowed")
	case errors.Is(err, service.ErrCreatorImageDownloadTooLarge):
		h.errorResponse(c, http.StatusRequestEntityTooLarge, "invalid_request_error", "image is too large to download")
	case errors.Is(err, service.ErrCreatorImageDownloadInvalidContent):
		h.errorResponse(c, http.StatusBadGateway, "upstream_error", "image URL did not return a supported image")
	default:
		h.errorResponse(c, http.StatusBadGateway, "upstream_error", "failed to download image")
	}
}
