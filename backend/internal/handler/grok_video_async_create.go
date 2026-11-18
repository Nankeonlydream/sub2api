package handler

import (
	"bytes"
	"context"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"strings"
	"time"

	pkghttputil "github.com/Wei-Shaw/sub2api/internal/pkg/httputil"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"go.uber.org/zap"
)

// Native Grok video creates normally answer with the upstream task ID. A slow
// upstream that holds the create for minutes runs past CDN read timeouts
// (Cloudflare answers 524 after 125s), and the client loses the task while the
// upstream may still generate it.
//
// handleGrokVideoCreate runs the unchanged create path against a captured
// response. A create that finishes within the wait is answered exactly as
// before. Otherwise the client gets a gateway task ID with status "pending",
// the create keeps running with its own lifetime (holding its balance
// reservation and concurrency slots), and its outcome is recorded under that
// ID. Billing stays keyed by the upstream task ID inside the create path.
func (h *OpenAIGatewayHandler) handleGrokVideoCreate(c *gin.Context, endpoint service.GrokMediaEndpoint) {
	wait := h.gatewayService.GrokVideoAsyncCreateWait()
	apiKey, okKey := middleware2.GetAPIKeyFromContext(c)
	subject, okSubject := middleware2.GetAuthSubjectFromContext(c)
	if wait <= 0 || !okKey || !okSubject || apiKey == nil || !h.gatewayService.HasGrokVideoAsyncCreateStore() {
		h.handleGrokMedia(c, endpoint, "")
		return
	}

	body, err := pkghttputil.ReadRequestBodyWithPrealloc(c.Request)
	if err != nil {
		if maxErr, ok := extractMaxBytesError(err); ok {
			h.errorResponse(c, http.StatusRequestEntityTooLarge, "invalid_request_error", buildBodyTooLargeMessage(maxErr.Limit))
			return
		}
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to read request body")
		return
	}
	restoreBody := func(req *http.Request) {
		req.Body = io.NopCloser(bytes.NewReader(body))
		req.ContentLength = int64(len(body))
	}

	// The record must exist before any upstream submission: a create whose
	// gateway ID could not be stored falls back to the synchronous path.
	taskID := service.NewGrokVideoAsyncCreateID()
	reqLog := requestLogger(c, "handler.openai_gateway.grok_video_async_create",
		zap.Int64("user_id", subject.UserID), zap.Int64("api_key_id", apiKey.ID),
		zap.String("endpoint", string(endpoint)), zap.String("gateway_task_id", taskID))
	pending := service.GrokVideoAsyncCreate{State: service.GrokVideoAsyncCreatePending, CreatedAt: time.Now().UTC()}
	if err := h.gatewayService.StoreGrokVideoAsyncCreate(c.Request.Context(), taskID, subject.UserID, apiKey.ID, pending); err != nil {
		reqLog.Warn("grok_video_async_create.store_pending_failed_sync_fallback", zap.Error(err))
		restoreBody(c.Request)
		h.handleGrokMedia(c, endpoint, "")
		return
	}

	bgCtx, endOwner := service.DetachAPIKeyAdmissionOwner(c.Request.Context())
	recorder := httptest.NewRecorder()
	bg, _ := gin.CreateTestContext(recorder)
	bgReq := c.Request.Clone(bgCtx)
	restoreBody(bgReq)
	bg.Request = bgReq
	bg.Params = append(gin.Params(nil), c.Params...)
	bg.Keys = maps.Clone(c.Keys)

	done := make(chan struct{})
	go func() {
		defer close(done)
		defer endOwner()
		defer func() {
			if r := recover(); r != nil {
				reqLog.Error("grok_video_async_create.background_panic", zap.Any("panic", r))
			}
		}()
		h.handleGrokMedia(bg, endpoint, "")
	}()

	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-done:
		// Same answer as the synchronous path; keep the ops context it built.
		for k, v := range bg.Keys {
			c.Set(k, v)
		}
		// The client got the upstream ID; the unused pending record expires.
		writeCapturedGrokVideoCreate(c, bg, recorder)
		return
	case <-timer.C:
	}

	reqLog.Info("grok_video_async_create.answered_with_gateway_task", zap.Duration("wait", wait))
	c.JSON(http.StatusOK, grokVideoAsyncTaskBody(taskID, service.GrokVideoAsyncCreatePending))
	go func() {
		<-done
		h.finishGrokVideoAsyncCreate(reqLog, taskID, subject.UserID, apiKey.ID, pending.CreatedAt, bg, recorder)
	}()
}

func grokVideoAsyncTaskBody(taskID, status string) gin.H {
	return gin.H{"request_id": taskID, "id": taskID, "status": status}
}

// writeCapturedGrokVideoCreate replays a finished create onto the client.
func writeCapturedGrokVideoCreate(c *gin.Context, bg *gin.Context, recorder *httptest.ResponseRecorder) {
	if !bg.Writer.Written() && recorder.Body.Len() == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": gin.H{"type": "upstream_error", "message": "Upstream request failed"}})
		return
	}
	headers := c.Writer.Header()
	for name, values := range recorder.Header() {
		headers[name] = append([]string(nil), values...)
	}
	c.Status(bg.Writer.Status())
	_, _ = c.Writer.Write(recorder.Body.Bytes())
}

// finishGrokVideoAsyncCreate records the create outcome under the gateway ID.
func (h *OpenAIGatewayHandler) finishGrokVideoAsyncCreate(reqLog *zap.Logger, taskID string, userID, apiKeyID int64, createdAt time.Time, bg *gin.Context, recorder *httptest.ResponseRecorder) {
	status := bg.Writer.Status()
	body := recorder.Body.Bytes()
	record := service.GrokVideoAsyncCreate{CreatedAt: createdAt}
	if upstreamID := service.ExtractGrokVideoCreateTaskID(body); status >= 200 && status < 300 && upstreamID != "" && !service.IsGrokVideoAsyncCreateID(upstreamID) {
		record.State, record.UpstreamID = service.GrokVideoAsyncCreateAccepted, upstreamID
	} else {
		if status < 400 {
			status = http.StatusBadGateway
		}
		record.State, record.StatusCode = service.GrokVideoAsyncCreateFailed, status
		record.Body = service.TruncateGrokVideoAsyncCreateBody(body)
	}
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err = h.gatewayService.StoreGrokVideoAsyncCreate(ctx, taskID, userID, apiKeyID, record)
		cancel()
		if err == nil {
			break
		}
		time.Sleep(time.Duration(attempt+1) * 500 * time.Millisecond)
	}
	if err != nil {
		// The upstream task is still billed and settled by its upstream ID; only
		// lookups by the gateway ID fail and later report an interrupted create.
		reqLog.Error("grok_video_async_create.store_outcome_failed",
			zap.String("state", record.State), zap.String("upstream_task_id", record.UpstreamID), zap.Error(err))
		return
	}
	reqLog.Info("grok_video_async_create.outcome_recorded",
		zap.String("state", record.State), zap.String("upstream_task_id", record.UpstreamID), zap.Int("status_code", record.StatusCode))
}

// handleGrokVideoAsyncLookup answers status/content lookups by gateway task ID.
// An accepted task is looked up by its upstream ID through the unchanged
// lookup path, so ownership checks and billing behave as for upstream IDs.
func (h *OpenAIGatewayHandler) handleGrokVideoAsyncLookup(c *gin.Context, endpoint service.GrokMediaEndpoint, taskID string) {
	apiKey, okKey := middleware2.GetAPIKeyFromContext(c)
	subject, okSubject := middleware2.GetAuthSubjectFromContext(c)
	if !okKey || !okSubject || apiKey == nil {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}
	if !h.gatewayService.HasGrokVideoAsyncCreateStore() {
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "Video status is temporarily unavailable; please retry")
		return
	}
	record, err := h.gatewayService.LoadGrokVideoAsyncCreate(c.Request.Context(), taskID, subject.UserID, apiKey.ID)
	if err != nil {
		requestLogger(c, "handler.openai_gateway.grok_video_async_lookup").Warn("grok_video_async_create.load_failed",
			zap.String("gateway_task_id", taskID), zap.Error(err))
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "Video status is temporarily unavailable; please retry")
		return
	}
	if record == nil {
		h.errorResponse(c, http.StatusNotFound, "not_found_error", "Video request not found")
		return
	}
	switch {
	case record.State == service.GrokVideoAsyncCreateAccepted && strings.TrimSpace(record.UpstreamID) != "":
		h.handleGrokMedia(c, endpoint, record.UpstreamID)
	case record.State == service.GrokVideoAsyncCreatePending && !record.Stale(time.Now()):
		if endpoint == service.GrokMediaEndpointVideoContent {
			h.errorResponse(c, http.StatusNotFound, "not_found_error", "Video is not ready yet")
			return
		}
		c.JSON(http.StatusOK, grokVideoAsyncTaskBody(taskID, service.GrokVideoAsyncCreatePending))
	default:
		statusCode, code, message := grokVideoAsyncFailure(record)
		if endpoint == service.GrokMediaEndpointVideoContent {
			h.errorResponse(c, statusCode, "upstream_error", message)
			return
		}
		body := grokVideoAsyncTaskBody(taskID, service.GrokVideoAsyncCreateFailed)
		body["error"] = gin.H{"code": code, "message": message}
		c.JSON(http.StatusOK, body)
	}
}

// grokVideoAsyncFailure describes a failed or interrupted create.
func grokVideoAsyncFailure(record *service.GrokVideoAsyncCreate) (int, string, string) {
	if record.State != service.GrokVideoAsyncCreateFailed {
		return http.StatusBadGateway, "submission_interrupted", "Video submission was interrupted; please submit again"
	}
	statusCode := record.StatusCode
	if statusCode < 400 {
		statusCode = http.StatusBadGateway
	}
	message := ""
	code := "upstream_error"
	if len(record.Body) > 0 {
		if gjson.ValidBytes(record.Body) {
			parsed := gjson.ParseBytes(record.Body)
			if parsed.Type == gjson.String {
				message = parsed.String()
			}
			for _, path := range []string{"error.message", "message", "error", "detail"} {
				if value := parsed.Get(path); message == "" && value.Type == gjson.String {
					message = value.String()
				}
			}
			for _, path := range []string{"error.code", "error.type", "code"} {
				if value := parsed.Get(path); code == "upstream_error" && value.Exists() && strings.TrimSpace(value.String()) != "" {
					code = value.String()
				}
			}
		}
	}
	if strings.TrimSpace(message) == "" {
		message = "Video submission failed"
	}
	return statusCode, code, message
}
