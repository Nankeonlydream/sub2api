package service

import (
	"context"
	"fmt"
	"strings"
)

// CreatorImagePricing quotes successful image outputs without generating images
// or recording usage. Account routing and actual output counts may change the bill.
type CreatorImagePricing struct {
	Currency    string             `json:"currency"`
	BillingMode BillingMode        `json:"billing_mode"`
	Prices      map[string]float64 `json:"prices"`
}

func (s *OpenAIGatewayService) CreatorImagePricing(ctx context.Context, apiKey *APIKey, userID int64, model string) (*CreatorImagePricing, error) {
	if apiKey == nil || apiKey.Group == nil || apiKey.GroupID == nil || s.billingService == nil {
		return nil, fmt.Errorf("image pricing is unavailable")
	}
	model = strings.TrimSpace(model)
	if model == "" || len(model) > 256 {
		return nil, fmt.Errorf("invalid image model")
	}
	quote := &CreatorImagePricing{Currency: "USD", BillingMode: BillingModeImage, Prices: map[string]float64{}}
	if resolved := s.resolveOpenAIChannelPricing(ctx, model, apiKey); resolved != nil && resolved.Mode == BillingModeToken {
		quote.BillingMode = BillingModeToken
		return quote, nil
	}
	multiplier := s.ResolveUserGroupRateMultiplier(ctx, userID, *apiKey.GroupID, apiKey.Group.RateMultiplier)
	multiplier = resolveImageRateMultiplier(apiKey, multiplier)
	for _, tier := range []string{ImageBillingSize1K, ImageBillingSize2K, ImageBillingSize4K} {
		cost := s.calculateOpenAIImageCost(ctx, model, apiKey, &OpenAIForwardResult{ImageCount: 1, ImageSize: tier}, multiplier)
		quote.Prices[tier] = cost.ActualCost
	}
	return quote, nil
}
