//go:build unit

package service

import (
	"context"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func museTestAccount() *Account {
	return &Account{ID: 14, Platform: PlatformGrok, Type: AccountTypeAPIKey, Credentials: map[string]any{
		"api_key": "test-xinai-key", "base_url": "https://xinai.example",
		"model_mapping": map[string]any{MuseVideoModel: MuseVideoModel},
	}}
}

const museSettledBody = `{"id":"sf_1","object":"video","model":"muse-video","status":"completed","progress":100,` +
	`"result":{"duration":1,"url":"/v1/media-studio/videos/sf_1/content"},"billing":{"amount":0.02,"seconds":1,"status":"settled"}}`

func TestMuseVideoCreateUsesMuseProtocol(t *testing.T) {
	require.True(t, museTestAccount().SupportsOpenAIEndpointCapability(OpenAIEndpointCapabilitySeedanceVideo))
	body := `{"model":"muse-video","prompt":"湖面","seconds":3,"aspect_ratio":"9:16","client_task_id":"other-user-order","images":["data:image/png;base64,AAAA"]}`
	info, err := ParseSeedanceVideoRequest([]byte(body))
	require.NoError(t, err)
	base, err := QuoteSeedanceVideo(map[string]map[string]float64{SeedanceVideoPriceFamily: {MuseVideoModel: 0.03}}, info.Model, info.DurationSeconds)
	require.NoError(t, err)
	require.InDelta(t, 0.09, base, 1e-9)

	upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(`{"id":"sf_1","status":"queued","billing":{"amount":0.2,"status":"frozen"}}`)}
	svc := &OpenAIGatewayService{httpUpstream: upstream}
	c, w := grokMediaContentTestContext(http.MethodPost, "/v1/videos/generations", nil)
	result, err := svc.ForwardSeedanceVideo(context.Background(), c, museTestAccount(), SeedanceVideoEndpointCreate, "", []byte(body))
	require.NoError(t, err)
	require.Equal(t, "https://xinai.example/v1/media-studio/videos", upstream.request.URL.String())
	require.Equal(t, "Bearer test-xinai-key", upstream.request.Header.Get("Authorization"))
	sent, err := io.ReadAll(upstream.request.Body)
	require.NoError(t, err)
	require.Equal(t, "muse-video", gjson.GetBytes(sent, "model").String())
	require.Equal(t, int64(3), gjson.GetBytes(sent, "duration").Int())
	require.Equal(t, "720p", gjson.GetBytes(sent, "resolution").String())
	require.Equal(t, "9:16", gjson.GetBytes(sent, "size").String())
	require.Equal(t, "data:image/png;base64,AAAA", gjson.GetBytes(sent, "images.0").String())
	require.Regexp(t, `^s2a-[0-9a-f]{32}$`, gjson.GetBytes(sent, "client_task_id").String(), "client IDs never reach the shared key")
	require.False(t, gjson.GetBytes(sent, "seconds").Exists())
	require.False(t, gjson.GetBytes(sent, "aspect_ratio").Exists())
	require.Equal(t, "seedance-video:sf_1", result.ResponseID)
	require.Equal(t, 3, result.VideoDurationSeconds)
	require.Zero(t, result.VideoCount)
	require.False(t, gjson.Get(w.Body.String(), "billing").Exists(), "upstream cost is not shown to users")

	for _, bad := range []string{
		`{"model":"muse-video","prompt":"x","duration":11}`,
		`{"model":"muse-video","prompt":"x","resolution":"1080p"}`,
	} {
		_, err := ParseSeedanceVideoRequest([]byte(bad))
		require.Error(t, err, bad)
	}
	_, err = prepareMuseCreateBody([]byte(`{"images":["file:///etc/passwd"]}`), GrokMediaRequestInfo{Model: MuseVideoModel, Prompt: "x", DurationSeconds: 1, Resolution: "720p"}, MuseVideoModel)
	require.Error(t, err)
	_, err = prepareMuseCreateBody([]byte(`{"images":["https://cdn.example/a.png","https://cdn.example/b.png"]}`), GrokMediaRequestInfo{Model: MuseVideoModel, Prompt: "x", DurationSeconds: 1, Resolution: "720p"}, MuseVideoModel)
	require.Error(t, err, "only one image is verified; several must be refused")
}

func TestMuseVideoStatusAndContent(t *testing.T) {
	for body, want := range map[string]int{
		museSettledBody: 1,
		`{"id":"sf_1","status":"completed","result":{"duration":1,"url":"/v1/media-studio/videos/sf_1/content"}}`: 0,
		`{"id":"sf_1","status":"completed","billing":{"amount":0.02,"status":"settled"}}`:                       0,
		`{"id":"sf_1","status":"processing","progress":100}`:                                                   0,
		`{"id":"sf_1","status":"done","billing":{"amount":0.02,"seconds":1,"status":"settled"}}`:               0,
	} {
		upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse(body)}
		svc := &OpenAIGatewayService{httpUpstream: upstream}
		c, w := grokMediaContentTestContext(http.MethodGet, "/v1/videos/sf_1", nil)
		result, err := svc.ForwardSeedanceVideo(context.Background(), c, museTestAccount(), SeedanceVideoEndpointStatus, SeedanceVideoTaskKey("sf_1"), nil)
		require.NoError(t, err, body)
		require.Equal(t, "/v1/media-studio/videos/sf_1", upstream.request.URL.Path)
		require.Equal(t, want, result.VideoCount, body)
		require.False(t, gjson.Get(w.Body.String(), "billing").Exists())
		if gjson.Get(body, "result.url").Exists() {
			require.Equal(t, "/v1/videos/sf_1/content", gjson.Get(w.Body.String(), "result.url").String())
		}
	}

	pending := grokMediaContentStatusResponse(`{"id":"sf_1","status":"settlement_pending"}`)
	pending.StatusCode = http.StatusServiceUnavailable
	svc := &OpenAIGatewayService{httpUpstream: &grokMediaContentUpstreamStub{response: pending}}
	c, w := grokMediaContentTestContext(http.MethodGet, "/v1/videos/sf_1", nil)
	result, err := svc.ForwardSeedanceVideo(context.Background(), c, museTestAccount(), SeedanceVideoEndpointStatus, SeedanceVideoTaskKey("sf_1"), nil)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, w.Code)
	require.Zero(t, result.VideoCount)

	upstream := &grokMediaContentUpstreamStub{response: grokMediaContentStatusResponse("mp4-bytes")}
	upstream.response.Header.Set("Content-Type", "video/mp4")
	upstream.response.ContentLength = int64(len("mp4-bytes"))
	svc = &OpenAIGatewayService{httpUpstream: upstream}
	c, w = grokMediaContentTestContext(http.MethodGet, "/v1/videos/sf_1/content", nil)
	result, err = svc.ForwardSeedanceVideo(context.Background(), c, museTestAccount(), SeedanceVideoEndpointContent, SeedanceVideoTaskKey("sf_1"), nil)
	require.NoError(t, err)
	require.Equal(t, "/v1/media-studio/videos/sf_1/content", upstream.request.URL.Path)
	require.Equal(t, "Bearer test-xinai-key", upstream.request.Header.Get("Authorization"))
	require.Equal(t, "mp4-bytes", w.Body.String())
	require.True(t, result.VideoContentDelivered)

	jsonErr := grokMediaContentStatusResponse(`{"error":{"message":"not ready"}}`)
	svc = &OpenAIGatewayService{httpUpstream: &grokMediaContentUpstreamStub{response: jsonErr}}
	c, _ = grokMediaContentTestContext(http.MethodGet, "/v1/videos/sf_1/content", nil)
	result, _ = svc.ForwardSeedanceVideo(context.Background(), c, museTestAccount(), SeedanceVideoEndpointContent, SeedanceVideoTaskKey("sf_1"), nil)
	require.True(t, result == nil || !result.VideoContentDelivered, "a JSON body is never delivered as a video")
}

func TestMuseVideoSettlementWorker(t *testing.T) {
	for _, tc := range []struct {
		name, body, state string
		want              int
	}{
		{"settled", museSettledBody, "complete", 1},
		{"completed without billing", `{"id":"sf_1","status":"completed","result":{"duration":1}}`, "pending", 0},
		{"billing not settled", `{"id":"sf_1","status":"completed","billing":{"amount":0.02,"seconds":1,"status":"pending"}}`, "pending", 0},
		{"unknown", `{"id":"sf_1","status":"unknown","error":{"message":"?"}}`, "pending", 0},
		{"failed", `{"id":"sf_1","status":"failed"}`, "failed", 0},
		{"cancelled", `{"id":"sf_1","status":"cancelled"}`, "failed", 0},
		{"other task", `{"id":"sf_2","status":"completed","billing":{"amount":0.02,"seconds":1,"status":"settled"}}`, "pending", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			task := relaySettlementFixture()
			task.TaskID = "seedance-video:sf_1"
			task.Event.Command.RequestID = StableGrokVideoBillingRequestID(task.TaskID)
			task.Event.Usage.RequestID = task.Event.Command.RequestID
			repo := &relaySettlementTestRepo{task: task, state: "pending"}
			up := &relaySettlementHTTP{body: tc.body}
			account := museTestAccount()
			account.ID = 3
			s := &OpenAIGatewayService{usageBillingRepo: repo, httpUpstream: up, accountRepo: &openAIRecordUsageAccountRepoStub{account: account}}
			require.NoError(t, s.recoverRelayVideos(context.Background(), nil))
			require.Equal(t, tc.want, repo.charges)
			require.Equal(t, tc.state, repo.state)
			require.NoError(t, s.recoverRelayVideos(context.Background(), nil))
			require.Equal(t, tc.want, repo.charges, "repeat polling never charges twice")
		})
	}
}
