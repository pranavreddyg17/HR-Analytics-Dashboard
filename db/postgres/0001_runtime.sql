CREATE TABLE IF NOT EXISTS employees (
  employee_id TEXT PRIMARY KEY, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '',
  preferred_name TEXT, work_email TEXT, phone TEXT, department TEXT NOT NULL, job_title TEXT NOT NULL,
  location TEXT NOT NULL, manager TEXT NOT NULL, manager_id TEXT, hire_date TEXT NOT NULL,
  employment_type TEXT NOT NULL DEFAULT 'Full-time', employment_status TEXT NOT NULL,
  tenure_years DOUBLE PRECISION NOT NULL DEFAULT 0, data_source TEXT NOT NULL DEFAULT 'imported',
  archived_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS employees_department_idx ON employees(department);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS employees_status_idx ON employees(employment_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS employees_work_email_idx ON employees(work_email);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS employee_activity (
  id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, event_type TEXT NOT NULL, summary TEXT NOT NULL,
  changes_json TEXT, actor_email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS employee_activity_employee_idx ON employee_activity(employee_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS workspace_settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS hiring_records (
  id TEXT PRIMARY KEY, position TEXT NOT NULL, department TEXT NOT NULL, application_date TEXT NOT NULL,
  hiring_date TEXT, hiring_source TEXT NOT NULL, time_to_hire_days INTEGER, recruitment_status TEXT NOT NULL,
  location TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hiring_department_status_idx ON hiring_records(department, recruitment_status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS hiring_candidates (
  id TEXT PRIMARY KEY, requisition_id TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'Applied', source TEXT NOT NULL, applied_at TEXT NOT NULL,
  owner_email TEXT NOT NULL, next_step TEXT NOT NULL, next_step_due_at TEXT, notes TEXT,
  rejected_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(requisition_id, email)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hiring_candidates_requisition_stage_idx ON hiring_candidates(requisition_id, stage);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS hiring_activity (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, requisition_id TEXT NOT NULL,
  action TEXT NOT NULL, from_status TEXT, to_status TEXT, detail TEXT NOT NULL, actor_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS attrition_events (
  id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, exit_date TEXT NOT NULL, exit_reason TEXT NOT NULL,
  exit_type TEXT NOT NULL, department TEXT NOT NULL, tenure_years DOUBLE PRECISION NOT NULL,
  data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS attrition_department_date_idx ON attrition_events(department, exit_date);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS attrition_model_profiles (
  employee_id TEXT PRIMARY KEY, observed_attrition TEXT NOT NULL, risk_score DOUBLE PRECISION NOT NULL,
  risk_level TEXT NOT NULL, top_driver TEXT NOT NULL, monthly_income DOUBLE PRECISION NOT NULL,
  distance_from_home INTEGER NOT NULL, education_level INTEGER NOT NULL, education_field TEXT NOT NULL,
  environment_satisfaction INTEGER NOT NULL, job_satisfaction INTEGER NOT NULL, prior_companies INTEGER NOT NULL,
  work_life_balance INTEGER NOT NULL, years_at_company DOUBLE PRECISION NOT NULL, model_version TEXT NOT NULL,
  data_source TEXT NOT NULL DEFAULT 'demo', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS attrition_model_risk_idx ON attrition_model_profiles(risk_level, risk_score);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS leave_records (
  id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, leave_type TEXT NOT NULL, start_date TEXT NOT NULL,
  end_date TEXT NOT NULL, leave_days DOUBLE PRECISION NOT NULL, approval_status TEXT NOT NULL,
  department TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS leave_employee_dates_idx ON leave_records(employee_id, start_date, end_date);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS training_records (
  id TEXT PRIMARY KEY, training_program TEXT NOT NULL, employee_id TEXT NOT NULL, completion_status TEXT NOT NULL,
  completion_date TEXT, training_hours DOUBLE PRECISION NOT NULL, assessment_score DOUBLE PRECISION,
  department TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS promotion_records (
  id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, previous_title TEXT NOT NULL, new_title TEXT NOT NULL,
  promotion_date TEXT NOT NULL, department TEXT NOT NULL, months_since_previous_promotion INTEGER NOT NULL,
  data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS data_imports (
  id TEXT PRIMARY KEY, domain TEXT NOT NULL, filename TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'merge',
  total_rows INTEGER NOT NULL DEFAULT 0, row_count INTEGER NOT NULL, inserted_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0, deleted_rows INTEGER NOT NULL DEFAULT 0, error_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT, imported_by_email TEXT, status TEXT NOT NULL, completed_at TEXT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS data_import_rows (
  job_id TEXT NOT NULL, row_key TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(job_id, row_key)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS workflow_requests (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, employee_id TEXT, title TEXT NOT NULL, status TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}', requested_by_email TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium',
  owner_email TEXT, due_at TEXT, next_action TEXT, source_entity_type TEXT, source_entity_id TEXT, assigned_at TEXT,
  blocked_reason TEXT, confidentiality_level TEXT NOT NULL DEFAULT 'internal', resolved_by_email TEXT,
  resolved_at TEXT, completed_at TEXT, completion_notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS workflow_owner_status_idx ON workflow_requests(owner_email, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS workflow_due_status_idx ON workflow_requests(due_at, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_workflow_drafts (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ready',
  employee_ids_json TEXT NOT NULL DEFAULT '[]', details_json TEXT NOT NULL DEFAULT '{}', created_by_email TEXT NOT NULL,
  opened_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY, user_email TEXT NOT NULL, title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_conversation_messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, position INTEGER NOT NULL, role TEXT NOT NULL,
  content TEXT NOT NULL, tools_json TEXT, context_json TEXT, data_mode TEXT, provider TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(conversation_id, position)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS app_users (
  email TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active', invited_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS access_audit (
  id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, action TEXT NOT NULL, target_email TEXT NOT NULL,
  details_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS learning_courses (
  id TEXT PRIMARY KEY, code TEXT UNIQUE, title TEXT NOT NULL UNIQUE,
  default_duration_hours DOUBLE PRECISION NOT NULL DEFAULT 0, is_mandatory INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS course_assignments (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES learning_courses(id), employee_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, due_date TEXT, status TEXT NOT NULL, completed_at TEXT,
  assessment_score DOUBLE PRECISION, assigned_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS course_assignments_employee_status_idx ON course_assignments(employee_id, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY, model_name TEXT NOT NULL, algorithm TEXT, review_threshold DOUBLE PRECISION,
  evaluation_window_days INTEGER, metrics_json TEXT, intended_use TEXT, prohibited_use TEXT, trained_at TEXT,
  status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE OR REPLACE VIEW employee_directory_view AS
SELECT e.employee_id, e.first_name, e.last_name, e.preferred_name, e.work_email, e.phone,
  e.department, e.job_title, e.location, e.manager, e.manager_id, e.hire_date,
  e.employment_type, e.employment_status,
  ROUND(GREATEST(0, (CURRENT_DATE - e.hire_date::date) / 365.25)::numeric, 1)::double precision AS tenure_years,
  e.data_source, e.archived_at, e.version, e.created_at, e.updated_at
FROM employees e;
--> statement-breakpoint
CREATE OR REPLACE VIEW hiring_requisitions_view AS SELECT * FROM hiring_records;
--> statement-breakpoint
CREATE OR REPLACE VIEW candidate_applications_view AS SELECT * FROM hiring_candidates;
--> statement-breakpoint
CREATE OR REPLACE VIEW leave_requests_view AS SELECT * FROM leave_records;
--> statement-breakpoint
CREATE OR REPLACE VIEW learning_assignments_view AS
SELECT t.id, t.training_program, t.employee_id, t.completion_status, t.completion_date,
  t.training_hours, t.assessment_score, t.department, t.data_source, t.updated_at
FROM training_records t
UNION ALL
SELECT a.id, c.title, a.employee_id, a.status, a.completed_at, a.assigned_hours,
  a.assessment_score, COALESCE(e.department, ''), a.data_source, a.updated_at
FROM course_assignments a
JOIN learning_courses c ON c.id = a.course_id
LEFT JOIN employees e ON e.employee_id = a.employee_id
WHERE NOT EXISTS (SELECT 1 FROM training_records t WHERE t.id = a.id);
--> statement-breakpoint
CREATE OR REPLACE VIEW promotion_events_view AS SELECT * FROM promotion_records;
--> statement-breakpoint
CREATE OR REPLACE VIEW attrition_events_view AS SELECT * FROM attrition_events;
--> statement-breakpoint
CREATE OR REPLACE VIEW attrition_model_profiles_view AS SELECT * FROM attrition_model_profiles;
