-- Preserve full stable task IDs and existing billing deduplication keys.
-- Widening is backward compatible; never truncate IDs or rewrite old receipts.
ALTER TABLE usage_logs ALTER COLUMN request_id TYPE VARCHAR(255);
