CREATE TABLE IF NOT EXISTS workflow_priority_assessments (
  workflow_request_id TEXT PRIMARY KEY REFERENCES workflow_requests(id) ON DELETE CASCADE,
  policy_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  priority_level TEXT NOT NULL CHECK (priority_level IN ('P1','P2','P3','P4')),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  factors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_hash TEXT NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_priority_assessments_level
  ON workflow_priority_assessments(priority_level, score DESC, evaluated_at DESC);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS business_criticality TEXT NOT NULL DEFAULT 'standard'
  CHECK (business_criticality IN ('standard','important','critical'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS delivery_impact TEXT;

UPDATE projects SET business_criticality='critical', delivery_impact='Customer delivery and production continuity'
WHERE code IN ('PLATFORM-CLOUD','GTM-ENTERPRISE') AND business_criticality='standard';
UPDATE projects SET business_criticality='important', delivery_impact='Quarterly product and operating commitments'
WHERE business_criticality='standard' AND LOWER(status)='active';

UPDATE employees SET employment_status='Pending start', updated_at=CURRENT_TIMESTAMP
WHERE LOWER(employment_status)='preboarding';
