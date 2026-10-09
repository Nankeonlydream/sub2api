package service

import (
	"context"
	"fmt"
	"strings"
)

// CreatorVideoPricing contains the cost of one video for each resolution and
// duration (array index 0 is one second). Quoting every supported duration also
// preserves channel pricing configured per request instead of per second.
type CreatorVideoPricing struct {
	Currency string               `json:"currency"`
	Prices   map[string][]float64 `json:"prices"`
}

func (s *OpenAIGatewayService) CreatorVideoPricing(ctx context.Context, apiKey *APIKey, userID int64, model string) (*CreatorVideoPricing, error) {
	if apiKey == nil || apiKey.Group == nil || apiKey.GroupID == nil || s.billingService == nil {
		return nil, fmt.Errorf("video pricing is unavailable")
	}
	model = strings.TrimSpace(model)
	if model == "" || len(model) > 256 {
		return nil, fmt.Errorf("invalid video model")
	}
	quote := &CreatorVideoPricing{Currency: "USD", Prices: map[string][]float64{}}
	multiplier := s.ResolveUserGroupRateMultiplier(ctx, userID, *apiKey.GroupID, apiKey.Group.RateMultiplier)
	multiplier = resolveVideoRateMultiplier(apiKey, multiplier)
	for _, resolution := range []string{VideoBillingResolution480P, VideoBillingResolution720P, VideoBillingResolution1080P} {
		prices := make([]float64, VideoBillingMaxDurationSeconds)
		for duration := 1; duration <= VideoBillingMaxDurationSeconds; duration++ {
			cost := s.calculateOpenAIVideoCost(ctx, model, apiKey, &OpenAIForwardResult{VideoCount: 1, VideoResolution: resolution, VideoDurationSeconds: duration}, multiplier)
			prices[duration-1] = cost.ActualCost
		}
		quote.Prices[resolution] = prices
	}
	return quote, nil
}
