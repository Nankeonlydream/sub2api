//go:build unit

package service

import (
	"context"
	"io"
	"math"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func miniMaxH3TestAccount() *Account {
	return &Account{ID: 9, Platform: PlatformMiniMax, Type: AccountTypeAPIKey, Credentials: map[string]any{
		"api_key": "test-upstream-key", "base_url": "https://relay.example/v1", "account_mode": AccountModePayG,
		"model_mapping": map[string]any{"Minimax-H3-768p-933-10s-15s": "Minimax-H3-768p-933-10s-15s", "MiniMax-H3-933-1440p-15s": "MiniMax-H3-933-1440p-15s"},
	}}
}

func TestMiniMaxH3ForwardUsesDeepKeyProtocol(t *testing.T) {
	body := []byte(`{"model":"Minimax-H3-768p-933-10s-15s","prompt":"waves","duration":12,"aspect_ratio":"9:16","size":"1344x768","resolution":"720p","metadata":{"video_urls":["https://example.com/reference.mp4"]},"future":{"keep":true}}`)
	upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"id":"task_1","task_id":"task_1","object":"video","status":"queued","progress":0}`)}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, w := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
	result, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", body)
	require.NoError(t, err)
	require.Equal(t, "https://relay.example/v1/videos", upstream.request.URL.String())
	require.Equal(t, "Bearer test-upstream-key", upstream.request.Header.Get("Authorization"))
	require.Empty(t, upstream.request.Header.Get("Idempotency-Key"))
	require.True(t, HTTPUpstreamRedirectsDisabled(upstream.request.Context()))
	forwarded, err := io.ReadAll(upstream.request.Body)
	require.NoError(t, err)
	require.JSONEq(t, `{"model":"Minimax-H3-768p-933-10s-15s","prompt":"waves","seconds":12,"aspect_ratio":"9:16","metadata":{"video_urls":["https://example.com/reference.mp4"]},"future":{"keep":true}}`, string(forwarded))
	require.Equal(t, "minimax-h3:task_1", result.ResponseID)
	require.Equal(t, "Minimax-H3-768p-933-10s-15s", result.BillingModel)
	require.Equal(t, "768p", result.VideoResolution)
	require.Equal(t, 12, result.VideoDurationSeconds)
	require.Zero(t, result.VideoCount, "async acceptance must not charge")
	require.JSONEq(t, `{"id":"task_1","task_id":"task_1","object":"video","status":"queued","progress":0}`, w.Body.String())

	// Fixed tiers take no duration field; the model ID decides the length.
	info, err := ParseMiniMaxH3Request([]byte(`{"model":"MiniMax-H3-933-1440p-15s","prompt":"x","ratio":"21:9"}`))
	require.NoError(t, err)
	require.Equal(t, "1440p", info.Resolution)
	require.Equal(t, 15, info.DurationSeconds)
	forwarded, err = prepareMiniMaxH3CreateBody([]byte(`{"model":"MiniMax-H3-933-1440p-15s","prompt":"x","ratio":"21:9","seconds":15}`), info, "MiniMax-H3-933-1440p-15s")
	require.NoError(t, err)
	require.JSONEq(t, `{"model":"MiniMax-H3-933-1440p-15s","prompt":"x","aspect_ratio":"21:9"}`, string(forwarded))
}

func TestMiniMaxH3ValidationAndURLs(t *testing.T) {
	for _, body := range []string{`{`, `[]`, `{}`, `{"model":"MiniMax-H3","prompt":"x","seconds":5}`,
		`{"model":"MinimaxH3-768","prompt":"x","seconds":8,"images":["https://e.example/a.jpg"]}`, `{"model":"MinimaxH3-768","prompt":"x","seconds":10}`, `{"model":"Minimax-H3-768p-933-10s-15s","prompt":"x","seconds":9}`,
		`{"model":"Minimax-H3-768p-933-10s-15s","prompt":"x","seconds":16}`, `{"model":"Minimax-H3-768p-933-10s","prompt":"x","seconds":15}`,
		`{"model":"Minimax-H3-768p-933-10s-15s","prompt":"x","seconds":10.5}`, `{"model":"Minimax-H3-768p-933-10s-15s","prompt":"x","seconds":11,"duration":12}`,
		`{"model":"Minimax-H3-768p-933-10s","prompt":" "}`, `{"model":"Minimax-H3-768p-933-10s","prompt":"x","n":2}`} {
		_, err := ParseMiniMaxH3Request([]byte(body))
		require.Error(t, err, body)
	}
	info, err := ParseMiniMaxH3Request([]byte(`{"model":"minimax-h3-768p-933-10s-15s","prompt":"x"}`))
	require.NoError(t, err)
	require.Equal(t, 10, info.DurationSeconds, "duration defaults to the tier minimum")
	info, err = ParseMiniMaxH3Request([]byte(`{"model":"MiniMax-H3-933-1440p-10-15s","prompt":"x","seconds":"13"}`))
	require.NoError(t, err)
	require.Equal(t, 13, info.DurationSeconds)
	require.Equal(t, "1440p", info.Resolution)
	for _, base := range []string{"https://relay.example", "https://relay.example/v1/"} {
		target, err := buildMiniMaxH3URL(base, MiniMaxH3EndpointCreate, "")
		require.NoError(t, err)
		require.Equal(t, "https://relay.example/v1/videos", target)
	}
	for _, id := range []string{"", "..", "a/b", "a?b", "a#b", "%2e%2e"} {
		_, err := buildMiniMaxH3URL("https://relay.example", MiniMaxH3EndpointStatus, id)
		require.Error(t, err, id)
	}
	a := miniMaxH3TestAccount()
	require.True(t, a.SupportsOpenAIEndpointCapability(OpenAIEndpointCapabilityMiniMaxH3))
	a.Credentials["account_mode"] = AccountModeCoding
	require.False(t, a.SupportsOpenAIEndpointCapability(OpenAIEndpointCapabilityMiniMaxH3))
	a.Credentials["account_mode"] = AccountModePayG
	a.Platform = PlatformGrok
	require.False(t, a.SupportsOpenAIEndpointCapability(OpenAIEndpointCapabilityMiniMaxH3))
}

func TestMiniMaxH3StatusStates(t *testing.T) {
	for _, status := range []string{"queued", "in_progress", "unknown", "failed", "completed"} {
		t.Run(status, func(t *testing.T) {
			body := `{"id":"task-1","status":"` + status + `","metadata":{"url":"https://cdn.example/output.mp4"},"seconds":"15"}`
			upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(body)}
			svc := &OpenAIGatewayService{httpUpstream: upstream}
			c, w := grokMediaContentTestContext(http.MethodGet, "/v1/videos/task-1", nil)
			result, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointStatus, MiniMaxH3TaskKey("task-1"), nil)
			require.NoError(t, err)
			require.JSONEq(t, body, w.Body.String())
			require.Equal(t, "/v1/videos/task-1", upstream.request.URL.Path)
			want := 0
			if status == "completed" {
				want = 1
			}
			require.Equal(t, want, result.VideoCount)
			require.Zero(t, result.VideoDurationSeconds, "status must not override requested seconds")
		})
	}
}

func TestMiniMaxH3ContentStreamsDeepKeyVideo(t *testing.T) {
	video := grokMediaContentStatusResponse("mp4-bytes")
	video.Header.Set("Content-Type", "video/mp4")
	video.ContentLength = int64(len("mp4-bytes"))
	upstream := &grokMediaContentUpstreamStub{response: video}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, w := grokMediaContentTestContext(http.MethodGet, "/v1/videos/task_1/content", nil)
	result, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointContent, MiniMaxH3TaskKey("task_1"), nil)
	require.NoError(t, err)
	require.Len(t, upstream.requests, 1)
	require.Equal(t, "https://relay.example/v1/videos/task_1/content", upstream.requests[0].URL.String())
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "mp4-bytes", w.Body.String())
	require.Equal(t, 1, result.VideoCount)
}

// The media upload and status download paths stay for Zhongheng-style relays.
func zhonghengStyleRelay() openAIVideosRelay {
	relay := miniMaxH3Relay
	relay.UploadDataImages, relay.ContentFromStatus = true, true
	return relay
}

const zhonghengSucceeded = `{"task_id":"vid_1","status":"succeeded","video_url":"https://relay.example/api/video-content/vid_1","download_url":"https://relay.example/api/video-content/vid_1?download=1"}`

func TestMiniMaxH3ContentDownloadsStatusVideoWithoutKey(t *testing.T) {
	video := grokMediaContentStatusResponse("mp4-bytes")
	video.Header.Set("Content-Type", "video/mp4")
	video.ContentLength = int64(len("mp4-bytes"))
	upstream := &grokMediaContentUpstreamStub{responses: []*http.Response{grokMediaContentStatusResponse(zhonghengSucceeded), video}}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, w := grokMediaContentTestContext(http.MethodGet, "/v1/videos/vid_1/content", nil)
	result, err := svc.forwardOpenAIVideosRelay(context.Background(), c, zhonghengStyleRelay(), miniMaxH3TestAccount(), MiniMaxH3EndpointContent, MiniMaxH3TaskKey("vid_1"), nil)
	require.NoError(t, err)
	require.Len(t, upstream.requests, 2)
	require.Equal(t, "https://relay.example/v1/videos/vid_1", upstream.requests[0].URL.String())
	require.Equal(t, "Bearer test-upstream-key", upstream.requests[0].Header.Get("Authorization"))
	require.Equal(t, "https://relay.example/api/video-content/vid_1", upstream.requests[1].URL.String())
	require.Empty(t, upstream.requests[1].Header.Get("Authorization"), "never send the account key to the output URL")
	require.True(t, HTTPUpstreamRedirectsDisabled(upstream.requests[1].Context()))
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "mp4-bytes", w.Body.String())
	require.Equal(t, 1, result.VideoCount)
}

func TestMiniMaxH3ContentRejectsUnreadyOrForeignVideo(t *testing.T) {
	for _, status := range []string{
		`{"task_id":"vid_1","status":"processing","next_poll_seconds":10}`,
		`{"task_id":"vid_1","status":"succeeded","video_url":"https://evil.example/vid_1.mp4"}`,
		`{"task_id":"vid_1","status":"succeeded","video_url":"http://relay.example/api/video-content/vid_1"}`,
	} {
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(status)}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, _ := grokMediaContentTestContext(http.MethodGet, "/v1/videos/vid_1/content", nil)
		_, err := svc.forwardOpenAIVideosRelay(context.Background(), c, zhonghengStyleRelay(), miniMaxH3TestAccount(), MiniMaxH3EndpointContent, MiniMaxH3TaskKey("vid_1"), nil)
		require.Error(t, err, status)
		require.Len(t, upstream.requests, 1, "must not download from %s", status)
	}
}

func TestMiniMaxH3UploadsDataImagesBeforeCreate(t *testing.T) {
	png := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	upload := grokMediaContentStatusResponse(`{"code":0,"success":true,"data":[{"url":"https://relay.example/api/media/uploads/1/a.png"},{"url":"https://relay.example/api/media/uploads/1/b.png"}]}`)
	upstream := &grokMediaContentUpstreamStub{responses: []*http.Response{upload, grokMediaContentStatusResponse(`{"task_id":"vid_2","status":"processing"}`)}}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, _ := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
	body := `{"model":"MiniMax-H3-933-1440p-15s","prompt":"x","images":["` + png + `","https://example.com/keep.jpg","` + png + `"]}`
	_, err := svc.forwardOpenAIVideosRelay(context.Background(), c, zhonghengStyleRelay(), miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", []byte(body))
	require.NoError(t, err)
	require.Len(t, upstream.requests, 2)
	require.Equal(t, "https://relay.example/v1/media", upstream.requests[0].URL.String())
	require.True(t, strings.HasPrefix(upstream.requests[0].Header.Get("Content-Type"), "multipart/form-data"))
	forwarded, err := io.ReadAll(upstream.requests[1].Body)
	require.NoError(t, err)
	require.Equal(t, `["https://relay.example/api/media/uploads/1/a.png","https://example.com/keep.jpg","https://relay.example/api/media/uploads/1/b.png"]`, gjson.GetBytes(forwarded, "images").Raw)

	// A foreign upload URL must not be forwarded.
	upload = grokMediaContentStatusResponse(`{"data":[{"url":"https://evil.example/a.png"}]}`)
	upstream = &grokMediaContentUpstreamStub{responses: []*http.Response{upload}}
	svc = &OpenAIGatewayService{httpUpstream: upstream}
	_, err = svc.forwardOpenAIVideosRelay(context.Background(), c, zhonghengStyleRelay(), miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", []byte(`{"model":"MiniMax-H3-933-1440p-15s","prompt":"x","images":["`+png+`"]}`))
	require.Error(t, err)
	require.Len(t, upstream.requests, 1)
}

func TestMiniMaxH3UpstreamErrorIsNotRetried(t *testing.T) {
	for _, status := range []int{400, 429, 503} {
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"error":{"message":"upstream failure"}}`)}
		upstream.response.StatusCode = status
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, w := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
		_, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", []byte(`{"model":"Minimax-H3-768p-933-10s-15s","prompt":"waves","seconds":10}`))
		require.Error(t, err)
		require.Equal(t, status, w.Code)
		require.Len(t, upstream.requests, 1)
	}
}

func TestMiniMaxH3MasksRelayQuotaError(t *testing.T) {
	upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"error":{"message":"user quota is not enough","type":"new_api_error","code":"insufficient_user_quota"}}`)}
	upstream.response.StatusCode = http.StatusForbidden
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, w := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
	_, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", []byte(`{"model":"Minimax-H3-768p-933-10s-15s","prompt":"waves","seconds":10}`))
	require.Error(t, err)
	require.Equal(t, http.StatusForbidden, w.Code)
	require.JSONEq(t, `{"error":{"message":"上游渠道余额不足，请联系管理员","type":"new_api_error","code":"upstream_insufficient_quota"}}`, w.Body.String())

	// A task that fails later reports the same reason in its status body.
	status := `{"id":"task-1","status":"failed","progress":100,"fail_reason":"User Quota Is Not Enough"}`
	upstream = &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(status)}
	svc = &OpenAIGatewayService{httpUpstream: upstream}
	c, w = grokMediaContentTestContext(http.MethodGet, "/v1/videos/task-1", nil)
	_, err = svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointStatus, MiniMaxH3TaskKey("task-1"), nil)
	require.NoError(t, err)
	require.JSONEq(t, `{"id":"task-1","status":"failed","progress":100,"fail_reason":"上游渠道余额不足，请联系管理员"}`, w.Body.String())

	other := []byte(`{"error":{"message":"upstream failure"}}`)
	require.Equal(t, other, maskRelayUpstreamQuotaError(other))
}

func TestMiniMaxH3TariffsAndBillingSnapshot(t *testing.T) {
	perSecond := map[string]map[string]float64{MiniMaxH3PriceFamily: {MiniMaxH3PerSecond: 0.02}}
	perRequest := map[string]map[string]float64{MiniMaxH3PriceFamily: {"request_5s": 0.08}}
	base, err := QuoteMiniMaxH3Video(perSecond, "768p", 5)
	require.NoError(t, err)
	require.InDelta(t, 0.1, base, 1e-9)
	base, err = QuoteMiniMaxH3Video(perRequest, "768p", 5)
	require.NoError(t, err)
	require.InDelta(t, 0.08, base, 1e-9)
	_, err = QuoteMiniMaxH3Video(perRequest, "768p", 15)
	require.ErrorContains(t, err, `seconds="5"`)
	for _, tariff := range []map[string]map[string]float64{nil, {MiniMaxH3PriceFamily: {"480p": 0.1}}, {MiniMaxH3PriceFamily: {MiniMaxH3PerSecond: -1}}, {MiniMaxH3PriceFamily: {MiniMaxH3PerSecond: math.Inf(1)}}, {MiniMaxH3PriceFamily: {MiniMaxH3PerSecond: 0.1, "request_5s": 0.3}}} {
		_, err := QuoteMiniMaxH3Video(tariff, "768p", 5)
		require.Error(t, err)
	}
	require.Equal(t, perRequest, NormalizeVideoModelPrices(perRequest))
	svc := &OpenAIGatewayService{}
	result := &OpenAIForwardResult{VideoCount: 1, MiniMaxH3BaseCost: &base, VideoDurationSeconds: 5}
	cost := svc.calculateOpenAIVideoCost(context.Background(), "mapped-name", &APIKey{}, result, 0.1)
	require.InDelta(t, 0.008, cost.ActualCost, 1e-9)
	key := &APIKey{Group: &Group{RateMultiplier: 0.1, VideoRateIndependent: true, VideoRateMultiplier: 100}}
	estimate, ok := (inflightEstimateDeps{}).estimate(context.Background(), key, InflightEstimateRequest{MiniMaxH3BaseCost: &base})
	require.True(t, ok)
	require.InDelta(t, cost.ActualCost, estimate, 1e-9)
}

func TestMiniMaxH3MappingMustKeepModel(t *testing.T) {
	for _, mapping := range []map[string]any{
		{"Minimax-H3-768p-933-10s": "MiniMax-H3-933-1440p-10s"},
		{"Minimax-H3-768p-933-10s": "MiniMax-H3"},
		{"Minimax-H3-768p-933-10s": "gpt-5"},
	} {
		a := miniMaxH3TestAccount()
		a.Credentials["model_mapping"] = mapping
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"id":"task_1"}`)}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, _ := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
		_, err := svc.ForwardMiniMaxH3(context.Background(), c, a, MiniMaxH3EndpointCreate, "", []byte(`{"model":"Minimax-H3-768p-933-10s","prompt":"x"}`))
		require.Error(t, err)
		require.Empty(t, upstream.requests, "a changed model must not reach the upstream")
	}
}

func TestMiniMaxH3ZhonghengStatusCompletion(t *testing.T) {
	for body, want := range map[string]int{
		zhonghengSucceeded:                                             1,
		`{"task_id":"t","status":"succeeded"}`:                         0,
		`{"task_id":"t","status":"processing","next_poll_seconds":10}`: 0,
		`{"task_id":"t","status":"failed","error_code":"invalid_prompt","error_detail":"blocked"}`:      0,
		`{"task_id":"t","status":"processing","video_url":"https://relay.example/api/video-content/t"}`: 0,
	} {
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(body)}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, _ := grokMediaContentTestContext(http.MethodGet, "/v1/videos/t", nil)
		result, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointStatus, MiniMaxH3TaskKey("t"), nil)
		require.NoError(t, err)
		require.Equal(t, want, result.VideoCount, body)
	}
}

func TestMiniMaxH3ResolutionTariff(t *testing.T) {
	prices := map[string]map[string]float64{MiniMaxH3PriceFamily: {"768p": 0.1, "1440p": 0.15}}
	base, err := QuoteMiniMaxH3Video(prices, "1440p", 12)
	require.NoError(t, err)
	require.InDelta(t, 1.8, base, 1e-9)
	base, err = QuoteMiniMaxH3Video(prices, "768p", 10)
	require.NoError(t, err)
	require.InDelta(t, 1.0, base, 1e-9)
	_, err = QuoteMiniMaxH3Video(map[string]map[string]float64{MiniMaxH3PriceFamily: {"768p": 0.1}}, "1440p", 10)
	require.ErrorContains(t, err, "1440p")
	_, err = QuoteMiniMaxH3Video(map[string]map[string]float64{MiniMaxH3PriceFamily: {"768p": 0.1, MiniMaxH3PerSecond: 0.2}}, "768p", 10)
	require.Error(t, err)
	// A legacy single per_second price applies to every resolution.
	base, err = QuoteMiniMaxH3Video(map[string]map[string]float64{MiniMaxH3PriceFamily: {MiniMaxH3PerSecond: 0.15}}, "1440p", 15)
	require.NoError(t, err)
	require.InDelta(t, 2.25, base, 1e-9)
	require.Equal(t, prices, NormalizeVideoModelPrices(prices))
}

func TestCreatorVideoPricingMiniMaxH3Tiers(t *testing.T) {
	svc := newOpenAIRecordUsageServiceForTest(&openAIRecordUsageLogRepoStub{}, &openAIRecordUsageUserRepoStub{}, &openAIRecordUsageSubRepoStub{}, nil)
	key := &APIKey{GroupID: i64p(6), Group: &Group{ID: 6, Platform: PlatformMiniMax, RateMultiplier: 2,
		VideoModelPrices: map[string]map[string]float64{MiniMaxH3PriceFamily: {"768p": 0.12, "1440p": 0.13}}}}
	quote, err := svc.CreatorVideoPricing(context.Background(), key, 3, "MiniMax-H3-933-1440p-10-15s")
	require.NoError(t, err)
	require.Len(t, quote.Prices, 1)
	prices := quote.Prices["1440p"]
	require.Len(t, prices, 15)
	require.Nil(t, prices[8], "9 seconds is below the tier minimum")
	require.InDelta(t, 0.13*12*2, *prices[11], 1e-9)
	require.InDelta(t, 0.13*15*2, *prices[14], 1e-9)
	quote, err = svc.CreatorVideoPricing(context.Background(), key, 3, "Minimax-H3-768p-933-15s")
	require.NoError(t, err)
	require.Nil(t, quote.Prices["768p"][9], "the fixed 15s tier only sells 15 seconds")
	require.InDelta(t, 0.12*15*2, *quote.Prices["768p"][14], 1e-9)
}

// Zhongheng H3 tiers sit in the same group as DeepKey's, each with its own
// model price, and are sent in Zhongheng's request shape.
func TestMiniMaxH3ZhonghengTiers(t *testing.T) {
	prices := map[string]map[string]float64{MiniMaxH3PriceFamily: {"768p": 0.15, "1440p": 0.225, "xminimex-h3": 0.26, "minimaxh3-768": 2.6}}
	require.Equal(t, prices, NormalizeVideoModelPrices(prices))
	for _, tc := range []struct {
		model   string
		seconds int
		want    float64
	}{
		{"Xminimex-h3", 15, 3.9},
		{"MinimaxH3-768", 15, 2.6},
		{"MinimaxH3-768", 5, 2.6},
		{"MiniMax-H3-933-1440p-10-15s", 12, 2.7},
	} {
		base, err := QuoteMiniMaxH3Model(prices, tc.model, tc.seconds)
		require.NoError(t, err, tc.model)
		require.InDelta(t, tc.want, base, 1e-9, tc.model)
	}
	info, err := ParseMiniMaxH3Request([]byte(`{"model":"MinimaxH3-768","prompt":"x","seconds":10,"images":["https://e.example/a.jpg"]}`))
	require.NoError(t, err, "a reference image makes the 768 tier valid")
	require.Equal(t, 10, info.DurationSeconds)
	_, err = QuoteMiniMaxH3Model(prices, "MinimaxH3-768", 8)
	require.Error(t, err, "8 seconds is not sold")
	_, err = QuoteMiniMaxH3Model(map[string]map[string]float64{MiniMaxH3PriceFamily: {"768p": 0.15}}, "Xminimex-h3", 10)
	require.ErrorContains(t, err, "not configured")

	account := &Account{ID: 10, Platform: PlatformMiniMax, Type: AccountTypeAPIKey, Credentials: map[string]any{
		"api_key": "k", "base_url": "https://zh.example/v1", "model_mapping": map[string]any{"Xminimex-h3": "Xminimex-h3"},
	}}
	require.True(t, isZhonghengAccount(account))
	require.False(t, isZhonghengAccount(miniMaxH3TestAccount()))
	upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"task_id":"vid_1","status":"processing"}`)}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, _ := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
	result, err := svc.ForwardMiniMaxH3(context.Background(), c, account, MiniMaxH3EndpointCreate, "", []byte(`{"model":"Xminimex-h3","prompt":"x","seconds":12,"aspect_ratio":"9:16"}`))
	require.NoError(t, err)
	require.Equal(t, MiniMaxH3TaskKey("vid_1"), result.ResponseID)
	require.NotEmpty(t, upstream.request.Header.Get("Idempotency-Key"))
	forwarded, err := io.ReadAll(upstream.request.Body)
	require.NoError(t, err)
	require.Equal(t, "Xminimex-h3", gjson.GetBytes(forwarded, "model").String())
	require.Equal(t, int64(12), gjson.GetBytes(forwarded, "duration").Int())
	require.Equal(t, "2k", gjson.GetBytes(forwarded, "resolution").String())
	require.Equal(t, "9:16", gjson.GetBytes(forwarded, "ratio").String())
	require.False(t, gjson.GetBytes(forwarded, "seconds").Exists())
}
