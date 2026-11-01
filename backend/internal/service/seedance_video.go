package service

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"slices"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// The Seedance relay (Zhongheng) speaks a JSON OpenAI Videos API,
// unlike the native Ark task API in seedance.go. They are served from
// DeepSeek-platform groups.
const (
	SeedanceVideoEndpointCreate           GrokMediaEndpoint        = "seedance_video_create"
	SeedanceVideoEndpointStatus           GrokMediaEndpoint        = "seedance_video_status"
	SeedanceVideoEndpointContent          GrokMediaEndpoint        = "seedance_video_content"
	OpenAIEndpointCapabilitySeedanceVideo OpenAIEndpointCapability = "seedance_video"
	SeedanceVideoPriceFamily                                       = "seedance"
)

func (e GrokMediaEndpoint) IsSeedanceVideo() bool {
	return e == SeedanceVideoEndpointCreate || e == SeedanceVideoEndpointStatus || e == SeedanceVideoEndpointContent
}

func SeedanceVideoTaskKey(id string) string { return "seedance-video:" + strings.TrimSpace(id) }

// seedanceVideoTier is one relay model ID. PerRequest tiers charge the group
// price once per video; the others charge it per billed second, matching how
// the relay sells the model. Zhongheng tiers speak Zhongheng's request shape
// (duration, ratio, resolution, images).
type seedanceVideoTier struct {
	Resolution             string
	MinSeconds, MaxSeconds int
	AllowedSeconds         []int
	PerRequest             bool
	Zhongheng              bool
}

// zhTier is a Zhongheng model sold from minSeconds to maxSeconds except the
// skipped lengths its /v1/models duration_options leave out.
func zhTier(resolution string, minSeconds, maxSeconds int, perRequest bool, skipped ...int) seedanceVideoTier {
	tier := seedanceVideoTier{Resolution: resolution, MinSeconds: minSeconds, MaxSeconds: maxSeconds, PerRequest: perRequest, Zhongheng: true}
	if len(skipped) > 0 {
		for n := minSeconds; n <= maxSeconds; n++ {
			if !slices.Contains(skipped, n) {
				tier.AllowedSeconds = append(tier.AllowedSeconds, n)
			}
		}
	}
	return tier
}

var seedanceVideoTiers = map[string]seedanceVideoTier{
	// Zhongheng /v1/models?include_capabilities=1 observed 2026-10-30. Lengths
	// follow duration_options; models offering several resolutions are sold at
	// the highest one, since the relay prices them alike.
	"xseadanco2.0":        zhTier("720p", 5, 15, true),
	"xxseadanco2.0m":      zhTier("720p", 5, 15, false),
	"xxseedacn2.5":        zhTier("720p", 5, 30, false),
	"aseedance2.0":        zhTier("720p", 5, 15, true),
	"a-sd2.0":             zhOnly("720p", true, 5, 10, 15),
	"fseadanco2.0mini":    zhTier("720p", 5, 15, true),
	"ttsedanco2.0-480":    zhTier("480p", 5, 15, false),
	"ttsedanco2.0-720":    zhTier("720p", 5, 15, false),
	"ttseadanco2.5-1080":  zhTier("1080p", 5, 30, false),
	"oosd2.5-30秒":         zhOnly("720p", true, 30),
	"oosd2.5":             zhOnly("720p", true, 15),
	"00sd2.0":             zhOnly("720p", true, 5, 10, 15),
	"特价seadanco2.5-1080":  zhTier("1080p", 5, 30, true, 19, 20),
	"bbseadanco-1080":     zhTier("1080p", 5, 30, false),
	"bbseadanco-720":      zhTier("720p", 5, 30, false),
	"bbseadanco-480":      zhTier("480p", 5, 30, false),
	"tseadanco2.5-1080yt": zhTier("1080p", 5, 30, true),
	"tseadanco2.5-720yt":  zhTier("720p", 5, 30, true, 12),
	"tseadanco2.5-480yt":  zhTier("480p", 5, 30, true, 17),
	"ttsedanco2.5-480":    zhTier("480p", 5, 30, false),
	"ttseadanco2.5-720":   zhTier("720p", 5, 30, false),
	"sedanco2.0-300秒必出":   zhOnly("480p", true, 15),
}

func zhOnly(resolution string, perRequest bool, allowed ...int) seedanceVideoTier {
	tier := zhTier(resolution, allowed[0], allowed[len(allowed)-1], perRequest)
	if len(allowed) > 1 {
		tier.AllowedSeconds = allowed
	}
	return tier
}

func lookupSeedanceVideoTier(model string) (seedanceVideoTier, bool) {
	tier, ok := seedanceVideoTiers[strings.ToLower(strings.TrimSpace(model))]
	return tier, ok
}

// IsSeedanceVideoModel reports whether model is a known relay Seedance tier ID.
func IsSeedanceVideoModel(model string) bool {
	_, ok := lookupSeedanceVideoTier(model)
	return ok
}

// Tariff keys are catalog model IDs: the billing unit lives in the catalog, so
// an unknown ID could not be priced correctly.
func validSeedanceVideoTariffKey(key string) bool { return IsSeedanceVideoModel(key) }

func (t seedanceVideoTier) allows(seconds int) bool {
	if len(t.AllowedSeconds) > 0 {
		return slices.Contains(t.AllowedSeconds, seconds)
	}
	return seconds >= t.MinSeconds && seconds <= t.MaxSeconds
}

func (t seedanceVideoTier) durationError() error {
	if len(t.AllowedSeconds) > 0 {
		parts := make([]string, len(t.AllowedSeconds))
		for i, n := range t.AllowedSeconds {
			parts[i] = fmt.Sprint(n)
		}
		return fmt.Errorf("seconds must be one of %s", strings.Join(parts, ", "))
	}
	return fmt.Errorf("seconds must be an integer from %d to %d", t.MinSeconds, t.MaxSeconds)
}

// ParseSeedanceVideoRequest keeps the original JSON so reference media and
// future fields reach the upstream intact.
func ParseSeedanceVideoRequest(body []byte) (GrokMediaRequestInfo, error) {
	info := GrokMediaRequestInfo{N: 1}
	if !gjson.ValidBytes(body) || !gjson.ParseBytes(body).IsObject() {
		return info, fmt.Errorf("request body must be a JSON object")
	}
	model, prompt := gjson.GetBytes(body, "model"), gjson.GetBytes(body, "prompt")
	if model.Type != gjson.String || strings.TrimSpace(model.String()) == "" {
		return info, fmt.Errorf("model is required")
	}
	if prompt.Type != gjson.String || strings.TrimSpace(prompt.String()) == "" {
		return info, fmt.Errorf("prompt is required")
	}
	info.Model = strings.TrimSpace(model.String())
	tier, ok := lookupSeedanceVideoTier(info.Model)
	if !ok {
		return info, fmt.Errorf("unsupported Seedance model %q", info.Model)
	}
	duration, err := namedVideoTierSeconds(body, info.Model, tier.MinSeconds, tier.MaxSeconds)
	if err != nil {
		return info, err
	}
	if !tier.allows(duration) {
		return info, tier.durationError()
	}
	if resolution := gjson.GetBytes(body, "resolution"); resolution.Exists() && !strings.EqualFold(resolution.String(), tier.Resolution) {
		return info, fmt.Errorf("%s only outputs %s", info.Model, tier.Resolution)
	}
	// One task renders one video. Reject batching rather than undercharge.
	if n := gjson.GetBytes(body, "n"); n.Exists() && (n.Type != gjson.Number || n.Float() != 1) {
		return info, fmt.Errorf("seedance supports one video per request")
	}
	info.Resolution, info.DurationSeconds, info.Prompt = tier.Resolution, duration, prompt.String()
	info.AspectRatio = gjson.GetBytes(body, "aspect_ratio").String()
	// Collect reference images (gateway and references.* forms) for moderation.
	for _, path := range []string{"images", "references.images", "references.image"} {
		for _, item := range gjson.GetBytes(body, path).Array() {
			if item.Type == gjson.String {
				info.InputImageURLs = append(info.InputImageURLs, item.String())
			}
		}
	}
	return info, nil
}

// QuoteSeedanceVideo returns the base USD cost from the group's per-model
// price: once per video for per-request tiers, else price × billed seconds.
func QuoteSeedanceVideo(prices map[string]map[string]float64, model string, seconds int) (float64, error) {
	tier, ok := lookupSeedanceVideoTier(model)
	if !ok {
		return 0, fmt.Errorf("unsupported Seedance model %q", model)
	}
	if !tier.allows(seconds) {
		return 0, tier.durationError()
	}
	price, ok := prices[SeedanceVideoPriceFamily][strings.ToLower(strings.TrimSpace(model))]
	if !ok {
		return 0, fmt.Errorf("seedance model %s is disabled or its group price is not configured", model)
	}
	total := price
	if !tier.PerRequest {
		total *= float64(seconds)
	}
	if price < 0 || math.IsNaN(price) || math.IsInf(total, 0) {
		return 0, fmt.Errorf("invalid Seedance group video price")
	}
	return total, nil
}

// The requested and upstream model must be the same catalog ID: the ID decides
// the billed unit, seconds and resolution.
func prepareSeedanceVideoCreateBody(body []byte, info GrokMediaRequestInfo, upstreamModel string) ([]byte, error) {
	if !IsSeedanceVideoModel(upstreamModel) {
		return nil, fmt.Errorf("this video relay only supports Seedance models")
	}
	if !strings.EqualFold(strings.TrimSpace(upstreamModel), info.Model) {
		return nil, fmt.Errorf("seedance model mapping must not change the model")
	}
	body, err := sjson.SetBytes(body, "model", strings.TrimSpace(upstreamModel))
	if err != nil {
		return nil, err
	}
	return prepareZhonghengVideoBody(body, info)
}

// Zhongheng takes integer duration, ratio (from ratio or aspect_ratio) and
// resolution. images and
// start/end frames pass through (data: images are uploaded before create);
// metadata.audio_urls becomes reference_audios. Reference videos are refused:
// some Zhongheng models also bill their length, which the quote cannot know.
func prepareZhonghengVideoBody(body []byte, info GrokMediaRequestInfo) ([]byte, error) {
	for _, path := range []string{"reference_videos", "metadata.video_urls", "metadata.videos"} {
		if gjson.GetBytes(body, path).Exists() {
			return nil, fmt.Errorf("this model does not accept reference videos")
		}
	}
	var audios []string
	for _, path := range []string{"metadata.audio_urls", "metadata.audios"} {
		for _, item := range gjson.GetBytes(body, path).Array() {
			if item.Type != gjson.String || !isPublicHTTPMediaURL(item.String()) {
				return nil, fmt.Errorf("this model only accepts public http(s) reference audio URLs")
			}
			audios = append(audios, item.String())
		}
	}
	ratio := miniMaxH3Ratio(body)
	var err error
	for _, path := range []string{"seconds", "duration", "ratio", "aspect_ratio", "resolution", "size", "n", "mode", "client_task_id", "metadata"} {
		if body, err = sjson.DeleteBytes(body, path); err != nil {
			return nil, err
		}
	}
	fields := map[string]any{"duration": info.DurationSeconds, "resolution": info.Resolution}
	if ratio != "" {
		fields["ratio"] = ratio
	}
	if len(audios) > 0 {
		if gjson.GetBytes(body, "reference_audios").Exists() {
			return nil, fmt.Errorf("use either reference_audios or metadata.audio_urls, not both")
		}
		fields["reference_audios"] = audios
	}
	for path, value := range fields {
		if body, err = sjson.SetBytes(body, path, value); err != nil {
			return nil, err
		}
	}
	return body, nil
}

// isZhonghengAccount reports whether the account's whitelist sells Zhongheng
// tiers (Seedance or MiniMax-H3), whose relay needs uploads before create and
// has no /content route.
func isZhonghengAccount(account *Account) bool {
	for _, upstream := range account.GetModelMapping() {
		if tier, ok := lookupSeedanceVideoTier(upstream); ok && tier.Zhongheng {
			return true
		}
		if isZhonghengMiniMaxH3Model(upstream) {
			return true
		}
	}
	return false
}

func isPublicHTTPMediaURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Hostname() != "" && u.User == nil
}

var seedanceVideoRelay = openAIVideosRelay{
	Name: "Seedance", Capability: OpenAIEndpointCapabilitySeedanceVideo,
	Create: SeedanceVideoEndpointCreate, Status: SeedanceVideoEndpointStatus, Content: SeedanceVideoEndpointContent,
	TaskPrefix:               "seedance-video:",
	AccountRequirementErrMsg: "seedance video requires a DeepSeek API key account with a custom base URL",
	PrepareCreate: func(account *Account, body []byte, result *OpenAIForwardResult) ([]byte, error) {
		info, err := ParseSeedanceVideoRequest(body)
		if err != nil {
			return nil, err
		}
		result.Model, result.BillingModel, result.UpstreamModel = info.Model, info.Model, account.GetMappedModel(info.Model)
		result.VideoResolution, result.VideoDurationSeconds = info.Resolution, info.DurationSeconds
		return prepareSeedanceVideoCreateBody(body, info, result.UpstreamModel)
	},
}

func (s *OpenAIGatewayService) ForwardSeedanceVideo(ctx context.Context, c *gin.Context, account *Account, endpoint GrokMediaEndpoint, taskID string, body []byte) (*OpenAIForwardResult, error) {
	relay := seedanceVideoRelay
	// Status and content lookups carry only the task ID; they reach the account
	// that created the task, so the account decides the relay style.
	if isZhonghengAccount(account) {
		relay.UploadDataImages, relay.ContentFromStatus = true, true
	}
	return s.forwardOpenAIVideosRelay(ctx, c, relay, account, endpoint, taskID, body)
}
