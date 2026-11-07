-- Retain accepted video jobs independently of Redis and client polling.
-- No credentials, prompts or output URLs belong in the billing snapshot.
CREATE TABLE IF NOT EXISTS relay_video_settlements (
    task_id VARCHAR(244) NOT NULL,
    api_key_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    account_id BIGINT NOT NULL,
    payload JSONB NOT NULL,
    bill_on_content BOOLEAN NOT NULL DEFAULT FALSE,
    state VARCHAR(24) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_poll_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 seconds',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (task_id, api_key_id),
    CHECK (state IN ('submitting','pending','complete','failed','review'))
);
CREATE INDEX IF NOT EXISTS idx_relay_video_settlement_due
    ON relay_video_settlements(next_poll_at) WHERE state='pending' AND NOT bill_on_content;
