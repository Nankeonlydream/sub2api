package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// A native Grok video create normally answers with the upstream task ID. Some
// upstreams only answer after minutes, past CDN read timeouts. The gateway then
// answers with its own task ID while the same create finishes in the background.
//
// The record below only maps that gateway ID to the create outcome. Billing is
// untouched: it stays keyed by the upstream task ID, written by the unchanged
// create path, and status/content lookups are translated to that ID before any
// billing code runs.

const (
	GrokVideoAsyncCreateIDPrefix = "cbvtask_"

	GrokVideoAsyncCreatePending  = "pending"
	GrokVideoAsyncCreateAccepted = "accepted"
	GrokVideoAsyncCreateFailed   = "failed"

	// The background create runs to completion (generic 600s header timeout).
	// A pending record older than this lost its submitter (process restart).
	grokVideoAsyncCreateStaleAfter = 20 * time.Minute
	grokVideoAsyncCreateBodyLimit  = 4096
)

// GrokVideoAsyncCreate is the outcome of one background create.
type GrokVideoAsyncCreate struct {
	State      string          `json:"state"`
	UpstreamID string          `json:"upstream_id,omitempty"`
	StatusCode int             `json:"status_code,omitempty"`
	Body       json.RawMessage `json:"body,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
}

// NewGrokVideoAsyncCreateID returns a gateway task ID that can never collide
// with an upstream ID routed through the same lookup endpoints.
func NewGrokVideoAsyncCreateID() string {
	return GrokVideoAsyncCreateIDPrefix + strings.ReplaceAll(uuid.NewString(), "-", "")
}

func IsGrokVideoAsyncCreateID(id string) bool {
	return strings.HasPrefix(strings.TrimSpace(id), GrokVideoAsyncCreateIDPrefix)
}

// Stale reports a pending record whose background submitter is gone.
func (r *GrokVideoAsyncCreate) Stale(now time.Time) bool {
	return r != nil && r.State == GrokVideoAsyncCreatePending && !r.CreatedAt.IsZero() &&
		now.Sub(r.CreatedAt) > grokVideoAsyncCreateStaleAfter
}

// TruncateGrokVideoAsyncCreateBody keeps a failure body small; a non-JSON or
// truncated body is replaced by a JSON string so the record stays valid.
func TruncateGrokVideoAsyncCreateBody(body []byte) json.RawMessage {
	if len(body) == 0 {
		return nil
	}
	if len(body) <= grokVideoAsyncCreateBodyLimit && json.Valid(body) {
		return json.RawMessage(append([]byte(nil), body...))
	}
	text := string(body)
	if len(text) > grokVideoAsyncCreateBodyLimit {
		text = text[:grokVideoAsyncCreateBodyLimit]
	}
	encoded, _ := json.Marshal(strings.ToValidUTF8(text, ""))
	return encoded
}

// The prefix keeps these records out of the pending-billing namespace: a
// gateway ID must never load as a billing snapshot.
func grokVideoAsyncCreateKey(id string, userID, apiKeyID int64) string {
	if !IsGrokVideoAsyncCreateID(id) {
		return ""
	}
	return grokVideoPendingBillingKey("async-create:"+strings.TrimSpace(id), userID, apiKeyID)
}

func (s *OpenAIGatewayService) HasGrokVideoAsyncCreateStore() bool {
	return s != nil && s.cache != nil
}

// GrokVideoAsyncCreateWait is how long a create waits before answering with a
// gateway task ID; zero disables it.
func (s *OpenAIGatewayService) GrokVideoAsyncCreateWait() time.Duration {
	if s == nil || s.cfg == nil || s.cfg.Gateway.GrokVideoAsyncCreateWaitSeconds <= 0 {
		return 0
	}
	return time.Duration(s.cfg.Gateway.GrokVideoAsyncCreateWaitSeconds) * time.Second
}

func (s *OpenAIGatewayService) StoreGrokVideoAsyncCreate(ctx context.Context, id string, userID, apiKeyID int64, record GrokVideoAsyncCreate) error {
	if !s.HasGrokVideoAsyncCreateStore() {
		return errors.New("grok video async create store is unavailable")
	}
	key := grokVideoAsyncCreateKey(id, userID, apiKeyID)
	if key == "" {
		return errors.New("grok video async create key is invalid")
	}
	payload, err := json.Marshal(record)
	if err != nil {
		return err
	}
	return s.cache.SetGrokVideoPendingBilling(ctx, key, payload, grokVideoPendingBillingTTL(s.cfg))
}

// LoadGrokVideoAsyncCreate returns nil, nil when the ID is unknown to this key.
func (s *OpenAIGatewayService) LoadGrokVideoAsyncCreate(ctx context.Context, id string, userID, apiKeyID int64) (*GrokVideoAsyncCreate, error) {
	if !s.HasGrokVideoAsyncCreateStore() {
		return nil, errors.New("grok video async create store is unavailable")
	}
	key := grokVideoAsyncCreateKey(id, userID, apiKeyID)
	if key == "" {
		return nil, nil
	}
	payload, err := s.cache.GetGrokVideoPendingBilling(ctx, key)
	if err != nil || len(payload) == 0 {
		return nil, err
	}
	var record GrokVideoAsyncCreate
	if err := json.Unmarshal(payload, &record); err != nil {
		return nil, fmt.Errorf("decode grok video async create: %w", err)
	}
	return &record, nil
}

// ExtractGrokVideoCreateTaskID reads the upstream task ID of a create response.
func ExtractGrokVideoCreateTaskID(body []byte) string {
	return extractGrokMediaVideoRequestID(body)
}
