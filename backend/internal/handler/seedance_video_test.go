//go:build unit

package handler

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	middleware "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/stretchr/testify/require"
)

func TestSeedanceVideoGroupGateAndLookupOwnership(t *testing.T) {
	for _, scenario := range []string{"disabled", "series disabled", "wrong duration", "accepted", "other key", "lookup owned", "h3 task id", "wrong content type"} {
		t.Run(scenario, func(t *testing.T) {
			h, slots, bindings, upstream := newGrokMediaSlotHandler(t, false, false, service.PlatformDeepseek)
			c, w := grokMediaSlotContext(context.Background(), true)
			key, _ := middleware.GetAPIKeyFromContext(c)
			key.Group.Platform = service.PlatformDeepseek
			key.Group.AllowImageGeneration = false // video has its own switch
			key.Group.VideoModelPrices = map[string]map[string]float64{service.SeedanceVideoPriceFamily: {"ttsedanco2.0-480": 0.15}}
			key.Group.RateMultiplier = 0.5
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(`{"model":"ttsedanco2.0-480","prompt":"waves","seconds":8}`))
			c.Request.Header.Set("Content-Type", "application/json")
			upstream.call = func(req *http.Request, _ int64) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"id":"task","task_id":"task","status":"queued"}`))}, nil
			}
			want, calls := http.StatusOK, 1
			switch scenario {
			case "disabled":
				key.Group.VideoModelPrices = nil
				want, calls = http.StatusBadRequest, 0
			case "series disabled":
				key.Group.VideoModelPrices[service.SeedanceVideoPriceFamily] = map[string]float64{"ttsedanco2.0-720": 0.25}
				want, calls = http.StatusBadRequest, 0
			case "wrong duration":
				c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(`{"model":"ttsedanco2.0-480","prompt":"waves","seconds":16}`))
				c.Request.Header.Set("Content-Type", "application/json")
				want, calls = http.StatusBadRequest, 0
			case "wrong content type":
				c.Request.Header.Set("Content-Type", "multipart/form-data")
				want, calls = http.StatusUnsupportedMediaType, 0
			case "other key", "lookup owned", "h3 task id":
				bound := service.SeedanceVideoTaskKey("task")
				if scenario == "h3 task id" {
					bound = service.MiniMaxH3TaskKey("task")
				}
				require.NoError(t, h.gatewayService.BindGrokMediaVideoRequestAccount(context.Background(), key.GroupID, bound, 10, 20, 1))
				c.Request = httptest.NewRequest(http.MethodGet, "/v1/videos/task", nil)
				if scenario == "other key" {
					key.ID++
				}
				if scenario != "lookup owned" {
					want, calls = http.StatusNotFound, 0
				}
			}
			h.SeedanceVideos(c)
			require.Equal(t, want, w.Code, w.Body.String())
			require.Equal(t, calls, upstream.calls)
			slots.assertReleased(t)
			if scenario == "accepted" {
				pending, err := h.gatewayService.LoadGrokVideoPendingBilling(context.Background(), service.SeedanceVideoTaskKey("task"), 10, 20)
				require.NoError(t, err)
				require.NotNil(t, pending)
				require.InDelta(t, 1.2, *pending.MiniMaxH3BaseCost, 1e-9)
				require.Equal(t, 8, pending.VideoDurationSeconds)
				require.Equal(t, "480p", pending.VideoResolution)
				require.Greater(t, bindings.writes, 0)
			}
		})
	}
}
