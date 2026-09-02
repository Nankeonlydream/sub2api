package service

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestApplyGrokImagineImageGeometryMapsOpenAISize(t *testing.T) {
	t.Parallel()

	out, err := applyGrokImagineImageGeometry([]byte(`{"model":"grok-imagine-image-2.0","prompt":"hi","size":"1152x1536"}`))
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(out, "size").Exists())
	require.Equal(t, "2k", gjson.GetBytes(out, "resolution").String())
	require.Equal(t, "3:4", gjson.GetBytes(out, "aspect_ratio").String())
}

func TestApplyGrokImagineImageGeometryKeepsClientGeometry(t *testing.T) {
	t.Parallel()

	out, err := applyGrokImagineImageGeometry([]byte(`{"size":"1024x1024","resolution":"2K","aspect_ratio":"16:9"}`))
	require.NoError(t, err)
	require.False(t, gjson.GetBytes(out, "size").Exists())
	require.Equal(t, "2k", gjson.GetBytes(out, "resolution").String())
	require.Equal(t, "16:9", gjson.GetBytes(out, "aspect_ratio").String())
}

func TestSanitizeGrokMediaForwardBodyConvertsImageSize(t *testing.T) {
	t.Parallel()

	out, contentType, err := sanitizeGrokMediaForwardBody(
		GrokMediaEndpointImagesGenerations,
		[]byte(`{"model":"grok-imagine-image","prompt":"hi","size":"1024x1024"}`),
		"application/json",
	)
	require.NoError(t, err)
	require.Equal(t, "application/json", contentType)
	require.False(t, gjson.GetBytes(out, "size").Exists())
	require.Equal(t, "1k", gjson.GetBytes(out, "resolution").String())
	require.Equal(t, "1:1", gjson.GetBytes(out, "aspect_ratio").String())
}

func TestParseGrokMediaRequestKeepsImageResolutionOutOfVideoNormalize(t *testing.T) {
	t.Parallel()

	info := ParseGrokMediaRequest("application/json", []byte(`{"model":"grok-imagine-image-2.0","resolution":"2K","aspect_ratio":"16:9"}`))
	require.Equal(t, "2k", info.ImageResolution)
	require.Equal(t, ImageBillingSize2K, info.SizeTier)
	require.Equal(t, "2k", info.imageBillingInputSize())
	require.True(t, info.hasAuthoritativeImageBillingInput())
	require.Equal(t, "16:9", info.AspectRatio)
	require.Equal(t, VideoBillingResolution480P, info.Resolution)
}

func TestGrokMediaImageBillingUsesExplicitResolution(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name            string
		resolution      string
		outputSize      string
		wantBillingSize string
	}{
		{name: "selected 1K ignores larger response metadata", resolution: "1K", outputSize: "2048x2048", wantBillingSize: ImageBillingSize1K},
		{name: "selected 2K ignores smaller response metadata", resolution: "2K", outputSize: "1024x1024", wantBillingSize: ImageBillingSize2K},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			requestInfo := ParseGrokMediaRequest(
				"application/json",
				[]byte(`{"model":"grok-imagine-image-2.0","resolution":"`+tt.resolution+`","aspect_ratio":"1:1"}`),
			)
			meta := grokMediaUsageFromResponse(
				GrokMediaEndpointImagesGenerations,
				requestInfo,
				[]byte(`{"data":[{"url":"https://images.test/result.png","size":"`+tt.outputSize+`"}]}`),
			)
			result := &OpenAIForwardResult{
				ImageCount:                  meta.ImageCount,
				ImageSize:                   meta.ImageSize,
				ImageInputSize:              meta.ImageInputSize,
				ImageOutputSizes:            meta.ImageOutputSizes,
				ImageInputSizeAuthoritative: meta.ImageInputSizeAuthoritative,
			}

			ApplyOpenAIImageBillingResolution(result)

			require.Equal(t, tt.wantBillingSize, result.ImageSize)
			require.Equal(t, strings.ToLower(tt.resolution), result.ImageInputSize)
			require.Equal(t, tt.outputSize, result.ImageOutputSize)
			require.Equal(t, ImageSizeSourceInput, result.ImageSizeSource)
		})
	}
}

func TestGrokImagineAspectRatioFromSize(t *testing.T) {
	t.Parallel()
	require.Equal(t, "1:1", grokImagineAspectRatioFromSize("1024x1024"))
	require.Equal(t, "3:4", grokImagineAspectRatioFromSize("1152x1536"))
	require.Equal(t, "4:3", grokImagineAspectRatioFromSize("1536x1152"))
	require.Equal(t, "16:9", grokImagineAspectRatioFromSize("1792x1024"))
}
