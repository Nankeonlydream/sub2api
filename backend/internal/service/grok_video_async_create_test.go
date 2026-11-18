//go:build unit

package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestDetachAPIKeyAdmissionOwnerOutlivesRequestOwner(t *testing.T) {
	type valueKey struct{}
	request, cancelClient := context.WithCancel(context.WithValue(context.Background(), valueKey{}, "kept"))
	owned, endRequest := WithAPIKeyAdmissionOwner(request)

	detached, endWork := DetachAPIKeyAdmissionOwner(owned)
	upstream, _ := detachAPIKeyUpstreamContext(detached)
	cancelClient()
	endRequest()
	require.NoError(t, detached.Err(), "client and request owner cancel must not stop background work")
	require.NoError(t, upstream.Err(), "the upstream create must survive the HTTP request")
	require.Equal(t, "kept", detached.Value(valueKey{}))
	require.True(t, HasAPIKeyAdmissionOwner(detached), "key slots acquired by the work need an owner")

	endWork()
	require.Error(t, detached.Err())
	require.Error(t, upstream.Err(), "ending the work stops its upstream request")
}

func TestDetachAPIKeyAdmissionOwnerWithoutOwner(t *testing.T) {
	request, cancelClient := context.WithCancel(context.Background())
	detached, endWork := DetachAPIKeyAdmissionOwner(request)
	cancelClient()
	require.NoError(t, detached.Err())
	require.False(t, HasAPIKeyAdmissionOwner(detached), "requests without key admission keep their shape")
	endWork()
	require.Error(t, detached.Err())
}

func TestGrokVideoAsyncCreateRecordHelpers(t *testing.T) {
	id := NewGrokVideoAsyncCreateID()
	require.True(t, IsGrokVideoAsyncCreateID(id))
	require.False(t, IsGrokVideoAsyncCreateID("task"))
	require.Empty(t, grokVideoAsyncCreateKey("task", 1, 2), "upstream IDs never address async records")
	require.NotEqual(t, grokVideoPendingBillingKey(id, 1, 2), grokVideoAsyncCreateKey(id, 1, 2))

	require.JSONEq(t, `{"error":"x"}`, string(TruncateGrokVideoAsyncCreateBody([]byte(`{"error":"x"}`))))
	html := TruncateGrokVideoAsyncCreateBody([]byte("<html>bad gateway</html>"))
	require.True(t, json.Valid(html))
	long := TruncateGrokVideoAsyncCreateBody([]byte(strings.Repeat("a", 3*grokVideoAsyncCreateBodyLimit)))
	require.True(t, json.Valid(long))
	require.LessOrEqual(t, len(long), grokVideoAsyncCreateBodyLimit+2)

	pending := &GrokVideoAsyncCreate{State: GrokVideoAsyncCreatePending, CreatedAt: time.Now()}
	require.False(t, pending.Stale(time.Now()))
	require.True(t, pending.Stale(time.Now().Add(grokVideoAsyncCreateStaleAfter+time.Minute)))
	accepted := &GrokVideoAsyncCreate{State: GrokVideoAsyncCreateAccepted, CreatedAt: time.Now().Add(-time.Hour)}
	require.False(t, accepted.Stale(time.Now()))
}
