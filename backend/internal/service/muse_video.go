package service

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// XinAI's muse-video sits in a Grok group but speaks its own JSON task API
// under /v1/media-studio/videos (not xAI's native video API). It is sold as a
// Seedance catalog entry so it shares the relay admission, durable settlement
// and Creator Studio plumbing; only the wire protocol differs.
const MuseVideoModel = "muse-video"

// isMuseVideoAccount reports whether the account's whitelist sells muse-video.
func isMuseVideoAccount(account *Account) bool {
	if account == nil {
		return false
	}
	for requested, upstream := range account.GetModelMapping() {
		if strings.EqualFold(strings.TrimSpace(upstream), MuseVideoModel) || strings.EqualFold(strings.TrimSpace(requested), MuseVideoModel) {
			return true
		}
	}
	return false
}

var museVideoRelay = openAIVideosRelay{
	Name: "Muse", Capability: OpenAIEndpointCapabilitySeedanceVideo,
	Create: SeedanceVideoEndpointCreate, Status: SeedanceVideoEndpointStatus, Content: SeedanceVideoEndpointContent,
	TaskPrefix:               "seedance-video:",
	Path:                     "/media-studio/videos",
	AccountRequirementErrMsg: "muse video requires a Grok API key account with a custom base URL",
	PrepareCreate: func(account *Account, body []byte, result *OpenAIForwardResult) ([]byte, error) {
		info, err := ParseSeedanceVideoRequest(body)
		if err != nil {
			return nil, err
		}
		result.Model, result.BillingModel, result.UpstreamModel = info.Model, info.Model, account.GetMappedModel(info.Model)
		result.VideoResolution, result.VideoDurationSeconds = info.Resolution, info.DurationSeconds
		return prepareMuseCreateBody(body, info, result.UpstreamModel)
	},
	Completed:     museVideoSettled,
	State:         museVideoState,
	RewriteClient: rewriteMuseClientBody,
}

// The body is rebuilt from validated fields only. client_task_id is always
// generated here: the upstream scopes it per XinAI key, which every user of
// this gateway shares, so a client-chosen value could reach another user's task.
func prepareMuseCreateBody(body []byte, info GrokMediaRequestInfo, upstreamModel string) ([]byte, error) {
	if !strings.EqualFold(strings.TrimSpace(upstreamModel), MuseVideoModel) || !strings.EqualFold(info.Model, MuseVideoModel) {
		return nil, fmt.Errorf("muse model mapping must not change the model")
	}
	if info.DurationSeconds < 1 || info.DurationSeconds > 10 {
		return nil, fmt.Errorf("seconds must be an integer from 1 to 10")
	}
	if info.Resolution != "720p" {
		return nil, fmt.Errorf("muse-video only outputs 720p")
	}
	out := map[string]any{
		"model":          MuseVideoModel,
		"prompt":         info.Prompt,
		"duration":       info.DurationSeconds,
		"resolution":     "720p",
		"client_task_id": "s2a-" + randomHex(16),
	}
	ratio := miniMaxH3Ratio(body)
	if size := strings.TrimSpace(gjson.GetBytes(body, "size").String()); ratio == "" && strings.Contains(size, ":") {
		ratio = size
	}
	if ratio != "" {
		out["size"] = ratio
	}
	var images []string
	for _, item := range gjson.GetBytes(body, "images").Array() {
		if item.Type != gjson.String {
			return nil, fmt.Errorf("images must be an array of URLs")
		}
		raw := strings.TrimSpace(item.String())
		lower := strings.ToLower(raw)
		if !isPublicHTTPMediaURL(raw) && !strings.HasPrefix(lower, "data:image/png;base64,") &&
			!strings.HasPrefix(lower, "data:image/jpeg;base64,") && !strings.HasPrefix(lower, "data:image/webp;base64,") {
			return nil, fmt.Errorf("muse images must be http(s) URLs or PNG/JPEG/WebP data URLs")
		}
		images = append(images, raw)
	}
	// One image only: a paid check on 2026-11-14 showed XinAI uses it as the
	// first frame, and the effect of several images has not been verified.
	if len(images) > 1 {
		return nil, fmt.Errorf("muse-video accepts at most 1 image")
	}
	if len(images) > 0 {
		out["images"] = images
	}
	return json.Marshal(out)
}

// museVideoSettled is the only success signal: completed and settled, with
// a valid billed length and amount. progress 100 or a playable file alone is not.
func museVideoSettled(body []byte) bool {
	if gjson.GetBytes(body, "status").String() != "completed" || gjson.GetBytes(body, "billing.status").String() != "settled" {
		return false
	}
	seconds, ok := miniMaxH3IntegerField(gjson.GetBytes(body, "billing.seconds"))
	amount := gjson.GetBytes(body, "billing.amount")
	return ok && seconds >= 1 && seconds <= 10 && amount.Type == gjson.Number &&
		!math.IsNaN(amount.Float()) && !math.IsInf(amount.Float(), 0) && amount.Float() >= 0
}

// museVideoState classifies a status body for the settlement worker. Anything
// not settled or explicitly failed (unknown, submitting, settlement_pending,
// completed without billing) stays pending; it never becomes free or failed.
func museVideoState(body []byte) string {
	if museVideoSettled(body) {
		return "complete"
	}
	switch strings.ToLower(gjson.GetBytes(body, "status").String()) {
	case "failed", "canceled", "cancelled":
		return "failed"
	}
	return "pending"
}

// rewriteMuseClientBody hides the upstream purchase cost and points the result
// URL at this gateway's authenticated content route.
func rewriteMuseClientBody(body []byte) []byte {
	if !gjson.ValidBytes(body) || !gjson.ParseBytes(body).IsObject() {
		return body
	}
	out := body
	if next, err := sjson.DeleteBytes(out, "billing"); err == nil {
		out = next
	}
	raw := gjson.GetBytes(out, "result.url").String()
	if id, ok := strings.CutSuffix(strings.TrimPrefix(raw, "/v1/media-studio/videos/"), "/content"); ok &&
		strings.HasPrefix(raw, "/v1/media-studio/videos/") && validateUpstreamPathSegment("video ID", id) == nil {
		if next, err := sjson.SetBytes(out, "result.url", "/v1/videos/"+id+"/content"); err == nil {
			out = next
		}
	}
	return out
}
