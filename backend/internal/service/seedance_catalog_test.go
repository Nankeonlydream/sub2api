//go:build unit

package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func customSeedanceCatalog(t *testing.T, entries ...SeedanceCatalogEntry) {
	t.Helper()
	normalized, err := NormalizeSeedanceCatalog(entries)
	require.NoError(t, err)
	applySeedanceCatalog(normalized)
	t.Cleanup(func() { applySeedanceCatalog(nil) })
}

func TestSeedanceCatalogReplacesBuiltInModels(t *testing.T) {
	require.True(t, IsSeedanceVideoModel("00sd2.0"))

	customSeedanceCatalog(t, SeedanceCatalogEntry{
		Model: " New-Model ", Name: "新模型", Resolution: "720p", MinSeconds: 4, MaxSeconds: 12, PerRequest: true,
	})

	require.True(t, IsSeedanceVideoModel("new-model"))
	require.False(t, IsSeedanceVideoModel("00sd2.0"), "a model missing from the saved catalog is no longer sold")

	prices := map[string]map[string]float64{SeedanceVideoPriceFamily: {"new-model": 2}}
	total, err := QuoteSeedanceVideo(prices, "NEW-MODEL", 8)
	require.NoError(t, err)
	require.Equal(t, 2.0, total, "per-request models charge once")
	_, err = QuoteSeedanceVideo(prices, "new-model", 13)
	require.Error(t, err)

	applySeedanceCatalog(nil)
	require.True(t, IsSeedanceVideoModel("00sd2.0"))
	require.False(t, IsSeedanceVideoModel("new-model"))
}

func TestSeedanceCatalogPerSecondBilling(t *testing.T) {
	customSeedanceCatalog(t, SeedanceCatalogEntry{Model: "per-sec", Resolution: "480p", MinSeconds: 5, MaxSeconds: 15})
	total, err := QuoteSeedanceVideo(map[string]map[string]float64{SeedanceVideoPriceFamily: {"per-sec": 0.3}}, "per-sec", 10)
	require.NoError(t, err)
	require.InDelta(t, 3.0, total, 1e-9)
}

func TestNormalizeSeedanceCatalog(t *testing.T) {
	valid := SeedanceCatalogEntry{Model: "m1", Resolution: "720p", MinSeconds: 5, MaxSeconds: 15}

	t.Run("allowed seconds derive the range and compact to a range when gapless", func(t *testing.T) {
		out, err := NormalizeSeedanceCatalog([]SeedanceCatalogEntry{
			{Model: "gaps", Resolution: "720p", AllowedSeconds: []int{15, 5, 10, 10}},
			{Model: "gapless", Resolution: "720p", AllowedSeconds: []int{6, 5, 7}},
		})
		require.NoError(t, err)
		require.Equal(t, []int{5, 10, 15}, out[0].AllowedSeconds)
		require.Equal(t, 5, out[0].MinSeconds)
		require.Equal(t, 15, out[0].MaxSeconds)
		require.Nil(t, out[1].AllowedSeconds)
		require.Equal(t, 5, out[1].MinSeconds)
		require.Equal(t, 7, out[1].MaxSeconds)
	})

	t.Run("resolution is canonicalized", func(t *testing.T) {
		entry := valid
		entry.Resolution = "720P"
		out, err := NormalizeSeedanceCatalog([]SeedanceCatalogEntry{entry})
		require.NoError(t, err)
		require.Equal(t, "720p", out[0].Resolution)
	})

	rejected := map[string][]SeedanceCatalogEntry{
		"empty catalog":      {},
		"blank model":        {{Model: "  ", Resolution: "720p", MinSeconds: 5, MaxSeconds: 15}},
		"model with space":   {{Model: "a b", Resolution: "720p", MinSeconds: 5, MaxSeconds: 15}},
		"duplicate model":    {valid, {Model: "M1", Resolution: "480p", MinSeconds: 5, MaxSeconds: 15}},
		"unknown resolution": {{Model: "m2", Resolution: "4k", MinSeconds: 5, MaxSeconds: 15}},
		"inverted range":     {{Model: "m2", Resolution: "720p", MinSeconds: 15, MaxSeconds: 5}},
		"zero seconds":       {{Model: "m2", Resolution: "720p"}},
		"too long":           {{Model: "m2", Resolution: "720p", MinSeconds: 5, MaxSeconds: 500}},
		"negative reference": {{Model: "m2", Resolution: "720p", MinSeconds: 5, MaxSeconds: 15, MaxReferenceImages: -1}},
		"too many reference": {{Model: "m2", Resolution: "720p", MinSeconds: 5, MaxSeconds: 15, MaxReferenceImages: 101}},
	}
	for name, entries := range rejected {
		t.Run("rejects "+name, func(t *testing.T) {
			_, err := NormalizeSeedanceCatalog(entries)
			require.Error(t, err)
		})
	}
}

func TestCurrentSeedanceCatalogReportsCustomization(t *testing.T) {
	require.False(t, CurrentSeedanceCatalog().Customized)
	customSeedanceCatalog(t, SeedanceCatalogEntry{Model: "m1", Resolution: "720p", MinSeconds: 5, MaxSeconds: 15})
	state := CurrentSeedanceCatalog()
	require.True(t, state.Customized)
	require.Len(t, state.Entries, 1)
}
