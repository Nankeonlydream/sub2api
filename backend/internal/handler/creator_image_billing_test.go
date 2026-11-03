package handler

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestCreatorImageUndelivered(t *testing.T) {
	for _, tc := range []struct {
		name, keyName, header string
		images                int
		cause                 error
		cancel                bool
		want                  bool
	}{
		{name: "client left before delivery", header: "image", images: 1, cancel: true, want: true},
		{name: "Creator key without header", keyName: "创作中心 · Image2", images: 2, cancel: true, want: true},
		{name: "delivered to a connected client", header: "image", images: 1},
		{name: "lost lease keeps the client connected", header: "image", images: 1, cancel: true, cause: service.ErrAPIKeySlotLeaseLost},
		{name: "no image produced", header: "image", cancel: true},
		{name: "video header is not an image request", header: "video", images: 1, cancel: true},
		{name: "regular API still bills", keyName: "Production API", images: 1, cancel: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			ctx, cancel := context.WithCancelCause(context.Background())
			defer cancel(nil)
			c.Request = httptest.NewRequest("POST", "https://local.example/v1/images/generations", nil).WithContext(ctx)
			c.Request.Header.Set("X-Sub2API-Creator", tc.header)
			if tc.cancel {
				cancel(tc.cause)
			}
			require.Equal(t, tc.want, creatorImageUndelivered(c, &service.APIKey{Name: tc.keyName}, tc.images))
		})
	}
	require.False(t, creatorImageUndelivered(nil, nil, 1))
}
