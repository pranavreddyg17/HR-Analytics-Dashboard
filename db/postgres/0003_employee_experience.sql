CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO organizations(id, name, slug)
VALUES ('org:laidbackhr', 'LaidbackHR', 'laidbackhr')
ON CONFLICT(id) DO NOTHING;
--> statement-breakpoint
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS employee_id TEXT REFERENCES employees(employee_id);
--> statement-breakpoint
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) DEFAULT 'org:laidbackhr';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS app_users_employee_idx ON app_users(employee_id) WHERE employee_id IS NOT NULL;
--> statement-breakpoint
UPDATE app_users u
SET employee_id = e.employee_id
FROM employees e
WHERE u.employee_id IS NULL AND LOWER(u.email) = LOWER(e.work_email);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS employee_compensation (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(employee_id),
  annual_salary NUMERIC(14,2) NOT NULL CHECK (annual_salary >= 0),
  currency CHAR(3) NOT NULL,
  pay_frequency TEXT NOT NULL CHECK (pay_frequency IN ('annual', 'monthly', 'biweekly', 'weekly', 'hourly')),
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS employee_compensation_current_idx
  ON employee_compensation(employee_id) WHERE effective_to IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  client_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'on_hold', 'completed', 'cancelled')),
  manager_employee_id TEXT REFERENCES employees(employee_id),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS employee_project_assignments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(employee_id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  role_title TEXT NOT NULL,
  allocation_percent NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (allocation_percent > 0 AND allocation_percent <= 100),
  starts_on DATE NOT NULL,
  ends_on DATE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  UNIQUE(employee_id, project_id, starts_on)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS employee_project_assignment_employee_idx
  ON employee_project_assignments(employee_id, ends_on, starts_on);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(employee_id),
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  blob_name TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  visibility TEXT NOT NULL DEFAULT 'hr' CHECK (visibility IN ('employee', 'manager', 'hr')),
  uploaded_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS employee_documents_employee_created_idx
  ON employee_documents(employee_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS expense_claims (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(employee_id),
  category TEXT NOT NULL CHECK (category IN ('travel', 'meals', 'office', 'training', 'wellness', 'other')),
  expense_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'needs_information', 'approved', 'rejected', 'paid', 'cancelled')),
  receipt_document_id TEXT REFERENCES employee_documents(id),
  submitted_at TIMESTAMPTZ,
  reviewed_by_email TEXT,
  reviewed_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS expense_claims_employee_status_idx
  ON expense_claims(employee_id, status, submitted_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS employee_cases (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(employee_id),
  category TEXT NOT NULL CHECK (category IN ('payroll', 'benefits', 'workplace', 'equipment', 'access', 'policy', 'other')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  confidentiality TEXT NOT NULL DEFAULT 'hr' CHECK (confidentiality IN ('manager', 'hr', 'restricted')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_for_employee', 'resolved', 'closed')),
  assigned_to_email TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS employee_cases_employee_status_idx
  ON employee_cases(employee_id, status, submitted_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS review_cycles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'calibration', 'closed')),
  created_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_on >= starts_on)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS performance_reviews (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES review_cycles(id),
  employee_id TEXT NOT NULL REFERENCES employees(employee_id),
  manager_employee_id TEXT REFERENCES employees(employee_id),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'self_review', 'manager_review', 'calibration', 'completed')),
  self_review TEXT,
  manager_review TEXT,
  employee_rating NUMERIC(3,2) CHECK (employee_rating BETWEEN 1 AND 5),
  manager_rating NUMERIC(3,2) CHECK (manager_rating BETWEEN 1 AND 5),
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cycle_id, employee_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS performance_reviews_employee_status_idx
  ON performance_reviews(employee_id, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS one_on_one_meetings (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(employee_id),
  manager_employee_id TEXT REFERENCES employees(employee_id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  held_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  employee_notes TEXT,
  manager_notes TEXT,
  transcript_document_id TEXT REFERENCES employee_documents(id),
  ai_summary TEXT,
  next_steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_approved_by_email TEXT,
  summary_approved_at TIMESTAMPTZ,
  follow_up_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS one_on_one_employee_scheduled_idx
  ON one_on_one_meetings(employee_id, scheduled_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  conversation_id TEXT,
  objective TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'awaiting_approval')),
  provider TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  error_code TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_runs_actor_started_idx ON agent_runs(actor_email, started_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL CHECK (step_number > 0),
  tool_name TEXT NOT NULL,
  input_json JSONB NOT NULL,
  output_summary TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'awaiting_approval')),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id, step_number)
);
