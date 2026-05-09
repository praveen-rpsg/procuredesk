-- Migration 000003: Idempotency key table for safe API retries
-- Prevents duplicate creation of cases, exports, and imports on network retries.
-- TTL: 24 hours. Clean up old rows via a scheduled pg_cron job or the worker.

CREATE TABLE IF NOT EXISTS ops.idempotent_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  idempotency_key text        NOT NULL,
  status_code     int         NOT NULL,
  response_body   text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Enforce uniqueness per tenant + key within the TTL window
CREATE UNIQUE INDEX IF NOT EXISTS idempotent_requests_tenant_key_uidx
  ON ops.idempotent_requests (tenant_id, idempotency_key);

-- Index for TTL cleanup queries
CREATE INDEX IF NOT EXISTS idempotent_requests_created_at_idx
  ON ops.idempotent_requests (created_at);

-- Automatically purge requests older than 24 hours.
-- Run this periodically (e.g., via pg_cron or a worker cron job):
--   DELETE FROM ops.idempotent_requests WHERE created_at < now() - interval '24 hours';
