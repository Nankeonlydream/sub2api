package service

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/tlsfingerprint"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

// Claude /v1/messages 流式请求在等待上游响应头期间（含同账号重试）不会向下游
// 写任何字节。上游排队/中转缓冲时间超过 CDN 读超时（Cloudflare 约 120s）时，
// 客户端只会收到 524。这里复用 OpenAI 路径的 SSE 注释心跳（": keepalive"，
// eventsource 解析层直接忽略），首拍延迟一个 stream_keepalive_interval：
// 绝大多数请求在此之前拿到响应头，状态码语义不变。
//
// 首拍之后响应已固化为 200 text/event-stream，后续 JSON 错误由
// claudeHeaderWaitWriter 改写为 Anthropic 标准的 "event: error" 流内终止帧。
// 心跳字节计入 openAIStreamKeepaliveBytesKey，由
// GatewayKeepaliveAdjustedWrittenSize 统一扣除，不影响 failover 换号判定。

const claudeHeaderWaitWriterKey = "claude_header_wait_writer"

// WrapClaudeMessagesHeaderWait 为 Claude 原生流式请求安装错误改写 writer，
// 并允许 GatewayService 在上游等待期间发心跳。幂等；返回的函数恢复原 writer。
// 本身不启动任何计时器。
func WrapClaudeMessagesHeaderWait(c *gin.Context, stream bool) func() {
	if !stream || c == nil || c.Writer == nil {
		return func() {}
	}
	if existing, ok := c.Get(claudeHeaderWaitWriterKey); ok && existing != nil {
		return func() {}
	}
	original := c.Writer
	w := &claudeHeaderWaitWriter{ResponseWriter: original, c: c}
	// 并发排队 ping 可能已在安装前提交了 SSE 响应。
	w.sseCommitted = isSSECommitted(original)
	c.Set(claudeHeaderWaitWriterKey, w)
	c.Writer = w
	return func() {
		if c.Writer == w {
			c.Writer = original
		}
		c.Set(claudeHeaderWaitWriterKey, nil)
	}
}

func isSSECommitted(w gin.ResponseWriter) bool {
	return w.Written() && w.Status() == http.StatusOK &&
		strings.HasPrefix(strings.ToLower(w.Header().Get("Content-Type")), "text/event-stream")
}

type claudeHeaderWaitWriter struct {
	gin.ResponseWriter
	c            *gin.Context
	sseCommitted bool
	errorStatus  int
	terminalSent bool
	writeErr     error
}

func (w *claudeHeaderWaitWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *claudeHeaderWaitWriter) observeCommit(wasWritten bool) {
	if !w.sseCommitted && !wasWritten && isSSECommitted(w.ResponseWriter) {
		w.sseCommitted = true
	}
}

func (w *claudeHeaderWaitWriter) WriteHeader(status int) {
	if w.sseCommitted && status >= 400 {
		w.errorStatus = status
		return
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *claudeHeaderWaitWriter) WriteHeaderNow() {
	wasWritten := w.ResponseWriter.Written()
	w.ResponseWriter.WriteHeaderNow()
	w.observeCommit(wasWritten)
}

func (w *claudeHeaderWaitWriter) Write(p []byte) (int, error) {
	if w.writeErr != nil {
		return 0, w.writeErr
	}
	if w.terminalSent {
		return len(p), nil
	}
	if w.sseCommitted && w.errorStatus >= 400 {
		return w.writeFailure(p)
	}
	wasWritten := w.ResponseWriter.Written()
	n, err := w.ResponseWriter.Write(p)
	w.observeCommit(wasWritten)
	if err != nil {
		w.writeErr = err
	}
	return n, err
}

func (w *claudeHeaderWaitWriter) WriteString(s string) (int, error) { return w.Write([]byte(s)) }
func (w *claudeHeaderWaitWriter) Flush()                            { _ = w.FlushError() }

func (w *claudeHeaderWaitWriter) FlushError() error {
	if w.writeErr != nil {
		return w.writeErr
	}
	wasWritten := w.ResponseWriter.Written()
	err := FlushGatewayResponse(w.ResponseWriter)
	w.observeCommit(wasWritten)
	if err != nil {
		w.writeErr = err
	}
	return err
}

// writeFailure 把已提交 SSE 之后的 JSON 错误响应改写为一条 Anthropic 错误事件。
func (w *claudeHeaderWaitWriter) writeFailure(body []byte) (int, error) {
	message := sanitizeUpstreamErrorMessage(strings.TrimSpace(extractUpstreamErrorMessage(body)))
	if message == "" {
		message = "Upstream request failed"
	}
	errType := strings.TrimSpace(gjson.GetBytes(body, "error.type").String())
	if errType == "" {
		errType = "api_error"
	}
	payload, err := marshalOpenAIUpstreamJSON(gin.H{
		"type":  "error",
		"error": gin.H{"type": errType, "message": message},
	})
	if err != nil {
		payload = []byte(`{"type":"error","error":{"type":"api_error","message":"Upstream request failed"}}`)
	}
	w.terminalSent = true
	MarkResponseCommitted(w.c)
	MarkOpsStreamError(w.c, errType, message, w.errorStatus)
	frame := "event: error\ndata: " + string(payload) + "\n\n"
	if _, err := w.ResponseWriter.WriteString(frame); err != nil {
		w.writeErr = err
		return 0, err
	}
	if err := w.FlushError(); err != nil {
		return 0, err
	}
	return len(body), nil
}

// startClaudeHeaderWaitKeepalive 只能包裹一次上游 transport 调用：心跳期间请求
// goroutine 不访问 gin writer；返回的 stop 与心跳 goroutine 同步后才恢复写回。
func (s *GatewayService) startClaudeHeaderWaitKeepalive(c *gin.Context, stream bool) func() {
	if !stream || c == nil || s == nil || s.cfg == nil || s.cfg.Gateway.StreamKeepaliveInterval <= 0 {
		return func() {}
	}
	raw, ok := c.Get(claudeHeaderWaitWriterKey)
	w, okWriter := raw.(*claudeHeaderWaitWriter)
	if !ok || !okWriter || w == nil || w.writeErr != nil || w.terminalSent || c.Writer != w {
		return func() {}
	}
	if existing, ok := c.Get(openAICompactSSEKeepaliveKey); ok && existing != nil {
		return func() {}
	}
	return startClaudeHeaderWaitKeepaliveInterval(c, time.Duration(s.cfg.Gateway.StreamKeepaliveInterval)*time.Second)
}

func startClaudeHeaderWaitKeepaliveInterval(c *gin.Context, interval time.Duration) func() {
	stop := startOpenAISSEKeepalive(c, interval)
	value, _ := c.Get(openAICompactSSEKeepaliveKey)
	k, _ := value.(*openAICompactSSEKeepalive)
	var once sync.Once
	return func() {
		once.Do(func() {
			stop()
			if k == nil {
				return
			}
			// Stop 已获取 k.mu：所有心跳写入 happens-before 此处。
			k.mu.Lock()
			n := k.bytes
			k.mu.Unlock()
			recordOpenAIStreamKeepaliveBytes(c, n)
			c.Set(openAICompactSSEKeepaliveKey, nil)
		})
	}
}

// GatewayKeepaliveAdjustedWrittenSize 返回扣除上游等待心跳字节后的已写字节数；
// 仅有心跳时返回 -1（gin 的"未写出"哨兵值）。无心跳时等价于 c.Writer.Size()。
func GatewayKeepaliveAdjustedWrittenSize(c *gin.Context) int {
	return OpenAICompactKeepaliveAdjustedWrittenSize(c)
}

// doClaudeUpstreamWithHeaderWaitKeepalive 发送 Claude 上游请求；流式请求等待
// 响应头期间向下游发心跳，返回前停止并与心跳 goroutine 同步。
func (s *GatewayService) doClaudeUpstreamWithHeaderWaitKeepalive(c *gin.Context, stream bool, req *http.Request, proxyURL string, account *Account, profile *tlsfingerprint.Profile) (*http.Response, error) {
	stop := s.startClaudeHeaderWaitKeepalive(c, stream)
	defer stop()
	return s.httpUpstream.DoWithTLS(req, proxyURL, account.ID, account.Concurrency, profile)
}
