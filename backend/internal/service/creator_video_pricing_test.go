package service

import (
	"context"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestCreatorVideoPricingMatchesRecordedCost(t *testing.T) {
	for _, tc := range []struct {
		name        string
		independent bool
		rate        float64
	}{
		{"user multiplier", false, 1}, {"video multiplier", true, 0.25}, {"free", true, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &openAIRecordUsageLogRepoStub{inserted: true}
			users := &openAIRecordUsageUserRepoStub{}
			userRate := 0.5
			svc := newOpenAIRecordUsageServiceForTest(repo, users, &openAIRecordUsageSubRepoStub{}, &openAIUserGroupRateRepoStub{rate: &userRate})
			key := &APIKey{ID: 1, GroupID: i64p(2), Group: &Group{ID: 2, Platform: PlatformGrok, RateMultiplier: 2, VideoRateIndependent: tc.independent, VideoRateMultiplier: tc.rate,
				VideoModelPrices: map[string]map[string]float64{"grok-imagine-video-1.5": {"480p": 0.04, "720p": 0.08, "1080p": 0.16}},
			}}
			quote, err := svc.CreatorVideoPricing(context.Background(), key, 3, "grok-imagine-video-1.5")
			require.NoError(t, err)
			require.Equal(t, "USD", quote.Currency)
			require.Zero(t, users.deductCalls)
			require.Zero(t, repo.calls)
			for _, resolution := range []string{"480p", "720p", "1080p"} {
				require.Len(t, quote.Prices[resolution], 15)
				for _, duration := range []int{1, 8, 15} {
					err = svc.RecordUsage(context.Background(), &OpenAIRecordUsageInput{
						Result: &OpenAIForwardResult{RequestID: "quote", Model: "grok-imagine-video-1.5", VideoCount: 1, VideoResolution: resolution, VideoDurationSeconds: duration},
						APIKey: key, User: &User{ID: 3}, Account: &Account{ID: 4, Platform: PlatformGrok},
					})
					require.NoError(t, err)
					require.InDelta(t, quote.Prices[resolution][duration-1], repo.lastLog.ActualCost, 1e-12)
				}
			}
		})
	}
}

func TestCreatorVideoPricingPreservesChannelPerRequestPricing(t *testing.T) {
	svc := newOpenAIRecordUsageServiceForTest(&openAIRecordUsageLogRepoStub{}, &openAIRecordUsageUserRepoStub{}, &openAIRecordUsageSubRepoStub{}, nil)
	svc.resolver = newOpenAIImageChannelPricingResolverForTest(t, 2, "grok-imagine-video", 0.2)
	key := &APIKey{GroupID: i64p(2), Group: &Group{ID: 2, Platform: PlatformGrok, RateMultiplier: 1}}
	quote, err := svc.CreatorVideoPricing(context.Background(), key, 3, "grok-imagine-video")
	require.NoError(t, err)
	for _, duration := range []int{1, 8, 15} {
		require.InDelta(t, 0.2, quote.Prices["720p"][duration-1], 1e-12)
	}
}
