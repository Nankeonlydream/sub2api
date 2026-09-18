package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCreatorImagePricingMatchesRecordedCost(t *testing.T) {
	for _, tc := range []struct {
		name                string
		independent         bool
		imageRate, userRate float64
	}{
		{"user multiplier", false, 1, 0.5},
		{"independent image multiplier", true, 1.5, 0.5},
		{"free images", true, 0, 0.5},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &openAIRecordUsageLogRepoStub{inserted: true}
			users := &openAIRecordUsageUserRepoStub{}
			svc := newOpenAIRecordUsageServiceForTest(repo, users, &openAIRecordUsageSubRepoStub{}, &openAIUserGroupRateRepoStub{rate: &tc.userRate})
			p1, p2, p4 := 0.04, 0.08, 0.16
			key := &APIKey{ID: 1, GroupID: i64p(2), Group: &Group{ID: 2, RateMultiplier: 2,
				ImageRateIndependent: tc.independent, ImageRateMultiplier: tc.imageRate,
				ImagePrice1K: &p1, ImagePrice2K: &p2, ImagePrice4K: &p4,
			}}
			quote, err := svc.CreatorImagePricing(context.Background(), key, 3, "gpt-image-2")
			require.NoError(t, err)
			require.Equal(t, "USD", quote.Currency)
			require.Zero(t, users.deductCalls)
			require.Zero(t, repo.calls)
			for _, tier := range []string{"1K", "2K", "4K"} {
				err = svc.RecordUsage(context.Background(), &OpenAIRecordUsageInput{
					Result: &OpenAIForwardResult{RequestID: "quote_" + tier, Model: "gpt-image-2", ImageCount: 2, ImageInputSize: tier, ImageInputSizeAuthoritative: true},
					APIKey: key, User: &User{ID: 3}, Account: &Account{ID: 4, Platform: PlatformOpenAI},
				})
				require.NoError(t, err)
				require.InDelta(t, quote.Prices[tier]*2, repo.lastLog.ActualCost, 1e-12)
			}
		})
	}
}

func TestCreatorImagePricingTokenModeHasNoFixedPrice(t *testing.T) {
	svc := newOpenAIRecordUsageServiceForTest(&openAIRecordUsageLogRepoStub{}, &openAIRecordUsageUserRepoStub{}, &openAIRecordUsageSubRepoStub{}, nil)
	svc.resolver = NewModelPricingResolver(nil, svc.billingService)
	key := &APIKey{GroupID: i64p(2), Group: &Group{ID: 2, ModelPricing: []ChannelModelPricing{{Models: []string{"gpt-image-2"}, BillingMode: BillingModeToken}}}}
	quote, err := svc.CreatorImagePricing(context.Background(), key, 3, "gpt-image-2")
	require.NoError(t, err)
	require.Equal(t, BillingModeToken, quote.BillingMode)
	require.Empty(t, quote.Prices)
}
