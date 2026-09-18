package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestForwardImagesRequestedSizeDeterminesRecordedBilling(t *testing.T) {
	encoded := encodeOpenAIImageTestPNG(t, 1024, 1024)
	for _, accountType := range []string{AccountTypeAPIKey, AccountTypeOAuth, AccountTypeSetupToken} {
		for _, tc := range []struct {
			size, tier string
			price      float64
		}{
			{"1024x1024", ImageBillingSize1K, 0.11},
			{"1536x2048", ImageBillingSize2K, 0.22},
			{"2496x3312", ImageBillingSize4K, 0.44},
			{"auto", ImageBillingSize1K, 0.11},
		} {
			t.Run(accountType+"/"+tc.size, func(t *testing.T) {
				body := []byte(fmt.Sprintf(`{"model":"gpt-image-2","prompt":"draw","size":%q}`, tc.size))
				c, _ := newOpenAIImagesTestContext(t, body)
				upstream := &httpUpstreamRecorder{resp: &http.Response{
					StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}},
					Body: io.NopCloser(strings.NewReader(fmt.Sprintf(`{"data":[{"b64_json":%q,"size":"1024x1024"}]}`, encoded))),
				}}
				svc := newOpenAIImagesTestService(upstream)
				parsed, err := svc.ParseOpenAIImagesRequest(c, body)
				require.NoError(t, err)
				account := directImagesTestAccount()
				account.Type = accountType
				account.Credentials["api_key"] = "test-key"
				result, err := svc.ForwardImages(context.Background(), c, account, body, parsed, "")
				require.NoError(t, err)
				require.Equal(t, tc.size, gjson.GetBytes(upstream.lastBody, "size").String())
				require.Equal(t, tc.size != "auto", result.ImageInputSizeAuthoritative)
				repo := &openAIRecordUsageLogRepoStub{inserted: true}
				billing := newOpenAIRecordUsageServiceForTest(repo, &openAIRecordUsageUserRepoStub{}, &openAIRecordUsageSubRepoStub{}, nil)
				p1, p2, p4 := 0.11, 0.22, 0.44
				err = billing.RecordUsage(context.Background(), &OpenAIRecordUsageInput{
					Result: result,
					APIKey: &APIKey{ID: 11204, GroupID: i64p(1204), Group: &Group{ID: 1204, RateMultiplier: 1, ImagePrice1K: &p1, ImagePrice2K: &p2, ImagePrice4K: &p4}},
					User:   &User{ID: 21204}, Account: account,
				})
				require.NoError(t, err)
				require.NotNil(t, repo.lastLog)
				require.Equal(t, tc.tier, *repo.lastLog.ImageSize)
				require.Equal(t, tc.size, *repo.lastLog.ImageInputSize)
				require.Equal(t, "1024x1024", *repo.lastLog.ImageOutputSize)
				require.InDelta(t, tc.price, repo.lastLog.ActualCost, 1e-12)
			})
		}
	}
}
