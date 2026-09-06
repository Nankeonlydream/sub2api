package middleware

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIsAsyncImageTaskRead(t *testing.T) {
	require.True(t, isAsyncImageTaskRead(http.MethodGet, "/v1/images/tasks/imgtask_123"))
	require.True(t, isAsyncImageTaskRead(http.MethodGet, "/images/tasks/imgtask_123"))
	require.False(t, isAsyncImageTaskRead(http.MethodPost, "/v1/images/tasks/imgtask_123"))
	require.False(t, isAsyncImageTaskRead(http.MethodGet, "/v1/images/generations"))
}

func TestIsAsyncVideoTaskRead(t *testing.T) {
	require.True(t, isAsyncVideoTaskRead(http.MethodGet, "/v1/videos/video-task-123"))
	require.True(t, isAsyncVideoTaskRead(http.MethodGet, "/v1/videos/video-task-123/content"))
	require.True(t, isAsyncVideoTaskRead(http.MethodGet, "/videos/video-task-123"))
	require.False(t, isAsyncVideoTaskRead(http.MethodPost, "/v1/videos/video-task-123"))
	require.False(t, isAsyncVideoTaskRead(http.MethodGet, "/v1/videos"))
}
