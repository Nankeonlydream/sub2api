package service

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/pkg/tlsfingerprint"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

type claudeSlowHeaderUpstream struct {
	delay time.Duration
	calls int
}

func (u *claudeSlowHeaderUpstream) Do(req *http.Request, proxyURL string, accountID int64, concurrency int) (*http.Response, error) {
	return u.DoWithTLS(req, proxyURL, accountID, concurrency, nil)
}

func (u *claudeSlowHeaderUpstream) DoWithTLS(req *http.Request, _ string, _ int64, _ int, _ *tlsfingerprint.Profile) (*http.Response, error) {
	u.calls++
	time.Sleep(u.delay)
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body:       io.NopCloser(strings.NewReader("")),
		Request:    req,
	}, nil
}

func newClaudeHeaderWaitTestContext(t *testing.T) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	return c, rec
}

func claudeErrorJSON(errType, message string) gin.H {
	return gin.H{"type": "error", "error": gin.H{"type": errType, "message": message}}
}

func TestClaudeHeaderWaitKeepaliveDuringSlowUpstream(t *testing.T) {
	c, rec := newClaudeHeaderWaitTestContext(t)
	restore := WrapClaudeMessagesHeaderWait(c, true)
	t.Cleanup(restore)
	before := GatewayKeepaliveAdjustedWrittenSize(c)

	upstream := &claudeSlowHeaderUpstream{delay: 1300 * time.Millisecond}
	svc := &GatewayService{
		cfg:          &config.Config{Gateway: config.GatewayConfig{StreamKeepaliveInterval: 1}},
		httpUpstream: upstream,
	}
	req := httptest.NewRequest(http.MethodPost, "https://upstream.example/v1/messages", nil)
	resp, err := svc.doClaudeUpstreamWithHeaderWaitKeepalive(c, true, req, "", &Account{ID: 1, Concurrency: 1}, nil)
	require.NoError(t, err)
	_ = resp.Body.Close()

	require.Contains(t, rec.Body.String(), ": keepalive\n\n")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "text/event-stream", rec.Header().Get("Content-Type"))
	// 心跳不是语义输出：failover 判定与流读错误换号都不能被污染。
	require.Equal(t, before, GatewayKeepaliveAdjustedWrittenSize(c))
	require.Equal(t, -1, GatewayKeepaliveAdjustedWrittenSize(c))
	_, isCompactWriter := c.Writer.(*openAICompactKeepaliveWriter)
	require.False(t, isCompactWriter, "heartbeat writer must be removed after header wait")

	// 上游正常数据随后写出，计入语义输出。
	_, err = c.Writer.WriteString("event: message_start\ndata: {}\n\n")
	require.NoError(t, err)
	require.Greater(t, GatewayKeepaliveAdjustedWrittenSize(c), 0)
}

func TestClaudeHeaderWaitConvertsJSONErrorAfterHeartbeat(t *testing.T) {
	c, rec := newClaudeHeaderWaitTestContext(t)
	signal := &headerWaitFlushSignalWriter{ResponseWriter: c.Writer, flushed: make(chan struct{}, 8)}
	c.Writer = signal
	restore := WrapClaudeMessagesHeaderWait(c, true)
	t.Cleanup(restore)

	stop := startClaudeHeaderWaitKeepaliveInterval(c, 5*time.Millisecond)
	waitHeaderWaitBeat(t, signal.flushed)
	stop()
	require.Contains(t, rec.Body.String(), ": keepalive")

	c.JSON(http.StatusTooManyRequests, claudeErrorJSON("rate_limit_error", "slow down"))

	body := rec.Body.String()
	require.Equal(t, http.StatusOK, rec.Code)
	idx := strings.Index(body, "event: error\ndata: ")
	require.GreaterOrEqual(t, idx, 0, body)
	data := strings.TrimSpace(strings.TrimPrefix(body[idx:], "event: error\ndata: "))
	require.Equal(t, "error", gjson.Get(data, "type").String())
	require.Equal(t, "rate_limit_error", gjson.Get(data, "error.type").String())
	require.Equal(t, "slow down", gjson.Get(data, "error.message").String())
	require.True(t, IsResponseCommitted(c))

	// 终止帧之后的写入被吞掉，避免拼接第二个错误。
	c.JSON(http.StatusBadGateway, claudeErrorJSON("api_error", "again"))
	require.Equal(t, 1, strings.Count(rec.Body.String(), "event: error"))
}

func TestClaudeHeaderWaitFastUpstreamKeepsJSONStatus(t *testing.T) {
	c, rec := newClaudeHeaderWaitTestContext(t)
	restore := WrapClaudeMessagesHeaderWait(c, true)
	t.Cleanup(restore)

	stop := startClaudeHeaderWaitKeepaliveInterval(c, time.Hour)
	stop()
	require.Equal(t, -1, GatewayKeepaliveAdjustedWrittenSize(c))

	c.JSON(http.StatusTooManyRequests, claudeErrorJSON("rate_limit_error", "slow down"))
	require.Equal(t, http.StatusTooManyRequests, rec.Code)
	require.NotContains(t, rec.Body.String(), "event: error")
	require.Equal(t, "rate_limit_error", gjson.Get(rec.Body.String(), "error.type").String())
}

func TestClaudeHeaderWaitConvertsErrorAfterConcurrencyPing(t *testing.T) {
	c, rec := newClaudeHeaderWaitTestContext(t)
	// 并发排队 ping 在安装包装 writer 之前已提交 SSE。
	c.Header("Content-Type", "text/event-stream")
	_, err := c.Writer.WriteString("data: {\"type\": \"ping\"}\n\n")
	require.NoError(t, err)
	c.Writer.Flush()

	restore := WrapClaudeMessagesHeaderWait(c, true)
	t.Cleanup(restore)
	c.JSON(http.StatusBadRequest, claudeErrorJSON("invalid_request_error", "bad"))

	require.Contains(t, rec.Body.String(), "event: error\ndata: ")
	require.NotContains(t, rec.Body.String(), "\n{\"error\"")
}

func TestClaudeHeaderWaitNonStreamIsNoop(t *testing.T) {
	c, _ := newClaudeHeaderWaitTestContext(t)
	original := c.Writer
	restore := WrapClaudeMessagesHeaderWait(c, false)
	restore()
	require.Equal(t, original, c.Writer)

	svc := &GatewayService{cfg: &config.Config{Gateway: config.GatewayConfig{StreamKeepaliveInterval: 1}}}
	stop := svc.startClaudeHeaderWaitKeepalive(c, true)
	stop()
	require.Equal(t, original, c.Writer, "keepalive requires the Claude header-wait writer")
}
