package handler

import (
	"errors"
	"io"
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
	err := downloader.Stream(c.Request.Context(), request.URL, func(response *http.Response, body io.Reader) error {
		extension := response.Header.Get("X-Creator-Image-Extension")
		c.Header("Content-Disposition", `attachment; filename="creator-image.`+extension+`"`)
		c.Header("Cache-Control", "private, no-store")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Type", response.Header.Get("Content-Type"))
		c.Header("X-Accel-Buffering", "no")
		if response.ContentLength >= 0 {
			c.Header("Content-Length", strconv.FormatInt(response.ContentLength, 10))
		}
		c.Status(http.StatusOK)
		_, copyErr := io.Copy(creatorImageFlushWriter{c.Writer}, body)
		return copyErr
	})
	if err != nil {
		if c.Writer.Written() {
			_ = c.Error(err)
			c.Abort()
			// Abort the HTTP stream so fetch/blob cannot accept a partial image.
			panic(http.ErrAbortHandler)
		}
		h.creatorImageDownloadError(c, err)
		return
	}
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

// Flush each copied chunk so neither net/http nor a proxy holds the full image.
type creatorImageFlushWriter struct{ gin.ResponseWriter }

func (w creatorImageFlushWriter) Write(p []byte) (int, error) {
	n, err := w.ResponseWriter.Write(p)
	if n > 0 {
		w.ResponseWriter.Flush()
	}
	return n, err
}
