//go:build unit

package handler

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type grokAsyncUpstream struct {
	release   chan struct{}
	creates   atomic.Int32
	lookups   atomic.Int32
	createSt  int
	createRaw string
	lastPath  atomic.Value
}

func newGrokAsyncHandler(t *testing.T, wait int, upstream *grokAsyncUpstream) (*OpenAIGatewayHandler, *grokMediaSlotsCache) {
	t.Helper()
	h, slots, _, up := newGrokMediaSlotHandler(t, false, false)
	h.cfg.Gateway.GrokVideoAsyncCreateWaitSeconds = wait
	up.call = func(req *http.Request, _ int64) (*http.Response, error) {
		upstream.lastPath.Store(req.URL.Path)
		if req.Method == http.MethodPost {
			upstream.creates.Add(1)
			if upstream.release != nil {
				<-upstream.release
			}
			status, raw := upstream.createSt, upstream.createRaw
			if status == 0 {
				status, raw = http.StatusOK, `{"request_id":"task","status":"pending"}`
			}
			return &http.Response{StatusCode: status, Header: http.Header{"Content-Type": []string{"application/json"}},
				Body: io.NopCloser(strings.NewReader(raw))}, nil
		}
		upstream.lookups.Add(1)
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{"request_id":"task","status":"pending"}`))}, nil
	}
	return h, slots
}

func grokAsyncLookup(t *testing.T, h *OpenAIGatewayHandler, taskID string, content bool) (int, map[string]any) {
	t.Helper()
	c, w := grokMediaSlotContext(context.Background(), false)
	c.Request.URL.Path = "/v1/videos/" + taskID
	c.Params = gin.Params{{Key: "request_id", Value: taskID}}
	if content {
		c.Request.URL.Path += "/content"
		h.GrokVideoContent(c)
	} else {
		h.GrokVideoStatus(c)
	}
	var body map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	return w.Code, body
}

func grokAsyncRecord(t *testing.T, h *OpenAIGatewayHandler, taskID string) *service.GrokVideoAsyncCreate {
	t.Helper()
	record, err := h.gatewayService.LoadGrokVideoAsyncCreate(context.Background(), taskID, 10, 20)
	require.NoError(t, err)
	return record
}

func TestGrokVideoCreateFastUpstreamKeepsSynchronousAnswer(t *testing.T) {
	upstream := &grokAsyncUpstream{}
	h, slots := newGrokAsyncHandler(t, 5, upstream)
	c, w := grokMediaSlotContext(context.Background(), true)
	h.GrokVideoGeneration(c)

	require.Equal(t, http.StatusOK, w.Code)
	require.JSONEq(t, `{"request_id":"task","status":"pending"}`, w.Body.String(), "fast creates return the upstream task unchanged")
	require.Equal(t, "application/json", w.Header().Get("Content-Type"))
	require.EqualValues(t, 1, upstream.creates.Load())
	slots.assertReleased(t)
	pending, err := h.gatewayService.LoadGrokVideoPendingBilling(context.Background(), "task", 10, 20)
	require.NoError(t, err)
	require.NotNil(t, pending, "billing snapshot stays keyed by the upstream task ID")
}

func TestGrokVideoCreateDisabledWaitUsesSynchronousPath(t *testing.T) {
	upstream := &grokAsyncUpstream{}
	h, _ := newGrokAsyncHandler(t, 0, upstream)
	c, w := grokMediaSlotContext(context.Background(), true)
	h.GrokVideoGeneration(c)
	require.Equal(t, http.StatusOK, w.Code)
	require.JSONEq(t, `{"request_id":"task","status":"pending"}`, w.Body.String())
}

func TestGrokVideoCreateSlowUpstreamAnswersWithGatewayTask(t *testing.T) {
	upstream := &grokAsyncUpstream{release: make(chan struct{})}
	h, slots := newGrokAsyncHandler(t, 1, upstream)
	// The client request ends at the wait; the background create must survive it.
	ctx, cancel := context.WithCancel(context.Background())
	c, w := grokMediaSlotContext(ctx, true)
	started := time.Now()
	h.GrokVideoGeneration(c)
	cancel()
	require.Less(t, time.Since(started), 3*time.Second)

	require.Equal(t, http.StatusOK, w.Code)
	var created map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &created))
	taskID, _ := created["request_id"].(string)
	require.True(t, service.IsGrokVideoAsyncCreateID(taskID), "body=%s", w.Body.String())
	require.Equal(t, "pending", created["status"])

	code, body := grokAsyncLookup(t, h, taskID, false)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "pending", body["status"])
	require.Equal(t, taskID, body["request_id"])
	code, _ = grokAsyncLookup(t, h, taskID, true)
	require.Equal(t, http.StatusNotFound, code, "content is not ready before the upstream task exists")
	require.Zero(t, upstream.lookups.Load(), "pending gateway tasks never reach the upstream")

	close(upstream.release)
	require.Eventually(t, func() bool {
		record := grokAsyncRecord(t, h, taskID)
		return record != nil && record.State == service.GrokVideoAsyncCreateAccepted
	}, 5*time.Second, 10*time.Millisecond)
	require.Equal(t, "task", grokAsyncRecord(t, h, taskID).UpstreamID)
	require.EqualValues(t, 1, upstream.creates.Load(), "the create is submitted exactly once")
	slots.assertReleased(t)

	pending, err := h.gatewayService.LoadGrokVideoPendingBilling(context.Background(), "task", 10, 20)
	require.NoError(t, err)
	require.NotNil(t, pending, "billing snapshot is written by the unchanged create path")
	unrelated, err := h.gatewayService.LoadGrokVideoPendingBilling(context.Background(), taskID, 10, 20)
	require.NoError(t, err)
	require.Nil(t, unrelated, "a gateway task ID never loads as a billing snapshot")

	code, body = grokAsyncLookup(t, h, taskID, false)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "pending", body["status"])
	require.EqualValues(t, 1, upstream.lookups.Load())
	require.Equal(t, "/v1/videos/task", upstream.lastPath.Load(), "lookups are translated to the upstream task")
	slots.assertReleased(t)
}

func TestGrokVideoCreateSlowUpstreamFailureIsReported(t *testing.T) {
	upstream := &grokAsyncUpstream{release: make(chan struct{}), createSt: http.StatusBadRequest,
		createRaw: `{"error":{"message":"resolution 1080p is not supported","type":"invalid_request_error"}}`}
	h, slots := newGrokAsyncHandler(t, 1, upstream)
	c, w := grokMediaSlotContext(context.Background(), true)
	h.GrokVideoGeneration(c)
	var created map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &created))
	taskID, _ := created["request_id"].(string)
	require.True(t, service.IsGrokVideoAsyncCreateID(taskID))

	close(upstream.release)
	require.Eventually(t, func() bool {
		record := grokAsyncRecord(t, h, taskID)
		return record != nil && record.State == service.GrokVideoAsyncCreateFailed
	}, 5*time.Second, 10*time.Millisecond)
	slots.assertReleased(t)

	code, body := grokAsyncLookup(t, h, taskID, false)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "failed", body["status"])
	failure, _ := body["error"].(map[string]any)
	require.Contains(t, failure["message"], "1080p")
	code, _ = grokAsyncLookup(t, h, taskID, true)
	require.Equal(t, http.StatusBadRequest, code)
	require.Zero(t, upstream.lookups.Load())
}

func TestGrokVideoAsyncLookupIsolationAndStaleness(t *testing.T) {
	h, _ := newGrokAsyncHandler(t, 1, &grokAsyncUpstream{})
	taskID := service.NewGrokVideoAsyncCreateID()
	require.NoError(t, h.gatewayService.StoreGrokVideoAsyncCreate(context.Background(), taskID, 10, 20,
		service.GrokVideoAsyncCreate{State: service.GrokVideoAsyncCreateAccepted, UpstreamID: "task", CreatedAt: time.Now()}))

	for _, other := range []string{"user", "api key"} {
		c, w := grokMediaSlotContext(context.Background(), false)
		c.Params = gin.Params{{Key: "request_id", Value: taskID}}
		key, ok := middleware2.GetAPIKeyFromContext(c)
		require.True(t, ok)
		if other == "user" {
			c.Set(string(middleware2.ContextKeyUser), middleware2.AuthSubject{UserID: 11, Concurrency: 5})
		} else {
			key.ID = 21
		}
		h.GrokVideoStatus(c)
		require.Equal(t, http.StatusNotFound, w.Code, other)
	}

	code, _ := grokAsyncLookup(t, h, service.NewGrokVideoAsyncCreateID(), false)
	require.Equal(t, http.StatusNotFound, code)

	stale := service.NewGrokVideoAsyncCreateID()
	require.NoError(t, h.gatewayService.StoreGrokVideoAsyncCreate(context.Background(), stale, 10, 20,
		service.GrokVideoAsyncCreate{State: service.GrokVideoAsyncCreatePending, CreatedAt: time.Now().Add(-time.Hour)}))
	code, body := grokAsyncLookup(t, h, stale, false)
	require.Equal(t, http.StatusOK, code)
	require.Equal(t, "failed", body["status"])
	failure, _ := body["error"].(map[string]any)
	require.Equal(t, "submission_interrupted", failure["code"])
}
