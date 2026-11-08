-- Creator build: native Grok and Seedance Ark video tasks settle in the
-- background on upstream success, independently of client polling and Redis.
-- A separate table keeps older binaries (which only read
-- relay_video_settlements) unaffected when rolled back.
-- No credentials, prompts or output URLs belong in the payload.
CREATE TABLE IF NOT EXISTS native_video_settlements (
    task_id VARCHAR(244) NOT NULL,
    api_key_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    group_id BIGINT NOT NULL,
    kind VARCHAR(16) NOT NULL,
    payload JSONB NOT NULL,
    state VARCHAR(24) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_poll_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 seconds',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (task_id, api_key_id),
    CHECK (kind IN ('grok','ark')),
    CHECK (state IN ('submitting','pending','complete','failed','review'))
);
CREATE INDEX IF NOT EXISTS idx_native_video_settlement_due
    ON native_video_settlements(next_poll_at) WHERE state='pending';
CREATE INDEX IF NOT EXISTS idx_native_video_settlement_submitting
    ON native_video_settlements(created_at) WHERE state='submitting';
CREATE INDEX IF NOT EXISTS idx_native_video_settlement_review
    ON native_video_settlements(completed_at) WHERE state='review';
