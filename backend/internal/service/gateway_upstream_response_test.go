package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestExtractUpstreamErrorMessage(t *testing.T) {
	tests := []struct {
		name string
		body string
		want string
	}{
		{
			name: "nested error message",
			body: `{"type":"error","error":{"type":"invalid_request_error","message":"invalid reference image"}}`,
			want: "invalid reference image",
		},
		{
			name: "xAI top-level error string",
			body: `{"error":"Reference image exceeds the allowed dimensions"}`,
			want: "Reference image exceeds the allowed dimensions",
		},
		{
			name: "JSON encoded error string",
			body: `{"error":"{\"detail\":\"Unsupported image format\"}"}`,
			want: "Unsupported image format",
		},
		{
			name: "detail",
			body: `{"detail":"  validation failed  "}`,
			want: "validation failed",
		},
		{
			name: "message fallback",
			body: `{"message":"  request rejected  "}`,
			want: "request rejected",
		},
		{
			name: "invalid body",
			body: `bad gateway`,
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, ExtractUpstreamErrorMessage([]byte(tt.body)))
		})
	}
}

func TestHandleGrokMediaErrorResponseReturnsXAIValidationReason(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos/generations", nil)
	response := &http.Response{
		StatusCode: http.StatusBadRequest,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body: io.NopCloser(strings.NewReader(
			`{"error":"Reference image resolution is invalid: shortest side must be at least 8 pixels"}`,
		)),
	}

	result, err := (&OpenAIGatewayService{}).handleGrokMediaErrorResponse(
		context.Background(),
		response,
		c,
		&Account{ID: 1, Platform: PlatformGrok, Type: AccountTypeOAuth},
		"xai-request-id",
		"grok-imagine-video-1.5",
	)

	require.Nil(t, result)
	require.Error(t, err)
	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.JSONEq(t, `{
		"error": {
			"type": "invalid_request_error",
			"message": "Reference image resolution is invalid: shortest side must be at least 8 pixels"
		}
	}`, recorder.Body.String())
}
