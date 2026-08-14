CREATE TABLE IF NOT EXISTS integration_idempotency (
  client_id TEXT NOT NULL REFERENCES integration_clients(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  route TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'processing',
  status_code INTEGER,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
  PRIMARY KEY (client_id, idempotency_key),
  CHECK (state IN ('processing', 'completed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS integration_idempotency_expiry_idx
  ON integration_idempotency(expires_at);
