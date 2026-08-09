CREATE TABLE IF NOT EXISTS job_profiles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  department_name TEXT NOT NULL,
  title TEXT NOT NULL,
  job_level TEXT NOT NULL DEFAULT 'Not specified',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, department_name, title, job_level)
);
--> statement-breakpoint
ALTER TABLE employees ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) DEFAULT 'org:laidbackhr';
--> statement-breakpoint
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_profile_id TEXT REFERENCES job_profiles(id);
--> statement-breakpoint
INSERT INTO job_profiles(id, organization_id, department_name, title, job_level)
SELECT 'job:' || md5(LOWER(COALESCE(NULLIF(TRIM(department), ''), 'Not specified')) || ':' || LOWER(COALESCE(NULLIF(TRIM(job_title), ''), 'Not specified'))),
  'org:laidbackhr', COALESCE(NULLIF(TRIM(department), ''), 'Not specified'), COALESCE(NULLIF(TRIM(job_title), ''), 'Not specified'),
  CASE
    WHEN job_title ~* '(chief|vice president|\bvp\b)' THEN 'Executive'
    WHEN job_title ~* '(director|head of)' THEN 'Director'
    WHEN job_title ~* '(manager|lead)' THEN 'Manager'
    WHEN job_title ~* '(principal|staff)' THEN 'IC5'
    WHEN job_title ~* 'senior' THEN 'IC4'
    WHEN job_title ~* '(junior|associate|coordinator|representative)' THEN 'IC2'
    ELSE 'IC3'
  END
FROM employees
GROUP BY department, job_title
ON CONFLICT(organization_id, department_name, title, job_level) DO NOTHING;
--> statement-breakpoint
UPDATE employees e
SET organization_id = COALESCE(e.organization_id, 'org:laidbackhr'),
    job_profile_id = COALESCE(e.job_profile_id, j.id)
FROM job_profiles j
WHERE j.organization_id = COALESCE(e.organization_id, 'org:laidbackhr')
  AND LOWER(j.department_name) = LOWER(COALESCE(NULLIF(TRIM(e.department), ''), 'Not specified'))
  AND LOWER(j.title) = LOWER(COALESCE(NULLIF(TRIM(e.job_title), ''), 'Not specified'));
--> statement-breakpoint
DROP VIEW IF EXISTS employee_directory_view;
--> statement-breakpoint
DROP VIEW IF EXISTS hiring_requisitions_view;
--> statement-breakpoint
DROP VIEW IF EXISTS learning_assignments_view;
--> statement-breakpoint
ALTER TABLE employees ALTER COLUMN organization_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE employees ALTER COLUMN job_profile_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE employees ADD CONSTRAINT employees_manager_fk FOREIGN KEY(manager_id) REFERENCES employees(employee_id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED NOT VALID;
--> statement-breakpoint
ALTER TABLE employees DROP COLUMN IF EXISTS tenure_years;
--> statement-breakpoint
ALTER TABLE employees DROP COLUMN IF EXISTS department;
--> statement-breakpoint
ALTER TABLE employees DROP COLUMN IF EXISTS job_title;
--> statement-breakpoint
ALTER TABLE employees DROP COLUMN IF EXISTS manager;
--> statement-breakpoint
ALTER TABLE hiring_records DROP COLUMN IF EXISTS time_to_hire_days;
--> statement-breakpoint
DROP TABLE IF EXISTS data_import_rows;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS employees_organization_status_idx ON employees(organization_id, employment_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS employees_job_profile_idx ON employees(job_profile_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS workspace_analytics_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  recruiting_cost_per_hire NUMERIC(12,2) NOT NULL CHECK (recruiting_cost_per_hire >= 0),
  vacancy_productivity_percent NUMERIC(5,2) NOT NULL CHECK (vacancy_productivity_percent BETWEEN 0 AND 100),
  onboarding_days INTEGER NOT NULL CHECK (onboarding_days BETWEEN 0 AND 730),
  onboarding_productivity_percent NUMERIC(5,2) NOT NULL CHECK (onboarding_productivity_percent BETWEEN 0 AND 100),
  course_fee_per_learner NUMERIC(12,2) NOT NULL CHECK (course_fee_per_learner >= 0),
  course_hours_per_learner NUMERIC(8,2) NOT NULL CHECK (course_hours_per_learner > 0),
  fallback_refill_days INTEGER NOT NULL CHECK (fallback_refill_days BETWEEN 1 AND 365),
  critical_review_share NUMERIC(5,2) NOT NULL CHECK (critical_review_share BETWEEN 0 AND 100),
  watch_review_share NUMERIC(5,2) NOT NULL CHECK (watch_review_share BETWEEN 0 AND 100),
  updated_by_email TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (critical_review_share >= watch_review_share)
);
--> statement-breakpoint
INSERT INTO workspace_analytics_settings(
  organization_id, currency, recruiting_cost_per_hire, vacancy_productivity_percent,
  onboarding_days, onboarding_productivity_percent, course_fee_per_learner,
  course_hours_per_learner, fallback_refill_days, critical_review_share,
  watch_review_share, updated_by_email
) VALUES ('org:laidbackhr', 'USD', 7500, 50, 90, 25, 500, 8, 45, 30, 15, 'migration')
ON CONFLICT(organization_id) DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS employee_onboarding_submissions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES app_users(email),
  employee_id TEXT REFERENCES employees(employee_id),
  organization_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  phone TEXT,
  department TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_level TEXT NOT NULL,
  location TEXT NOT NULL,
  manager_name TEXT,
  manager_email TEXT,
  hire_date DATE NOT NULL,
  employment_type TEXT NOT NULL,
  requested_annual_salary NUMERIC(14,2) NOT NULL CHECK (requested_annual_salary >= 0),
  salary_currency CHAR(3) NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  reviewed_by_email TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_open_user_idx
  ON employee_onboarding_submissions(user_email) WHERE status IN ('draft', 'submitted');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS onboarding_status_created_idx
  ON employee_onboarding_submissions(status, created_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS learning_assignment_campaigns (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  course_id TEXT NOT NULL REFERENCES learning_courses(id),
  name TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('employee', 'department', 'job_title', 'job_level', 'manager_team')),
  target_value TEXT,
  target_snapshot_json JSONB NOT NULL,
  due_date DATE NOT NULL,
  assigned_hours NUMERIC(8,2) NOT NULL CHECK (assigned_hours > 0),
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
ALTER TABLE course_assignments ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES learning_assignment_campaigns(id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS course_assignments_campaign_idx ON course_assignments(campaign_id);
--> statement-breakpoint
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'not_required';
--> statement-breakpoint
CREATE VIEW employee_directory_view AS
SELECT e.employee_id, e.first_name, e.last_name, e.preferred_name, e.work_email, e.phone,
  j.department_name AS department, j.title AS job_title, j.job_level,
  e.location,
  COALESCE(NULLIF(TRIM(COALESCE(NULLIF(m.preferred_name, ''), m.first_name, '') || ' ' || COALESCE(m.last_name, '')), ''), 'Not assigned') AS manager,
  e.manager_id, e.hire_date, e.employment_type, e.employment_status,
  ROUND(GREATEST(0, (CURRENT_DATE - e.hire_date::date) / 365.25)::numeric, 1)::double precision AS tenure_years,
  e.organization_id, o.name AS organization_name, e.job_profile_id,
  e.data_source, e.archived_at, e.version, e.created_at, e.updated_at
FROM employees e
LEFT JOIN organizations o ON o.id=e.organization_id
JOIN job_profiles j ON j.id=e.job_profile_id
LEFT JOIN employees m ON m.employee_id=e.manager_id;
--> statement-breakpoint
CREATE VIEW learning_assignments_view AS
SELECT t.id, t.training_program, t.employee_id, t.completion_status, t.completion_date,
  t.training_hours, t.assessment_score, t.department,
  CASE WHEN t.training_program ~* '(security|privacy|safety|compliance|phishing)' THEN 1 ELSE 0 END AS is_mandatory,
  t.data_source, t.updated_at,
  COALESCE(w.due_at, w.details_json::jsonb ->> 'dueDate') AS due_date,
  COALESCE(w.assigned_at, w.created_at, t.updated_at) AS assigned_at
FROM training_records t
LEFT JOIN workflow_requests w ON w.id = t.id AND w.type = 'training'
UNION ALL
SELECT a.id, c.title, a.employee_id, a.status, a.completed_at, a.assigned_hours,
  a.assessment_score, COALESCE(e.department, ''), c.is_mandatory, a.data_source, a.updated_at,
  a.due_date, a.assigned_at
FROM course_assignments a
JOIN learning_courses c ON c.id = a.course_id
LEFT JOIN employee_directory_view e ON e.employee_id = a.employee_id
WHERE NOT EXISTS (SELECT 1 FROM training_records t WHERE t.id = a.id);
--> statement-breakpoint
CREATE VIEW hiring_requisitions_view AS
SELECT h.id, h.position, h.department, h.application_date, h.hiring_date, h.hiring_source,
  CASE WHEN h.hiring_date IS NULL THEN NULL ELSE h.hiring_date::date - h.application_date::date END AS time_to_hire_days,
  h.recruitment_status, h.location, h.data_source, h.updated_at
FROM hiring_records h;
