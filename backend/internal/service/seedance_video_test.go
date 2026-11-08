//go:build unit

package service

import (
	"context"
	"io"
	"math"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func seedanceVideoTestAccount(model string) *Account {
	return &Account{ID: 11, Platform: PlatformDeepseek, Type: AccountTypeAPIKey, Credentials: map[string]any{
		"api_key": "test-upstream-key", "base_url": "https://relay.example/",
		"model_mapping": map[string]any{model: model},
	}}
}

// ttsedanco2.0-480 and xxseedacn2.5 sell per second; xseadanco2.0 and a-sd2.0
// per request.
var seedanceVideoTestPrices = map[string]map[string]float64{SeedanceVideoPriceFamily: {
	"ttsedanco2.0-480": 0.4, "xxseedacn2.5": 1.2,
	"xseadanco2.0": 7, "a-sd2.0": 13,
}}

func TestSeedanceVideoForwardTiers(t *testing.T) {
	for _, tc := range []struct {
		body       string
		resolution string
		seconds    int
		base       float64
	}{
		{`{"model":"ttsedanco2.0-480","prompt":"x","aspect_ratio":"16:9"}`, "480p", 5, 2},
		{`{"model":"ttsedanco2.0-480","prompt":"x","seconds":"12","duration":12}`, "480p", 12, 4.8},
		{`{"model":"xxseedacn2.5","prompt":"x","duration":30}`, "720p", 30, 36},
		{`{"model":"xseadanco2.0","prompt":"x","seconds":15}`, "720p", 15, 7},
		{`{"model":"A-SD2.0","prompt":"x","duration":10}`, "720p", 10, 13},
	} {
		info, err := ParseSeedanceVideoRequest([]byte(tc.body))
		require.NoError(t, err, tc.body)
		require.Equal(t, tc.resolution, info.Resolution)
		require.Equal(t, tc.seconds, info.DurationSeconds)
		base, err := QuoteSeedanceVideo(seedanceVideoTestPrices, info.Model, info.DurationSeconds)
		require.NoError(t, err)
		require.InDelta(t, tc.base, base, 1e-9, tc.body)

		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"id":"sf_1","task_id":"task_1","status":"queued"}`)}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, w := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
		result, err := svc.ForwardSeedanceVideo(context.Background(), c, seedanceVideoTestAccount(info.Model), SeedanceVideoEndpointCreate, "", []byte(tc.body))
		require.NoError(t, err, tc.body)
		require.Equal(t, "https://relay.example/v1/videos", upstream.request.URL.String())
		require.Equal(t, "Bearer test-upstream-key", upstream.request.Header.Get("Authorization"))
		require.True(t, HTTPUpstreamRedirectsDisabled(upstream.request.Context()))
		forwarded, err := io.ReadAll(upstream.request.Body)
		require.NoError(t, err)
		require.Equal(t, int64(tc.seconds), gjson.GetBytes(forwarded, "duration").Int())
		require.Equal(t, tc.resolution, gjson.GetBytes(forwarded, "resolution").String())
		require.False(t, gjson.GetBytes(forwarded, "seconds").Exists())
		require.Equal(t, "seedance-video:sf_1", result.ResponseID)
		require.Equal(t, tc.resolution, result.VideoResolution)
		require.Equal(t, tc.seconds, result.VideoDurationSeconds)
		require.Zero(t, result.VideoCount, "async acceptance must not charge")
		require.JSONEq(t, `{"id":"sf_1","task_id":"task_1","status":"queued"}`, w.Body.String())
	}
}

func TestSeedanceVideoRejectsInvalidRequests(t *testing.T) {
	for _, body := range []string{
		`{`, `[]`, `{}`,
		`{"model":"ttsedanco2.0-480"}`,
		`{"model":"ttsedanco2.0-480","prompt":" "}`,
		`{"model":"seedance-1-0-pro","prompt":"x"}`,
		// Removed XinAI and DeepKey lines.
		`{"model":"ch1309-sd-2.0-480p","prompt":"x"}`,
		`{"model":"sd2.0-mini933-720p-x5-15s","prompt":"x"}`,
		`{"model":"ttsedanco2.0-480","prompt":"x","duration":4}`,
		`{"model":"ttsedanco2.0-480","prompt":"x","duration":16}`,
		`{"model":"ttsedanco2.0-480","prompt":"x","resolution":"720p"}`,
		`{"model":"ttsedanco2.0-480","prompt":"x","seconds":8.5}`,
		`{"model":"ttsedanco2.0-480","prompt":"x","seconds":"8s"}`,
		`{"model":"ttsedanco2.0-480","prompt":"x","seconds":8,"duration":9}`,
		`{"model":"ttsedanco2.0-480","prompt":"x","n":2}`,
	} {
		_, err := ParseSeedanceVideoRequest([]byte(body))
		require.Error(t, err, body)
	}
}

func TestSeedanceVideoMappingMustKeepTier(t *testing.T) {
	for _, target := range []string{"ttsedanco2.0-720", "xseadanco2.0", "deepseek-v4-pro"} {
		a := seedanceVideoTestAccount("ttsedanco2.0-480")
		a.Credentials["model_mapping"] = map[string]any{"ttsedanco2.0-480": target}
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"id":"sf_1"}`)}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, _ := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
		_, err := svc.ForwardSeedanceVideo(context.Background(), c, a, SeedanceVideoEndpointCreate, "", []byte(`{"model":"ttsedanco2.0-480","prompt":"x"}`))
		require.Error(t, err, target)
		require.Empty(t, upstream.requests, "a mismatched tier must not reach the upstream")
	}
}

func TestSeedanceVideoAccountCapability(t *testing.T) {
	a := seedanceVideoTestAccount("ttsedanco2.0-480")
	require.True(t, a.SupportsOpenAIEndpointCapability(OpenAIEndpointCapabilitySeedanceVideo))
	require.False(t, a.SupportsOpenAIEndpointCapability(OpenAIEndpointCapabilityMiniMaxH3))
	a.Platform = PlatformMiniMax
	require.False(t, a.SupportsOpenAIEndpointCapability(OpenAIEndpointCapabilitySeedanceVideo))
	a.Platform = PlatformDeepseek
	a.Credentials["base_url"] = " "
	require.False(t, a.SupportsOpenAIEndpointCapability(OpenAIEndpointCapabilitySeedanceVideo))

	// A Grok API key account serves the relay only when mapped to a relay model.
	grok := seedanceVideoTestAccount("ttsedanco2.0-480")
	grok.Platform = PlatformGrok
	require.True(t, grok.SupportsOpenAIEndpointCapability(OpenAIEndpointCapabilitySeedanceVideo))
	grok.Credentials["model_mapping"] = map[string]any{"grok-imagine-video": "grok-imagine-video"}
	require.False(t, grok.SupportsOpenAIEndpointCapability(OpenAIEndpointCapabilitySeedanceVideo))

	// An H3 account must not serve Seedance endpoints and vice versa.
	svc := &OpenAIGatewayService{httpUpstream: &grokMediaContentUpstreamStub{}}
	c, _ := grokMediaContentTestContext(http.MethodGet, "/v1/videos/t", nil)
	_, err := svc.ForwardSeedanceVideo(context.Background(), c, miniMaxH3TestAccount(), SeedanceVideoEndpointStatus, SeedanceVideoTaskKey("t"), nil)
	require.Error(t, err)
	_, err = svc.ForwardSeedanceVideo(context.Background(), c, seedanceVideoTestAccount("x"), MiniMaxH3EndpointStatus, SeedanceVideoTaskKey("t"), nil)
	require.Error(t, err)
}

func TestSeedanceVideoStatusAndContent(t *testing.T) {
	for body, want := range map[string]int{
		`{"id":"t","status":"completed","url":"https://videos.example/t.mp4"}`: 1,
		`{"id":"t","status":"completed"}`:                                      0,
		`{"id":"t","status":"in_progress","progress":100}`:                     0,
		`{"id":"t","status":"failed","error":{"message":"x"}}`:                 0,
	} {
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(body)}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, w := grokMediaContentTestContext(http.MethodGet, "/v1/videos/t", nil)
		result, err := svc.ForwardSeedanceVideo(context.Background(), c, seedanceVideoTestAccount("x"), SeedanceVideoEndpointStatus, SeedanceVideoTaskKey("t"), nil)
		require.NoError(t, err)
		require.Equal(t, "/v1/videos/t", upstream.request.URL.Path)
		require.Equal(t, want, result.VideoCount, body)
		require.JSONEq(t, body, w.Body.String())
	}

	upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse("mp4-bytes")}
	upstream.response.Header.Set("Content-Type", "video/mp4")
	upstream.response.ContentLength = int64(len("mp4-bytes"))
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, w := grokMediaContentTestContext(http.MethodGet, "/v1/videos/t/content", nil)
	result, err := svc.ForwardSeedanceVideo(context.Background(), c, seedanceVideoTestAccount("x"), SeedanceVideoEndpointContent, SeedanceVideoTaskKey("t"), nil)
	require.NoError(t, err)
	require.Equal(t, "mp4-bytes", w.Body.String())
	require.Equal(t, "/v1/videos/t/content", upstream.request.URL.Path)
	require.Equal(t, 1, result.VideoCount)
	require.True(t, result.VideoContentDelivered)

	for _, id := range []string{"", "..", "a/b", "a?b", "%2e%2e"} {
		_, err := seedanceVideoRelay.buildURL("https://relay.example", SeedanceVideoEndpointStatus, id)
		require.Error(t, err, id)
	}
}

func TestSeedanceVideoUpstreamErrorIsNotRetried(t *testing.T) {
	for _, status := range []int{400, 409, 429, 503} {
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"error":{"message":"upstream failure","code":"REQUEST_CONFLICT"}}`)}
		upstream.response.StatusCode = status
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, w := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
		_, err := svc.ForwardSeedanceVideo(context.Background(), c, seedanceVideoTestAccount("ttsedanco2.0-480"), SeedanceVideoEndpointCreate, "", []byte(`{"model":"ttsedanco2.0-480","prompt":"x"}`))
		require.Error(t, err)
		require.Equal(t, status, w.Code)
		require.Len(t, upstream.requests, 1)
		require.Equal(t, "REQUEST_CONFLICT", gjson.Get(w.Body.String(), "error.code").String())
	}
}

func TestSeedanceVideoTariff(t *testing.T) {
	m := "ttsedanco2.0-480"
	_, err := QuoteSeedanceVideo(map[string]map[string]float64{SeedanceVideoPriceFamily: {"ttsedanco2.0-720": 0.5}}, m, 5)
	require.ErrorContains(t, err, m)
	for _, prices := range []map[string]map[string]float64{nil, {MiniMaxH3PriceFamily: {MiniMaxH3PerSecond: 0.1}}, {SeedanceVideoPriceFamily: {m: -1}}, {SeedanceVideoPriceFamily: {m: math.NaN()}}} {
		_, err := QuoteSeedanceVideo(prices, m, 5)
		require.Error(t, err)
	}
	require.Equal(t, seedanceVideoTestPrices, NormalizeVideoModelPrices(seedanceVideoTestPrices))
	// Unknown IDs, including removed relay models, are dropped on save.
	normalized := NormalizeVideoModelPrices(map[string]map[string]float64{"Seedance": {"TTsedanco2.0-480": 0.4, "ch1309-sd-2.0-480p": 1.5, "sd2.0-mini933-720p-x5-15s": 1.5, "720p": 0.1, "unknown-model": 0.2}})
	require.Equal(t, map[string]map[string]float64{SeedanceVideoPriceFamily: {"ttsedanco2.0-480": 0.4}}, normalized)

	_, err = QuoteSeedanceVideo(seedanceVideoTestPrices, "a-sd2.0", 7)
	require.ErrorContains(t, err, "5, 10, 15")
	_, err = QuoteSeedanceVideo(seedanceVideoTestPrices, m, 16)
	require.ErrorContains(t, err, "5 to 15")
}

func TestCreatorVideoPricingSeedanceTiers(t *testing.T) {
	svc := newOpenAIRecordUsageServiceForTest(&openAIRecordUsageLogRepoStub{}, &openAIRecordUsageUserRepoStub{}, &openAIRecordUsageSubRepoStub{}, nil)
	key := &APIKey{GroupID: i64p(7), Group: &Group{ID: 7, Platform: PlatformDeepseek, RateMultiplier: 2, VideoModelPrices: seedanceVideoTestPrices}}
	quote, err := svc.CreatorVideoPricing(context.Background(), key, 3, "ttsedanco2.0-480")
	require.NoError(t, err)
	require.Len(t, quote.Prices, 1)
	prices := quote.Prices["480p"]
	require.Len(t, prices, 15)
	require.Nil(t, prices[3])
	require.InDelta(t, 4.0, *prices[4], 1e-9)
	require.InDelta(t, 12.0, *prices[14], 1e-9)
	quote, err = svc.CreatorVideoPricing(context.Background(), key, 3, "a-sd2.0")
	require.NoError(t, err)
	prices = quote.Prices["720p"]
	require.Len(t, prices, 15)
	require.Nil(t, prices[6])
	require.InDelta(t, 26.0, *prices[9], 1e-9)
	require.InDelta(t, 26.0, *prices[14], 1e-9)
}

// A relay may report completion with a relative content URL served by this
// gateway.
func TestSeedanceVideoRelativeContentStatus(t *testing.T) {
	for body, want := range map[string]int{
		`{"id":"sf_abc","status":"completed","metadata":{"url":"/v1/videos/sf_abc/content"}}`: 1,
		`{"id":"sf_abc","status":"completed","metadata":{"url":"/v1/videos/../content"}}`:     0,
		`{"id":"sf_abc","status":"completed","metadata":{"url":"/other/sf_abc/content"}}`:     0,
		`{"id":"sf_abc","status":"running","metadata":{"url":"/v1/videos/sf_abc/content"}}`:   0,
	} {
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(body)}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, _ := grokMediaContentTestContext(http.MethodGet, "/v1/videos/sf_abc", nil)
		result, err := svc.ForwardSeedanceVideo(context.Background(), c, seedanceVideoTestAccount("x"), SeedanceVideoEndpointStatus, SeedanceVideoTaskKey("sf_abc"), nil)
		require.NoError(t, err)
		require.Equal(t, want, result.VideoCount, body)
	}
}

func TestSeedanceVideoLongDurationIsRecorded(t *testing.T) {
	base := 13.0
	cost := (&OpenAIGatewayService{}).calculateOpenAIVideoCost(context.Background(), "xxseedacn2.5", &APIKey{}, &OpenAIForwardResult{VideoCount: 1, MiniMaxH3BaseCost: &base, VideoDurationSeconds: 30}, 1)
	require.InDelta(t, 13.0, cost.ActualCost, 1e-9)
	key := &APIKey{GroupID: i64p(7), Group: &Group{ID: 7, RateMultiplier: 1, VideoModelPrices: map[string]map[string]float64{SeedanceVideoPriceFamily: {"xxseedacn2.5": 1}}}}
	svc := newOpenAIRecordUsageServiceForTest(&openAIRecordUsageLogRepoStub{}, &openAIRecordUsageUserRepoStub{}, &openAIRecordUsageSubRepoStub{}, nil)
	quote, err := svc.CreatorVideoPricing(context.Background(), key, 3, "xxseedacn2.5")
	require.NoError(t, err)
	require.Len(t, quote.Prices["720p"], 30)
	require.InDelta(t, 30.0, *quote.Prices["720p"][29], 1e-9)
}

func zhonghengTestAccount(model string) *Account {
	a := seedanceVideoTestAccount(model)
	a.Credentials["base_url"] = "https://zh.example/v1"
	return a
}

func TestSeedanceVideoZhonghengDialect(t *testing.T) {
	prices := map[string]map[string]float64{SeedanceVideoPriceFamily: {"xxseadanco2.0m": 0.4, "a-sd2.0": 5, "特价seadanco2.5-1080": 9}}
	for _, tc := range []struct {
		body, model, resolution, ratio string
		seconds                        int
		base                           float64
	}{
		{`{"model":"XXseadanco2.0M","prompt":"x","seconds":12,"aspect_ratio":"9:16"}`, "XXseadanco2.0M", "720p", "9:16", 12, 4.8},
		{`{"model":"A-SD2.0","prompt":"x","seconds":"10","ratio":"1:1","size":"1280x720","mode":"references"}`, "A-SD2.0", "720p", "1:1", 10, 5},
		{`{"model":"特价seadanco2.5-1080","prompt":"x","duration":30,"resolution":"1080P"}`, "特价seadanco2.5-1080", "1080p", "", 30, 9},
	} {
		info, err := ParseSeedanceVideoRequest([]byte(tc.body))
		require.NoError(t, err, tc.body)
		require.Equal(t, tc.resolution, info.Resolution)
		base, err := QuoteSeedanceVideo(prices, info.Model, info.DurationSeconds)
		require.NoError(t, err)
		require.InDelta(t, tc.base, base, 1e-9, tc.body)

		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"code":0,"success":true,"task_id":"vid_1","status":"processing","next_poll_seconds":10}`)}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, _ := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
		result, err := svc.ForwardSeedanceVideo(context.Background(), c, zhonghengTestAccount(tc.model), SeedanceVideoEndpointCreate, "", []byte(tc.body))
		require.NoError(t, err, tc.body)
		require.Equal(t, SeedanceVideoTaskKey("vid_1"), result.ResponseID)
		require.Equal(t, "https://zh.example/v1/videos", upstream.request.URL.String())
		require.NotEmpty(t, upstream.request.Header.Get("Idempotency-Key"))
		forwarded, err := io.ReadAll(upstream.request.Body)
		require.NoError(t, err)
		// Zhongheng shape: model ID kept verbatim, integer duration, ratio, resolution.
		require.Equal(t, tc.model, gjson.GetBytes(forwarded, "model").String())
		require.Equal(t, gjson.Number, gjson.GetBytes(forwarded, "duration").Type)
		require.Equal(t, int64(tc.seconds), gjson.GetBytes(forwarded, "duration").Int())
		require.Equal(t, tc.resolution, gjson.GetBytes(forwarded, "resolution").String())
		require.Equal(t, tc.ratio, gjson.GetBytes(forwarded, "ratio").String())
		for _, path := range []string{"seconds", "aspect_ratio", "size", "mode", "client_task_id", "references"} {
			require.False(t, gjson.GetBytes(forwarded, path).Exists(), path)
		}
	}
}

func TestSeedanceVideoZhonghengLengthsAndReferences(t *testing.T) {
	for body, ok := range map[string]bool{
		`{"model":"A-SD2.0","prompt":"x","seconds":5}`:  true,
		`{"model":"A-SD2.0","prompt":"x","seconds":7}`:  false,
		`{"model":"OOsd2.5","prompt":"x"}`:              true,
		`{"model":"OOsd2.5","prompt":"x","seconds":10}`: false,
	} {
		_, err := ParseSeedanceVideoRequest([]byte(body))
		require.Equal(t, ok, err == nil, body)
	}

	// Reference videos may be billed by their own length: refuse them.
	upstream := &grokMediaContentUpstreamStub{}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, _ := grokMediaContentTestContext(http.MethodPost, "/v1/videos", nil)
	for _, body := range []string{
		`{"model":"TTseadanco2.5-720","prompt":"x","reference_videos":["https://e.example/a.mp4"]}`,
		`{"model":"TTseadanco2.5-720","prompt":"x","metadata":{"video_urls":["https://e.example/a.mp4"]}}`,
	} {
		_, err := svc.ForwardSeedanceVideo(context.Background(), c, zhonghengTestAccount("TTseadanco2.5-720"), SeedanceVideoEndpointCreate, "", []byte(body))
		require.ErrorContains(t, err, "reference videos", body)
	}
	require.Empty(t, upstream.requests)

	upstream = &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"task_id":"vid_1","status":"processing"}`)}
	svc = &OpenAIGatewayService{httpUpstream: upstream}
	body := `{"model":"TTseadanco2.5-720","prompt":"x","images":["https://e.example/a.jpg"],"metadata":{"audio_urls":["https://e.example/a.wav"]}}`
	_, err := svc.ForwardSeedanceVideo(context.Background(), c, zhonghengTestAccount("TTseadanco2.5-720"), SeedanceVideoEndpointCreate, "", []byte(body))
	require.NoError(t, err)
	forwarded, err := io.ReadAll(upstream.request.Body)
	require.NoError(t, err)
	require.Equal(t, `["https://e.example/a.jpg"]`, gjson.GetBytes(forwarded, "images").Raw)
	require.Equal(t, `["https://e.example/a.wav"]`, gjson.GetBytes(forwarded, "reference_audios").Raw)
	require.False(t, gjson.GetBytes(forwarded, "metadata").Exists())
}

// Zhongheng has no /content route: content reads the status and downloads the
// relay-hosted video without the key. Other relays keep their own routes.
func TestSeedanceVideoZhonghengContentFromStatus(t *testing.T) {
	succeeded := `{"task_id":"vid_1","status":"succeeded","video_url":"https://zh.example/api/video-content/vid_1"}`
	upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(succeeded)}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, _ := grokMediaContentTestContext(http.MethodGet, "/v1/videos/vid_1", nil)
	result, err := svc.ForwardSeedanceVideo(context.Background(), c, zhonghengTestAccount("A-SD2.0"), SeedanceVideoEndpointStatus, SeedanceVideoTaskKey("vid_1"), nil)
	require.NoError(t, err)
	require.Equal(t, "https://zh.example/v1/videos/vid_1", upstream.request.URL.String())
	require.Equal(t, 1, result.VideoCount)

	video := grokMediaContentStatusResponse("mp4-bytes")
	video.Header.Set("Content-Type", "video/mp4")
	video.ContentLength = int64(len("mp4-bytes"))
	upstream = &grokMediaContentUpstreamStub{responses: []*http.Response{grokMediaContentStatusResponse(succeeded), video}}
	svc = &OpenAIGatewayService{httpUpstream: upstream}
	c, w := grokMediaContentTestContext(http.MethodGet, "/v1/videos/vid_1/content", nil)
	result, err = svc.ForwardSeedanceVideo(context.Background(), c, zhonghengTestAccount("A-SD2.0"), SeedanceVideoEndpointContent, SeedanceVideoTaskKey("vid_1"), nil)
	require.NoError(t, err)
	require.Len(t, upstream.requests, 2)
	require.Equal(t, "https://zh.example/v1/videos/vid_1", upstream.requests[0].URL.String())
	require.Equal(t, "https://zh.example/api/video-content/vid_1", upstream.requests[1].URL.String())
	require.Empty(t, upstream.requests[1].Header.Get("Authorization"))
	require.Equal(t, "mp4-bytes", w.Body.String())
	require.Equal(t, 1, result.VideoCount)
	require.True(t, result.VideoContentDelivered)

	require.True(t, isZhonghengAccount(zhonghengTestAccount("特价seadanco2.5-1080")))
}
