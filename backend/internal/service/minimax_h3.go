package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
	"go.uber.org/zap"
	"io"
	"math"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

const (
	MiniMaxH3EndpointCreate           GrokMediaEndpoint        = "minimax_h3_create"
	MiniMaxH3EndpointStatus           GrokMediaEndpoint        = "minimax_h3_status"
	MiniMaxH3EndpointContent          GrokMediaEndpoint        = "minimax_h3_content"
	OpenAIEndpointCapabilityMiniMaxH3 OpenAIEndpointCapability = "minimax_h3"
	MiniMaxH3PriceFamily                                       = "minimax-h3"
	MiniMaxH3PerSecond                                         = "per_second"
)

func (e GrokMediaEndpoint) IsMiniMaxH3() bool {
	return e == MiniMaxH3EndpointCreate || e == MiniMaxH3EndpointStatus || e == MiniMaxH3EndpointContent
}

func MiniMaxH3TaskKey(id string) string { return "minimax-h3:" + strings.TrimSpace(id) }

// miniMaxH3Tier is one DeepKey (minimax-h3 group) H3 model ID. The ID fixes
// the resolution and either a fixed length or a 10-15 second range.
type miniMaxH3Tier struct {
	Resolution             string
	MinSeconds, MaxSeconds int
	AllowedSeconds         []int
	// Zhongheng tiers speak Zhongheng's request shape and are priced per model
	// ID in the group tariff; PerRequest ones charge once per video.
	Zhongheng, PerRequest bool
	// The upstream fails prompt-only jobs; reject them before quoting.
	RequiresReference bool
}

// DeepKey guide-minimax-h3-video (updated 2026-09-17), /api/pricing observed
// 2026-10-29.
var miniMaxH3Tiers = map[string]miniMaxH3Tier{
	"minimax-h3-768p-933-10s":     {Resolution: "768p", MinSeconds: 10, MaxSeconds: 10},
	"minimax-h3-768p-933-15s":     {Resolution: "768p", MinSeconds: 15, MaxSeconds: 15},
	"minimax-h3-768p-933-10s-15s": {Resolution: "768p", MinSeconds: 10, MaxSeconds: 15},
	"minimax-h3-933-1440p-10s":    {Resolution: "1440p", MinSeconds: 10, MaxSeconds: 10},
	"minimax-h3-933-1440p-15s":    {Resolution: "1440p", MinSeconds: 15, MaxSeconds: 15},
	"minimax-h3-933-1440p-10-15s": {Resolution: "1440p", MinSeconds: 10, MaxSeconds: 15},
	// Zhongheng /v1/models?include_capabilities=1 observed 2026-10-30; its 2k
	// is the 1440p class.
	"xminimex-h3":   {Resolution: "1440p", MinSeconds: 5, MaxSeconds: 15, Zhongheng: true},
	"minimaxh3-768": {Resolution: "768p", MinSeconds: 5, MaxSeconds: 15, AllowedSeconds: []int{5, 6, 7, 9, 10, 11, 12, 13, 14, 15}, Zhongheng: true, PerRequest: true, RequiresReference: true},
}

func lookupMiniMaxH3Tier(model string) (miniMaxH3Tier, bool) {
	tier, ok := miniMaxH3Tiers[strings.ToLower(strings.TrimSpace(model))]
	return tier, ok
}

func (t miniMaxH3Tier) allows(seconds int) bool {
	if len(t.AllowedSeconds) > 0 {
		return slices.Contains(t.AllowedSeconds, seconds)
	}
	return seconds >= t.MinSeconds && seconds <= t.MaxSeconds
}

func miniMaxH3IntegerField(value gjson.Result) (int, bool) {
	switch value.Type {
	case gjson.Number:
		n := int(value.Int())
		return n, float64(n) == value.Float()
	case gjson.String:
		n, err := strconv.Atoi(value.String())
		return n, err == nil && value.String() == strconv.Itoa(n)
	}
	return 0, false
}

// DeepKey tier models bill the seconds sent upstream: the fixed tier length, or
// the variable tier's seconds/duration (they must agree), defaulting to its
// minimum. Shared by the MiniMax-H3 and Seedance relays.
func namedVideoTierSeconds(body []byte, model string, minSeconds, maxSeconds int) (int, error) {
	duration := 0
	for _, field := range []string{"seconds", "duration"} {
		value := gjson.GetBytes(body, field)
		if !value.Exists() || value.Type == gjson.Null {
			continue
		}
		n, ok := miniMaxH3IntegerField(value)
		if !ok {
			return 0, fmt.Errorf("%s must be an integer", field)
		}
		if duration != 0 && duration != n {
			return 0, fmt.Errorf("seconds and duration must match")
		}
		duration = n
	}
	if duration == 0 {
		duration = minSeconds
	}
	if duration < minSeconds || duration > maxSeconds {
		if minSeconds == maxSeconds {
			return 0, fmt.Errorf("%s always outputs %d seconds", model, minSeconds)
		}
		return 0, fmt.Errorf("seconds must be an integer from %d to %d", minSeconds, maxSeconds)
	}
	return duration, nil
}

// ParseMiniMaxH3Request accepts the gateway's relay shape (seconds or
// duration, aspect_ratio or ratio) and keeps the original JSON so reference
// media and future fields survive.
func ParseMiniMaxH3Request(body []byte) (GrokMediaRequestInfo, error) {
	info := GrokMediaRequestInfo{N: 1}
	if !gjson.ValidBytes(body) || !gjson.ParseBytes(body).IsObject() {
		return info, fmt.Errorf("request body must be a JSON object")
	}
	model, prompt := gjson.GetBytes(body, "model"), gjson.GetBytes(body, "prompt")
	if model.Type != gjson.String || strings.TrimSpace(model.String()) == "" {
		return info, fmt.Errorf("model is required")
	}
	if prompt.Type != gjson.String || strings.TrimSpace(prompt.String()) == "" || utf8.RuneCountInString(prompt.String()) > 7000 {
		return info, fmt.Errorf("prompt must contain 1 to 7000 characters")
	}
	info.Model = strings.TrimSpace(model.String())
	tier, ok := lookupMiniMaxH3Tier(info.Model)
	if !ok {
		return info, fmt.Errorf("unsupported MiniMax-H3 model %q", info.Model)
	}
	duration, err := namedVideoTierSeconds(body, info.Model, tier.MinSeconds, tier.MaxSeconds)
	if err != nil {
		return info, err
	}
	if !tier.allows(duration) {
		return info, fmt.Errorf("%s does not support %d seconds", info.Model, duration)
	}
	// H3 creates one task/video. Reject batching fields rather than undercharge.
	if n := gjson.GetBytes(body, "n"); n.Exists() && (n.Type != gjson.Number || n.Float() != 1) {
		return info, fmt.Errorf("MiniMax-H3 supports one video per request")
	}
	info.Resolution, info.DurationSeconds, info.Prompt = tier.Resolution, duration, prompt.String()
	info.AspectRatio = miniMaxH3Ratio(body)
	for _, path := range []string{"images", "start_frame", "end_frame"} {
		// gjson wraps a single string (start_frame/end_frame) in a one-item array.
		for _, item := range gjson.GetBytes(body, path).Array() {
			if item.Type == gjson.String {
				info.InputImageURLs = append(info.InputImageURLs, item.String())
			}
		}
	}
	if tier.RequiresReference && len(info.InputImageURLs) == 0 {
		return info, fmt.Errorf("%s requires at least one reference image", info.Model)
	}
	return info, nil
}

func miniMaxH3Ratio(body []byte) string {
	if ratio := strings.TrimSpace(gjson.GetBytes(body, "ratio").String()); ratio != "" {
		return ratio
	}
	return strings.TrimSpace(gjson.GetBytes(body, "aspect_ratio").String())
}

// Reuse the group's versioned media JSONB. A tariff is one per_second price,
// one fixed request_<seconds>s price, or per-resolution USD/s prices (768p,
// 1440p). No currency conversion or resolution fallback.
func miniMaxH3RequestSeconds(key string) (int, bool) {
	if !strings.HasPrefix(key, "request_") || !strings.HasSuffix(key, "s") {
		return 0, false
	}
	n, err := strconv.Atoi(strings.TrimSuffix(strings.TrimPrefix(key, "request_"), "s"))
	return n, err == nil && n >= 1 && n <= 15 && key == fmt.Sprintf("request_%ds", n)
}

func isMiniMaxH3ResolutionKey(key string) bool { return key == "768p" || key == "1440p" }

func isZhonghengMiniMaxH3Model(key string) bool {
	tier, ok := lookupMiniMaxH3Tier(key)
	return ok && tier.Zhongheng
}

// Zhongheng model IDs sit beside the shared tariff with their own price.
func validMiniMaxH3TariffKey(key string) bool {
	_, ok := miniMaxH3RequestSeconds(key)
	return ok || key == MiniMaxH3PerSecond || isMiniMaxH3ResolutionKey(key) || isZhonghengMiniMaxH3Model(key)
}

// QuoteMiniMaxH3Model prices one video of model: Zhongheng tiers from their
// own model price, the others from the shared tariff.
func QuoteMiniMaxH3Model(prices map[string]map[string]float64, model string, seconds int) (float64, error) {
	tier, ok := lookupMiniMaxH3Tier(model)
	if !ok {
		return 0, fmt.Errorf("unsupported MiniMax-H3 model %q", model)
	}
	if !tier.allows(seconds) {
		return 0, fmt.Errorf("%s does not support %d seconds", model, seconds)
	}
	shared := map[string]float64{}
	for key, price := range prices[MiniMaxH3PriceFamily] {
		if !isZhonghengMiniMaxH3Model(key) {
			shared[key] = price
		}
	}
	if !tier.Zhongheng {
		return QuoteMiniMaxH3Video(map[string]map[string]float64{MiniMaxH3PriceFamily: shared}, tier.Resolution, seconds)
	}
	price, ok := prices[MiniMaxH3PriceFamily][strings.ToLower(strings.TrimSpace(model))]
	if !ok {
		return 0, fmt.Errorf("MiniMax-H3 model %s is disabled or its group price is not configured", model)
	}
	total := price
	if !tier.PerRequest {
		total *= float64(seconds)
	}
	if price < 0 || math.IsNaN(price) || math.IsInf(total, 0) {
		return 0, fmt.Errorf("invalid MiniMax-H3 group video price")
	}
	return total, nil
}

func QuoteMiniMaxH3Video(prices map[string]map[string]float64, resolution string, seconds int) (float64, error) {
	if seconds < 1 || seconds > 15 {
		return 0, fmt.Errorf("seconds must be between 1 and 15")
	}
	tariff := prices[MiniMaxH3PriceFamily]
	if len(tariff) == 0 {
		return 0, fmt.Errorf("MiniMax-H3 video is disabled or its group price is not configured")
	}
	for key, price := range tariff {
		if price < 0 || math.IsNaN(price) || math.IsInf(price, 0) || (len(tariff) > 1 && !isMiniMaxH3ResolutionKey(key)) {
			return 0, fmt.Errorf("invalid MiniMax-H3 group video price")
		}
	}
	perSecond := func(price float64) (float64, error) {
		if total := price * float64(seconds); !math.IsInf(total, 0) {
			return total, nil
		}
		return 0, fmt.Errorf("invalid MiniMax-H3 group video price")
	}
	if price, ok := tariff[resolution]; ok && isMiniMaxH3ResolutionKey(resolution) {
		return perSecond(price)
	}
	for key, price := range tariff {
		if key == MiniMaxH3PerSecond {
			return perSecond(price)
		}
		if duration, ok := miniMaxH3RequestSeconds(key); ok {
			if seconds != duration {
				return 0, fmt.Errorf("this group's per-request video price requires seconds=\"%d\"", duration)
			}
			return price, nil
		}
		if isMiniMaxH3ResolutionKey(key) {
			return 0, fmt.Errorf("MiniMax-H3 %s video price is not configured for this group", resolution)
		}
	}
	return 0, fmt.Errorf("invalid MiniMax-H3 group video price")
}

// openAIVideosRelay describes a video family sold through a relay's JSON
// OpenAI Videos API (POST /v1/videos, GET /v1/videos/{id}[/content]). DeepKey
// and Zhongheng serve MiniMax-H3 and Zhongheng serves Seedance this
// way; they differ only in model tiers, account eligibility and the task-key
// prefix that isolates task ownership.
type openAIVideosRelay struct {
	Name                     string
	Capability               OpenAIEndpointCapability
	Create, Status, Content  GrokMediaEndpoint
	TaskPrefix               string
	AccountRequirementErrMsg string
	// PrepareCreate validates the client body, fills the billing fields of
	// result and returns the upstream body with the mapped model.
	PrepareCreate func(account *Account, body []byte, result *OpenAIForwardResult) ([]byte, error)
	// For Zhongheng-style relays that only take public https media: data:
	// images are uploaded to /v1/media first, and with no /content route the
	// gateway reads the video URL from the task status and downloads it
	// without the key. DeepKey needs neither.
	UploadDataImages, ContentFromStatus bool
}

var miniMaxH3Relay = openAIVideosRelay{
	Name: "MiniMax-H3", Capability: OpenAIEndpointCapabilityMiniMaxH3,
	Create: MiniMaxH3EndpointCreate, Status: MiniMaxH3EndpointStatus, Content: MiniMaxH3EndpointContent,
	TaskPrefix:               "minimax-h3:",
	AccountRequirementErrMsg: "MiniMax-H3 requires a MiniMax pay-as-you-go API key account with a custom base URL",
	PrepareCreate: func(account *Account, body []byte, result *OpenAIForwardResult) ([]byte, error) {
		info, err := ParseMiniMaxH3Request(body)
		if err != nil {
			return nil, err
		}
		result.Model, result.BillingModel, result.UpstreamModel = info.Model, info.Model, account.GetMappedModel(info.Model)
		result.VideoResolution, result.VideoDurationSeconds = info.Resolution, info.DurationSeconds
		return prepareMiniMaxH3CreateBody(body, info, result.UpstreamModel)
	},
}

func (r openAIVideosRelay) buildURL(base string, endpoint GrokMediaEndpoint, taskID string) (string, error) {
	base = strings.TrimRight(base, "/")
	if !strings.HasSuffix(base, "/v1") {
		base += "/v1"
	}
	base += "/videos"
	if endpoint != r.Create {
		if err := validateUpstreamPathSegment(r.Name+" task ID", taskID); err != nil || strings.TrimSpace(taskID) == "" {
			return "", fmt.Errorf("invalid %s task ID", r.Name)
		}
		base += "/" + taskID
		if endpoint == r.Content {
			base += "/content"
		}
	}
	return base, nil
}

func buildMiniMaxH3URL(base string, endpoint GrokMediaEndpoint, taskID string) (string, error) {
	return miniMaxH3Relay.buildURL(base, endpoint, taskID)
}

func validMiniMaxH3OutputURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil
}

// The requested and upstream model must be the same ID: the ID decides the
// billed resolution and seconds. DeepKey takes integer seconds on the 10-15s
// tiers only and derives resolution from the model, so size fields are dropped.
func prepareMiniMaxH3CreateBody(body []byte, info GrokMediaRequestInfo, upstreamModel string) ([]byte, error) {
	tier, ok := lookupMiniMaxH3Tier(upstreamModel)
	if !ok {
		return nil, fmt.Errorf("this video relay only supports MiniMax-H3 models")
	}
	if !strings.EqualFold(strings.TrimSpace(upstreamModel), info.Model) {
		return nil, fmt.Errorf("MiniMax-H3 model mapping must not change the model")
	}
	if tier.Zhongheng {
		body, err := sjson.SetBytes(body, "model", strings.TrimSpace(upstreamModel))
		if err != nil {
			return nil, err
		}
		if info.Resolution == "1440p" {
			info.Resolution = "2k"
		}
		return prepareZhonghengVideoBody(body, info)
	}
	var err error
	for _, path := range []string{"seconds", "duration", "ratio", "aspect_ratio", "resolution", "size", "n"} {
		if body, err = sjson.DeleteBytes(body, path); err != nil {
			return nil, err
		}
	}
	fields := map[string]any{"model": strings.TrimSpace(upstreamModel)}
	if tier.MinSeconds != tier.MaxSeconds {
		fields["seconds"] = info.DurationSeconds
	}
	if info.AspectRatio != "" {
		fields["aspect_ratio"] = info.AspectRatio
	}
	for path, value := range fields {
		if body, err = sjson.SetBytes(body, path, value); err != nil {
			return nil, err
		}
	}
	return body, nil
}

func isJSONContentType(value string) bool {
	mediaType, _, err := mime.ParseMediaType(value)
	return err == nil && (mediaType == "application/json" || strings.HasSuffix(mediaType, "+json"))
}

// A completed relay task has an https output URL, or a relative
// /v1/videos/{id}/content URL that is served through this gateway's route.
func miniMaxH3StatusCompleted(body []byte) bool {
	switch gjson.GetBytes(body, "status").String() {
	case "completed", "succeeded":
	default:
		return false
	}
	for _, field := range []string{"metadata.url", "video_url", "result_url", "url"} {
		value := gjson.GetBytes(body, field).String()
		if validMiniMaxH3OutputURL(value) || isRelayRelativeContentURL(value) {
			return true
		}
	}
	return false
}

// relayStatusVideoURL picks the finished video from a status body. It must be
// on the relay's own host: the gateway downloads it server-side.
func relayStatusVideoURL(body []byte, base string) (string, bool) {
	baseURL, err := url.Parse(base)
	if err != nil {
		return "", false
	}
	for _, field := range []string{"video_url", "url", "result_url", "metadata.url"} {
		raw := gjson.GetBytes(body, field).String()
		if u, err := url.Parse(raw); err == nil && validMiniMaxH3OutputURL(raw) && strings.EqualFold(u.Hostname(), baseURL.Hostname()) {
			return raw, true
		}
	}
	return "", false
}

const relayUpstreamQuotaMessage = "上游渠道余额不足，请联系管理员"

// new-api style relays report their own balance as e.g. "user quota is not
// enough"; users read that as their own balance, so it is reworded.
var relayUpstreamQuotaMarkers = []string{"quota is not enough", "insufficient_user_quota", "pre_consume_token_quota_failed", "用户额度不足"}

func isRelayUpstreamQuotaText(s string) bool {
	s = strings.ToLower(s)
	for _, marker := range relayUpstreamQuotaMarkers {
		if strings.Contains(s, marker) {
			return true
		}
	}
	return false
}

// maskRelayUpstreamQuotaError rewrites every string in a JSON body that names
// the relay's balance; code/type fields get a stable code instead of prose.
func maskRelayUpstreamQuotaError(body []byte) []byte {
	if !isRelayUpstreamQuotaText(string(body)) {
		return body
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var doc any
	if err := dec.Decode(&doc); err != nil {
		return body
	}
	var mask func(key string, v any) any
	mask = func(key string, v any) any {
		switch v := v.(type) {
		case map[string]any:
			for k, child := range v {
				v[k] = mask(k, child)
			}
		case []any:
			for i, child := range v {
				v[i] = mask(key, child)
			}
		case string:
			if !isRelayUpstreamQuotaText(v) {
				return v
			}
			if key == "code" || key == "type" {
				return "upstream_insufficient_quota"
			}
			return relayUpstreamQuotaMessage
		}
		return v
	}
	out, err := json.Marshal(mask("", doc))
	if err != nil {
		return body
	}
	return out
}

func isRelayRelativeContentURL(raw string) bool {
	id, ok := strings.CutSuffix(strings.TrimPrefix(raw, "/v1/videos/"), "/content")
	return ok && strings.HasPrefix(raw, "/v1/videos/") && id != "" && validateUpstreamPathSegment("video ID", id) == nil
}

func (s *OpenAIGatewayService) ForwardMiniMaxH3(ctx context.Context, c *gin.Context, account *Account, endpoint GrokMediaEndpoint, taskID string, body []byte) (*OpenAIForwardResult, error) {
	relay := miniMaxH3Relay
	if isZhonghengAccount(account) {
		relay.UploadDataImages, relay.ContentFromStatus = true, true
	}
	return s.forwardOpenAIVideosRelay(ctx, c, relay, account, endpoint, taskID, body)
}

func (s *OpenAIGatewayService) forwardOpenAIVideosRelay(ctx context.Context, c *gin.Context, relay openAIVideosRelay, account *Account, endpoint GrokMediaEndpoint, taskID string, body []byte) (*OpenAIForwardResult, error) {
	if (endpoint != relay.Create && endpoint != relay.Status && endpoint != relay.Content) || !account.SupportsOpenAIEndpointCapability(relay.Capability) {
		return nil, fmt.Errorf("%s", relay.AccountRequirementErrMsg)
	}
	base, err := s.validateUpstreamBaseURL(account.GetCredential("base_url"))
	if err != nil {
		return nil, err
	}
	upstreamEndpoint := endpoint
	if endpoint == relay.Content && relay.ContentFromStatus {
		upstreamEndpoint = relay.Status
	}
	target, err := relay.buildURL(base, upstreamEndpoint, strings.TrimPrefix(taskID, relay.TaskPrefix))
	if err != nil {
		return nil, err
	}
	token := strings.TrimSpace(account.GetCredential("api_key"))
	if token == "" {
		return nil, fmt.Errorf("%s account missing api_key", relay.Name)
	}
	method := http.MethodGet
	result := &OpenAIForwardResult{ResponseID: taskID}
	if endpoint == relay.Create {
		if body, err = relay.PrepareCreate(account, body, result); err != nil {
			return nil, err
		}
		if hooks, ok := ctx.Value(relayVideoAcceptanceKey{}).(RelayVideoAcceptance); ok && hooks.Prepare != nil {
			if err := hooks.Prepare(ctx, result); err != nil {
				return nil, fmt.Errorf("video billing admission unavailable: %w", err)
			}
		}
		if relay.UploadDataImages {
			if body, err = s.uploadRelayDataImages(ctx, relay, account, base, token, body); err != nil {
				return nil, err
			}
		}
		method = http.MethodPost
	}
	started := time.Now()
	// Never follow credential-bearing redirects, including same-host redirects.
	req, err := http.NewRequestWithContext(WithHTTPUpstreamRedirectsDisabled(ctx), method, target, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	account.ApplyHeaderOverrides(req.Header)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if endpoint == relay.Create && relay.UploadDataImages {
		// Zhongheng dedupes creates per key; each gateway create is a new order.
		req.Header.Set("Idempotency-Key", "s2a_"+randomHex(16))
	}
	proxy := relayAccountProxy(account)
	resp, err := s.httpUpstream.Do(req, proxy, account.ID, account.Concurrency)
	SetOpsLatencyMs(c, OpsUpstreamLatencyMsKey, time.Since(started).Milliseconds())
	if err != nil {
		return nil, fmt.Errorf("%s upstream transport failed", relay.Name)
	}
	defer func() { _ = resp.Body.Close() }()
	result.Duration, result.ResponseHeaders = time.Since(started), resp.Header.Clone()
	// DeepKey streams the finished MP4 from /content instead of redirecting.
	if endpoint == relay.Content && resp.StatusCode == http.StatusOK && !isJSONContentType(resp.Header.Get("Content-Type")) {
		c.Header("Cache-Control", "private, no-store")
		if err := writeGrokMediaContentResponse(c, resp); err != nil {
			return nil, err
		}
		result.VideoCount = 1
		result.VideoContentDelivered = resp.StatusCode == http.StatusOK
		return result, nil
	}
	if endpoint == relay.Content && resp.StatusCode == http.StatusFound {
		location := resp.Header.Get("Location")
		if !validMiniMaxH3OutputURL(location) {
			return nil, fmt.Errorf("%s content response has an invalid output URL", relay.Name)
		}
		result.VideoCount, result.VideoContentDelivered = 1, true
		c.Header("Location", location)
		c.Header("Cache-Control", "private, no-store")
		c.Status(http.StatusFound)
		return result, nil
	}
	responseBody, err := ReadUpstreamResponseBody(resp.Body, s.cfg, c, openAITooLargeError)
	if err != nil {
		return nil, err
	}
	// An ambiguous POST must never become an automatic account-switch retry.
	if resp.StatusCode >= 300 {
		if resp.StatusCode < 400 {
			return nil, fmt.Errorf("unexpected %s redirect", relay.Name)
		}
		writeGrokMediaResponse(c, resp, maskRelayUpstreamQuotaError(responseBody), s.responseHeaderFilter)
		return nil, fmt.Errorf("%s upstream status %d", relay.Name, resp.StatusCode)
	}
	if !gjson.ValidBytes(responseBody) || !gjson.ParseBytes(responseBody).IsObject() {
		return nil, fmt.Errorf("invalid %s response", relay.Name)
	}
	switch endpoint {
	case relay.Create:
		id := gjson.GetBytes(responseBody, "id").String()
		if id == "" {
			id = gjson.GetBytes(responseBody, "task_id").String()
		}
		if _, err := relay.buildURL(base, relay.Status, id); err != nil {
			return nil, err
		}
		result.ResponseID = relay.TaskPrefix + strings.TrimSpace(id)
		if hooks, ok := ctx.Value(relayVideoAcceptanceKey{}).(RelayVideoAcceptance); ok && hooks.Accept != nil {
			saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
			saveErr := hooks.Accept(saveCtx, result)
			cancel()
			if saveErr != nil {
				// Keep the accepted task ID available; returning a retryable generation
				// failure here would encourage duplicate upstream jobs. The durable
				// submission intent and this structured error retain recovery evidence.
				c.Header("X-Sub2API-Billing-State", "pending-recovery")
				logger.L().Error("relay_video.acceptance_persist_failed", zap.String("task_id", result.ResponseID), zap.Int64("account_id", account.ID), zap.Error(saveErr))
			}
		}
	case relay.Status:
		if miniMaxH3StatusCompleted(responseBody) {
			result.VideoCount = 1
		}
	case relay.Content:
		// Only reached with ContentFromStatus: responseBody is the task status.
		videoURL, ok := relayStatusVideoURL(responseBody, base)
		if !ok || !miniMaxH3StatusCompleted(responseBody) {
			return nil, fmt.Errorf("%s video is not ready", relay.Name)
		}
		return s.downloadRelayVideo(ctx, c, relay, account, videoURL, result)
	}
	c.Header("Cache-Control", "private, no-store")
	writeGrokMediaResponse(c, resp, maskRelayUpstreamQuotaError(responseBody), s.responseHeaderFilter)
	return result, nil
}

func relayAccountProxy(account *Account) string {
	if account.ProxyID != nil && account.Proxy != nil {
		return account.Proxy.URL()
	}
	return ""
}

// downloadRelayVideo streams a finished relay video. The URL is public, so the
// account key and header overrides are never sent, and redirects are passed
// to the client instead of followed.
func (s *OpenAIGatewayService) downloadRelayVideo(ctx context.Context, c *gin.Context, relay openAIVideosRelay, account *Account, videoURL string, result *OpenAIForwardResult) (*OpenAIForwardResult, error) {
	req, err := http.NewRequestWithContext(WithHTTPUpstreamRedirectsDisabled(ctx), http.MethodGet, videoURL, nil)
	if err != nil {
		return nil, err
	}
	if rangeHeader := strings.TrimSpace(c.GetHeader("Range")); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}
	resp, err := s.httpUpstream.Do(req, relayAccountProxy(account), account.ID, account.Concurrency)
	if err != nil {
		return nil, fmt.Errorf("%s video download failed", relay.Name)
	}
	defer func() { _ = resp.Body.Close() }()
	c.Header("Cache-Control", "private, no-store")
	switch {
	case resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusPartialContent:
		if err := writeGrokMediaContentResponse(c, resp); err != nil {
			return nil, err
		}
		result.VideoContentDelivered = resp.StatusCode == http.StatusOK
	case resp.StatusCode >= 300 && resp.StatusCode < 400:
		location := resp.Header.Get("Location")
		if !validMiniMaxH3OutputURL(location) {
			return nil, fmt.Errorf("%s content response has an invalid output URL", relay.Name)
		}
		c.Header("Location", location)
		c.Status(http.StatusFound)
		result.VideoContentDelivered = true
	default:
		return nil, fmt.Errorf("%s video download status %d", relay.Name, resp.StatusCode)
	}
	result.VideoCount = 1
	return result, nil
}

// zhonghengMaxUploadBytes is Zhongheng's documented per-file /v1/media limit.
const zhonghengMaxUploadBytes = 25 << 20

// uploadRelayDataImages replaces data: images in images/start_frame/end_frame
// with Zhongheng /v1/media URLs, uploaded in one multipart request.
func (s *OpenAIGatewayService) uploadRelayDataImages(ctx context.Context, relay openAIVideosRelay, account *Account, base, token string, body []byte) ([]byte, error) {
	type ref struct {
		path string
		data []byte
		mime string
	}
	decoder := &ImageResultUploader{maxDownloadBytes: zhonghengMaxUploadBytes}
	var refs []ref
	for _, field := range []string{"images", "start_frame", "end_frame"} {
		value := gjson.GetBytes(body, field)
		items := []gjson.Result{value}
		if value.IsArray() {
			items = value.Array()
		}
		for i, item := range items {
			if item.Type != gjson.String || !strings.HasPrefix(strings.ToLower(item.String()), "data:") {
				continue
			}
			data, contentType, err := decoder.decodeImageDataURL(item.String())
			if err != nil {
				return nil, fmt.Errorf("invalid %s reference image: %w", relay.Name, err)
			}
			path := field
			if value.IsArray() {
				path = fmt.Sprintf("%s.%d", field, i)
			}
			refs = append(refs, ref{path: path, data: data, mime: contentType})
		}
	}
	if len(refs) == 0 {
		return body, nil
	}
	var form bytes.Buffer
	writer := multipart.NewWriter(&form)
	for i, r := range refs {
		header := textproto.MIMEHeader{}
		header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="reference-%d%s"`, i+1, imageExtension(r.mime)))
		header.Set("Content-Type", r.mime)
		part, err := writer.CreatePart(header)
		if err != nil {
			return nil, err
		}
		if _, err := part.Write(r.data); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	target := strings.TrimSuffix(strings.TrimRight(base, "/"), "/v1") + "/v1/media"
	req, err := http.NewRequestWithContext(WithHTTPUpstreamRedirectsDisabled(ctx), http.MethodPost, target, &form)
	if err != nil {
		return nil, err
	}
	account.ApplyHeaderOverrides(req.Header)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")
	resp, err := s.httpUpstream.Do(req, relayAccountProxy(account), account.ID, account.Concurrency)
	if err != nil {
		return nil, fmt.Errorf("%s reference image upload failed", relay.Name)
	}
	defer func() { _ = resp.Body.Close() }()
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil || resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s reference image upload failed (status %d)", relay.Name, resp.StatusCode)
	}
	uploaded := gjson.GetBytes(respBody, "data").Array()
	if len(uploaded) != len(refs) {
		return nil, fmt.Errorf("%s reference image upload returned %d of %d files", relay.Name, len(uploaded), len(refs))
	}
	baseURL, _ := url.Parse(base)
	for i, r := range refs {
		raw := uploaded[i].Get("url").String()
		u, err := url.Parse(raw)
		if err != nil || !validMiniMaxH3OutputURL(raw) || baseURL == nil || !strings.EqualFold(u.Hostname(), baseURL.Hostname()) {
			return nil, fmt.Errorf("%s reference image upload returned an invalid URL", relay.Name)
		}
		if body, err = sjson.SetBytes(body, r.path, raw); err != nil {
			return nil, err
		}
	}
	return body, nil
}

func imageExtension(contentType string) string {
	switch contentType {
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	}
	return ".jpg"
}
