CREATE TABLE IF NOT EXISTS admin_provider_snapshots (
  provider TEXT PRIMARY KEY,
  payload_json JSONB,
  fetched_at TIMESTAMPTZ,
  retry_after_at TIMESTAMPTZ,
  last_status_code INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
