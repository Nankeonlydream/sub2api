package handler

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type creatorDownloadTransport func(*http.Request) (*http.Response, error)

func (f creatorDownloadTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestCreatorImageDownloadStreamingResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, oversized := range []bool{false, true} {
		name := "complete"
		if oversized {
			name = "abort_partial_image"
		}
		t.Run(name, func(t *testing.T) {
			data := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 592)...)
			if oversized {
				data = append(data, 0)
			}
			client := &http.Client{Transport: creatorDownloadTransport(func(r *http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(data)), ContentLength: -1}, nil
			})}
			h := &OpenAIGatewayHandler{creatorImageDownloader: service.NewCreatorImageDownloader(client, 600)}
			r := gin.New()
			r.Use(middleware.Recovery())
			r.POST("/download", h.CreatorImageDownload)
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/download", strings.NewReader(`{"url":"https://8.8.8.8/image.png"}`))
			req.Header.Set("Content-Type", "application/json")
			run := func() { r.ServeHTTP(w, req) }
			if oversized {
				require.PanicsWithValue(t, http.ErrAbortHandler, run)
			} else {
				run()
			}
			require.Equal(t, http.StatusOK, w.Code)
			require.Equal(t, data[:600], w.Body.Bytes())
			require.Equal(t, "image/png", w.Header().Get("Content-Type"))
			require.Equal(t, "no", w.Header().Get("X-Accel-Buffering"))
			require.True(t, w.Flushed)
		})
	}
}
