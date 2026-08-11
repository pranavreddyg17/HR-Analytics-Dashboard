CREATE TABLE IF NOT EXISTS integration_clients (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('active', 'revoked'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS integration_clients_org_status_idx
  ON integration_clients(organization_id, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS integration_api_audit (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES integration_clients(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  actor_email TEXT NOT NULL,
  method TEXT NOT NULL,
  route TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS integration_api_audit_client_created_idx
  ON integration_api_audit(client_id, created_at DESC);
