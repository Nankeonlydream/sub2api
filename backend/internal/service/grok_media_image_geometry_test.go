package service

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
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
	require.Equal(t, "16:9", info.AspectRatio)
	require.Equal(t, VideoBillingResolution480P, info.Resolution)
}

func TestGrokImagineAspectRatioFromSize(t *testing.T) {
	t.Parallel()
	require.Equal(t, "1:1", grokImagineAspectRatioFromSize("1024x1024"))
	require.Equal(t, "3:4", grokImagineAspectRatioFromSize("1152x1536"))
	require.Equal(t, "4:3", grokImagineAspectRatioFromSize("1536x1152"))
	require.Equal(t, "16:9", grokImagineAspectRatioFromSize("1792x1024"))
}

func TestParseGrokMediaImageResolutionForBilling(t *testing.T) {
	for _, tier := range []string{"1k", "2k"} {
		for _, multipartBody := range []bool{false, true} {
			body := []byte(`{"model":"grok-imagine-image-2.0","resolution":"` + tier + `","aspect_ratio":"16:9"}`)
			contentType := "application/json"
			if multipartBody {
				var buffer bytes.Buffer
				writer := multipart.NewWriter(&buffer)
				require.NoError(t, writer.WriteField("model", "grok-imagine-image-2.0"))
				require.NoError(t, writer.WriteField("resolution", tier))
				require.NoError(t, writer.Close())
				body, contentType = buffer.Bytes(), writer.FormDataContentType()
			}
			info := ParseGrokMediaRequest(contentType, body)
			require.Equal(t, tier, info.ImageResolution)
			require.Equal(t, strings.ToUpper(tier), info.Size)
			require.Equal(t, strings.ToUpper(tier), info.SizeTier)
			// OpenAI-compatible accounts parse the same native xAI body before
			// forwarding it. This path must not default back to 2K either.
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/generations", bytes.NewReader(body))
			c.Request.Header.Set("Content-Type", contentType)
			parsed, err := (&OpenAIGatewayService{}).ParseOpenAIImagesRequest(c, body)
			require.NoError(t, err)
			require.Equal(t, strings.ToUpper(tier), parsed.Size)
			require.Equal(t, strings.ToUpper(tier), parsed.SizeTier)
			metadata := grokMediaUsageFromResponse(GrokMediaEndpointImagesGenerations, info, []byte(`{"data":[{"url":"https://example.test/image.png"}]}`))
			result := &OpenAIForwardResult{ImageCount: metadata.ImageCount, ImageSize: metadata.ImageSize, ImageInputSize: metadata.ImageInputSize}
			ApplyOpenAIImageBillingResolution(result)
			require.Equal(t, strings.ToUpper(tier), result.ImageSize)
			require.Equal(t, ImageSizeSourceInput, result.ImageSizeSource)
		}
	}
}
