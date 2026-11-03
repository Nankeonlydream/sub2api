package handler

import (
	"context"
	"errors"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

// creatorImageUndelivered reports a Creator image that finished upstream after
// the browser left (refresh or closed tab). Image generation keeps running
// detached from the client, so its result never reached the page; like Creator
// videos, it is charged only once delivered. A lost concurrency lease also
// cancels the request context but leaves the client connected, so it still bills.
func creatorImageUndelivered(c *gin.Context, apiKey *service.APIKey, imageCount int) bool {
	if imageCount <= 0 || c == nil || c.Request == nil || !isCreatorRequest(c, apiKey, "image") {
		return false
	}
	ctx := c.Request.Context()
	return ctx.Err() != nil && !errors.Is(context.Cause(ctx), service.ErrAPIKeySlotLeaseLost)
}
