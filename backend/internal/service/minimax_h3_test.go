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
		"model_mapping": map[string]any{"Xminimex-h3": "Xminimex-h3", "MinimaxH3-768": "MinimaxH3-768"},
	}}
}

func TestMiniMaxH3ForwardUsesZhonghengProtocol(t *testing.T) {
	body := []byte(`{"model":"Xminimex-h3","prompt":"waves","seconds":12,"aspect_ratio":"9:16","size":"1344x768","resolution":"720p","future":{"keep":true}}`)
	upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"task_id":"task_1","status":"processing"}`)}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, w := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
	result, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", body)
	require.NoError(t, err)
	require.Equal(t, "https://relay.example/v1/videos", upstream.request.URL.String())
	require.Equal(t, "Bearer test-upstream-key", upstream.request.Header.Get("Authorization"))
	require.NotEmpty(t, upstream.request.Header.Get("Idempotency-Key"), "each gateway create is a new Zhongheng order")
	require.True(t, HTTPUpstreamRedirectsDisabled(upstream.request.Context()))
	forwarded, err := io.ReadAll(upstream.request.Body)
	require.NoError(t, err)
	require.JSONEq(t, `{"model":"Xminimex-h3","prompt":"waves","duration":12,"resolution":"2k","ratio":"9:16","future":{"keep":true}}`, string(forwarded))
	require.Equal(t, "minimax-h3:task_1", result.ResponseID)
	require.Equal(t, "Xminimex-h3", result.BillingModel)
	require.Equal(t, "1440p", result.VideoResolution)
	require.Equal(t, 12, result.VideoDurationSeconds)
	require.Zero(t, result.VideoCount, "async acceptance must not charge")
	require.JSONEq(t, `{"task_id":"task_1","status":"processing"}`, w.Body.String())

	// Zhongheng takes no reference videos.
	_, err = svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", []byte(`{"model":"Xminimex-h3","prompt":"x","metadata":{"video_urls":["https://example.com/r.mp4"]}}`))
	require.Error(t, err)
}

func TestMiniMaxH3ValidationAndURLs(t *testing.T) {
	for _, body := range []string{`{`, `[]`, `{}`, `{"model":"MiniMax-H3","prompt":"x","seconds":5}`,
		// DeepKey's IDs are no longer sold.
		`{"model":"Minimax-H3-768p-933-10s-15s","prompt":"x","seconds":10}`,
		`{"model":"MinimaxH3-768","prompt":"x","seconds":8,"images":["https://e.example/a.jpg"]}`, `{"model":"MinimaxH3-768","prompt":"x","seconds":10}`, `{"model":"Xminimex-h3","prompt":"x","seconds":4}`,
		`{"model":"Xminimex-h3","prompt":"x","seconds":16}`,
		`{"model":"Xminimex-h3","prompt":"x","seconds":10.5}`, `{"model":"Xminimex-h3","prompt":"x","seconds":11,"duration":12}`,
		`{"model":"Xminimex-h3","prompt":" "}`, `{"model":"Xminimex-h3","prompt":"x","n":2}`} {
		_, err := ParseMiniMaxH3Request([]byte(body))
		require.Error(t, err, body)
	}
	info, err := ParseMiniMaxH3Request([]byte(`{"model":"xminimex-h3","prompt":"x"}`))
	require.NoError(t, err)
	require.Equal(t, 5, info.DurationSeconds, "duration defaults to the tier minimum")
	info, err = ParseMiniMaxH3Request([]byte(`{"model":"Xminimex-h3","prompt":"x","seconds":"13"}`))
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
			require.False(t, result.VideoContentDelivered, "status alone never delivers the video")
			require.Zero(t, result.VideoDurationSeconds, "status must not override requested seconds")
		})
	}
}

const zhonghengSucceeded = `{"task_id":"vid_1","status":"succeeded","video_url":"https://relay.example/api/video-content/vid_1","download_url":"https://relay.example/api/video-content/vid_1?download=1"}`

func TestMiniMaxH3ContentDownloadsStatusVideoWithoutKey(t *testing.T) {
	video := grokMediaContentStatusResponse("mp4-bytes")
	video.Header.Set("Content-Type", "video/mp4")
	video.ContentLength = int64(len("mp4-bytes"))
	upstream := &grokMediaContentUpstreamStub{responses: []*http.Response{grokMediaContentStatusResponse(zhonghengSucceeded), video}}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, w := grokMediaContentTestContext(http.MethodGet, "/v1/videos/vid_1/content", nil)
	result, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointContent, MiniMaxH3TaskKey("vid_1"), nil)
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
	require.True(t, result.VideoContentDelivered)
}

func TestMiniMaxH3ContentRejectsUnreadyVideo(t *testing.T) {
	for _, status := range []string{
		`{"task_id":"vid_1","status":"processing","next_poll_seconds":10}`,
		`{"task_id":"vid_1","status":"succeeded","video_url":"http://relay.example/api/video-content/vid_1"}`,
	} {
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(status)}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, _ := grokMediaContentTestContext(http.MethodGet, "/v1/videos/vid_1/content", nil)
		_, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointContent, MiniMaxH3TaskKey("vid_1"), nil)
		require.Error(t, err, status)
		require.Len(t, upstream.requests, 1, status)
	}
}

// A gateway relay reports its supplier's host. The gateway never fetches that
// host; it asks the relay's own /content route with the account key.
func TestMiniMaxH3ContentForeignVideoUsesRelayContentRoute(t *testing.T) {
	for _, status := range []string{
		`{"task_id":"vid_1","status":"succeeded","video_url":"https://evil.example/vid_1.mp4"}`,
		`{"task_id":"vid_1","status":"succeeded","video_url":"/v1/videos/vid_1/content"}`,
	} {
		video := grokMediaContentStatusResponse("mp4-bytes")
		video.Header.Set("Content-Type", "video/mp4")
		video.ContentLength = int64(len("mp4-bytes"))
		upstream := &grokMediaContentUpstreamStub{responses: []*http.Response{grokMediaContentStatusResponse(status), video}}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, w := grokMediaContentTestContext(http.MethodGet, "/v1/videos/vid_1/content", nil)
		result, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointContent, MiniMaxH3TaskKey("vid_1"), nil)
		require.NoError(t, err, status)
		require.Len(t, upstream.requests, 2)
		require.Equal(t, "https://relay.example/v1/videos/vid_1/content", upstream.requests[1].URL.String(), "must not download from %s", status)
		require.Equal(t, "Bearer test-upstream-key", upstream.requests[1].Header.Get("Authorization"))
		require.True(t, HTTPUpstreamRedirectsDisabled(upstream.requests[1].Context()))
		require.Equal(t, "mp4-bytes", w.Body.String())
		require.True(t, result.VideoContentDelivered)
	}

	// A relay without /content must surface as a gateway error, not a 404 that
	// clients read as a vanished task.
	for _, fallback := range []*http.Response{
		{StatusCode: http.StatusNotFound, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"error":"not found"}`))},
		grokMediaContentStatusResponse(`{"error":{"message":"no content"}}`),
	} {
		upstream := &grokMediaContentUpstreamStub{responses: []*http.Response{grokMediaContentStatusResponse(`{"task_id":"vid_1","status":"succeeded","video_url":"https://evil.example/vid_1.mp4"}`), fallback}}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, _ := grokMediaContentTestContext(http.MethodGet, "/v1/videos/vid_1/content", nil)
		_, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointContent, MiniMaxH3TaskKey("vid_1"), nil)
		require.Error(t, err)
		require.False(t, c.Writer.Written(), "the handler writes the gateway error")
	}
}

func TestMiniMaxH3UploadsDataImagesBeforeCreate(t *testing.T) {
	png := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	upload := grokMediaContentStatusResponse(`{"code":0,"success":true,"data":[{"url":"https://relay.example/api/media/uploads/1/a.png"},{"url":"https://relay.example/api/media/uploads/1/b.png"}]}`)
	upstream := &grokMediaContentUpstreamStub{responses: []*http.Response{upload, grokMediaContentStatusResponse(`{"task_id":"vid_2","status":"processing"}`)}}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, _ := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
	body := `{"model":"Xminimex-h3","prompt":"x","images":["` + png + `","https://example.com/keep.jpg","` + png + `"]}`
	_, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", []byte(body))
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
	_, err = svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", []byte(`{"model":"Xminimex-h3","prompt":"x","images":["`+png+`"]}`))
	require.Error(t, err)
	require.Len(t, upstream.requests, 1)
}

// A gateway relay (another sub2api) has no /v1/media: the data: image goes
// inline so the next hop uploads it.
func TestMiniMaxH3ForwardsDataImagesInlineWithoutRelayMedia(t *testing.T) {
	png := "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
	notFound := grokMediaContentStatusResponse(`{"error":"not found"}`)
	notFound.StatusCode = http.StatusNotFound
	upstream := &grokMediaContentUpstreamStub{responses: []*http.Response{notFound, grokMediaContentStatusResponse(`{"id":"vid_3","status":"queued"}`)}}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, _ := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
	_, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", []byte(`{"model":"MinimaxH3-768","prompt":"x","seconds":5,"images":["`+png+`"]}`))
	require.NoError(t, err)
	require.Len(t, upstream.requests, 2)
	require.Equal(t, "https://relay.example/v1/videos", upstream.requests[1].URL.String())
	forwarded, err := io.ReadAll(upstream.requests[1].Body)
	require.NoError(t, err)
	require.Equal(t, png, gjson.GetBytes(forwarded, "images.0").String())
}

func TestMiniMaxH3UpstreamErrorIsNotRetried(t *testing.T) {
	for _, status := range []int{400, 429, 503} {
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"error":{"message":"upstream failure"}}`)}
		upstream.response.StatusCode = status
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, w := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
		_, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", []byte(`{"model":"Xminimex-h3","prompt":"waves","seconds":10}`))
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
	_, err := svc.ForwardMiniMaxH3(context.Background(), c, miniMaxH3TestAccount(), MiniMaxH3EndpointCreate, "", []byte(`{"model":"Xminimex-h3","prompt":"waves","seconds":10}`))
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
	prices := map[string]map[string]float64{MiniMaxH3PriceFamily: {"xminimex-h3": 0.02, "minimaxh3-768": 0.08}}
	base, err := QuoteMiniMaxH3Model(prices, "Xminimex-h3", 5)
	require.NoError(t, err)
	require.InDelta(t, 0.1, base, 1e-9, "per-second models charge each second")
	base, err = QuoteMiniMaxH3Model(prices, "MinimaxH3-768", 5)
	require.NoError(t, err)
	require.InDelta(t, 0.08, base, 1e-9, "per-request models charge once")
	for _, tariff := range []map[string]map[string]float64{nil, {MiniMaxH3PriceFamily: {"xminimex-h3": -1}}, {MiniMaxH3PriceFamily: {"xminimex-h3": math.Inf(1)}}} {
		_, err := QuoteMiniMaxH3Model(tariff, "Xminimex-h3", 5)
		require.Error(t, err)
	}
	require.Equal(t, prices, NormalizeVideoModelPrices(prices))
	// The retired DeepKey shared tariff keys are dropped.
	require.Equal(t, prices, NormalizeVideoModelPrices(map[string]map[string]float64{MiniMaxH3PriceFamily: {
		"xminimex-h3": 0.02, "minimaxh3-768": 0.08, "768p": 0.15, "1440p": 0.25, "per_second": 0.1, "request_5s": 0.3, "minimax-h3-933-1440p-10-15s": 0.2,
	}}))
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
		{"Xminimex-h3": "MinimaxH3-768"},
		{"Xminimex-h3": "MiniMax-H3"},
		{"Xminimex-h3": "gpt-5"},
	} {
		a := miniMaxH3TestAccount()
		a.Credentials["model_mapping"] = mapping
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"id":"task_1"}`)}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, _ := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
		_, err := svc.ForwardMiniMaxH3(context.Background(), c, a, MiniMaxH3EndpointCreate, "", []byte(`{"model":"Xminimex-h3","prompt":"x"}`))
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

func TestCreatorVideoPricingMiniMaxH3Tiers(t *testing.T) {
	svc := newOpenAIRecordUsageServiceForTest(&openAIRecordUsageLogRepoStub{}, &openAIRecordUsageUserRepoStub{}, &openAIRecordUsageSubRepoStub{}, nil)
	key := &APIKey{GroupID: i64p(6), Group: &Group{ID: 6, Platform: PlatformMiniMax, RateMultiplier: 2,
		VideoModelPrices: map[string]map[string]float64{MiniMaxH3PriceFamily: {"xminimex-h3": 0.13, "minimaxh3-768": 2.6}}}}
	quote, err := svc.CreatorVideoPricing(context.Background(), key, 3, "Xminimex-h3")
	require.NoError(t, err)
	require.Len(t, quote.Prices, 1)
	prices := quote.Prices["1440p"]
	require.Len(t, prices, 15)
	require.Nil(t, prices[3], "4 seconds is below the tier minimum")
	require.InDelta(t, 0.13*12*2, *prices[11], 1e-9)
	require.InDelta(t, 0.13*15*2, *prices[14], 1e-9)
	quote, err = svc.CreatorVideoPricing(context.Background(), key, 3, "MinimaxH3-768")
	require.NoError(t, err)
	require.Nil(t, quote.Prices["768p"][7], "8 seconds is not sold")
	require.InDelta(t, 2.6*2, *quote.Prices["768p"][14], 1e-9)
	require.InDelta(t, 2.6*2, *quote.Prices["768p"][4], 1e-9)
}

func TestMiniMaxH3ZhonghengTiers(t *testing.T) {
	prices := map[string]map[string]float64{MiniMaxH3PriceFamily: {"xminimex-h3": 0.26, "minimaxh3-768": 2.6}}
	for _, tc := range []struct {
		model   string
		seconds int
		want    float64
	}{
		{"Xminimex-h3", 15, 3.9},
		{"MinimaxH3-768", 15, 2.6},
		{"MinimaxH3-768", 5, 2.6},
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
	_, err = QuoteMiniMaxH3Model(map[string]map[string]float64{MiniMaxH3PriceFamily: {"minimaxh3-768": 2.6}}, "Xminimex-h3", 10)
	require.ErrorContains(t, err, "not configured")
	require.True(t, isZhonghengAccount(miniMaxH3TestAccount()))
}

func customMiniMaxCatalog(t *testing.T, entries ...MiniMaxCatalogEntry) {
	t.Helper()
	normalized, err := NormalizeMiniMaxCatalog(entries)
	require.NoError(t, err)
	applyMiniMaxCatalogState(MiniMaxCatalogState{Customized: true, Entries: normalized})
	t.Cleanup(func() { applyMiniMaxCatalogState(emptyMiniMaxCatalogState()) })
}

func TestMiniMaxCatalogReplacesBuiltInModels(t *testing.T) {
	require.True(t, IsMiniMaxH3Model("xminimex-h3"))
	customMiniMaxCatalog(t, MiniMaxCatalogEntry{
		Model: " New-H3 ", Name: "新 H3", Note: "原生不卡脸", Resolution: "2k", MinSeconds: 6, MaxSeconds: 10, PerRequest: true,
		MaxReferenceImages: 3, RequiresReference: true, AspectRatios: []string{"9:16", "16:9", "9:16"},
	})
	require.True(t, IsMiniMaxH3Model("NEW-H3"))
	require.False(t, IsMiniMaxH3Model("xminimex-h3"), "a model missing from the saved catalog is no longer sold")
	state := CurrentMiniMaxCatalog()
	require.True(t, state.Customized)
	require.Equal(t, "new-h3", state.Entries[0].Model)
	require.Equal(t, "1440p", state.Entries[0].Resolution, "2k is the 1440p class")
	require.Equal(t, []string{"9:16", "16:9"}, state.Entries[0].AspectRatios)

	prices := map[string]map[string]float64{MiniMaxH3PriceFamily: {"new-h3": 1.5}}
	require.Equal(t, prices, NormalizeVideoModelPrices(map[string]map[string]float64{MiniMaxH3PriceFamily: {"new-h3": 1.5, "xminimex-h3": 0.2}}))
	total, err := QuoteMiniMaxH3Model(prices, "New-H3", 8)
	require.NoError(t, err)
	require.Equal(t, 1.5, total)
	_, err = QuoteMiniMaxH3Model(prices, "new-h3", 11)
	require.Error(t, err)
	_, err = ParseMiniMaxH3Request([]byte(`{"model":"new-h3","prompt":"x","seconds":8}`))
	require.ErrorContains(t, err, "reference image")

	applyMiniMaxCatalogState(emptyMiniMaxCatalogState())
	require.True(t, IsMiniMaxH3Model("xminimex-h3"))
	require.False(t, IsMiniMaxH3Model("new-h3"))
	require.False(t, CurrentMiniMaxCatalog().Customized)
}

func TestNormalizeMiniMaxCatalog(t *testing.T) {
	valid := MiniMaxCatalogEntry{Model: "m1", Resolution: "768p", MinSeconds: 5, MaxSeconds: 15, MaxReferenceImages: 9}
	out, err := NormalizeMiniMaxCatalog([]MiniMaxCatalogEntry{{Model: "gaps", Resolution: "768p", AllowedSeconds: []int{15, 5, 10, 10}}})
	require.NoError(t, err)
	require.Equal(t, []int{5, 10, 15}, out[0].AllowedSeconds)
	require.Equal(t, 5, out[0].MinSeconds)
	require.Equal(t, 15, out[0].MaxSeconds)
	for name, bad := range map[string][]MiniMaxCatalogEntry{
		"empty":            {},
		"blank model":      {{Resolution: "768p", MinSeconds: 5, MaxSeconds: 15}},
		"duplicate":        {valid, valid},
		"seedance id":      {{Model: "00sd2.0", Resolution: "768p", MinSeconds: 5, MaxSeconds: 15}},
		"resolution":       {{Model: "m", Resolution: "480p", MinSeconds: 5, MaxSeconds: 15}},
		"seconds":          {{Model: "m", Resolution: "768p", MinSeconds: 10, MaxSeconds: 5}},
		"too long":         {{Model: "m", Resolution: "768p", MinSeconds: 5, MaxSeconds: 61}},
		"references":       {{Model: "m", Resolution: "768p", MinSeconds: 5, MaxSeconds: 15, MaxReferenceImages: 10}},
		"needs references": {{Model: "m", Resolution: "768p", MinSeconds: 5, MaxSeconds: 15, RequiresReference: true}},
		"ratio":            {{Model: "m", Resolution: "768p", MinSeconds: 5, MaxSeconds: 15, AspectRatios: []string{"5:4"}}},
	} {
		_, err := NormalizeMiniMaxCatalog(bad)
		require.Error(t, err, name)
	}
}
