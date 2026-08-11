CREATE TABLE IF NOT EXISTS asset_lifecycle_settings (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  replacement_age_years INTEGER NOT NULL DEFAULT 4 CHECK (replacement_age_years BETWEEN 1 AND 15),
  warning_days INTEGER NOT NULL DEFAULT 90 CHECK (warning_days BETWEEN 1 AND 365),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO asset_lifecycle_settings(organization_id)
VALUES ('org:laidbackhr')
ON CONFLICT(organization_id) DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_tag TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('Laptop','Monitor','Phone','Access badge','Other')),
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  status TEXT NOT NULL CHECK (status IN ('Available','Assigned','Returned','Broken','Lost','Retired')),
  condition TEXT NOT NULL CHECK (condition IN ('Good','Degraded','Broken')),
  acquired_on DATE,
  warranty_expires_on DATE,
  replacement_due_on DATE,
  notes TEXT,
  data_source TEXT NOT NULL DEFAULT 'operational',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, asset_tag),
  UNIQUE(organization_id, serial_number)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assets_organization_status_idx
  ON assets(organization_id, status, asset_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assets_lifecycle_dates_idx
  ON assets(warranty_expires_on, replacement_due_on);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS asset_assignments (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'Assigned' CHECK (status IN ('Assigned','Returned')),
  return_condition TEXT CHECK (return_condition IS NULL OR return_condition IN ('Good','Degraded','Broken')),
  assigned_by_email TEXT NOT NULL,
  returned_by_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS asset_assignments_one_active_idx
  ON asset_assignments(asset_id) WHERE status='Assigned' AND returned_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS asset_assignments_employee_idx
  ON asset_assignments(employee_id, status, assigned_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS employee_exits (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE RESTRICT,
  previous_employment_status TEXT NOT NULL,
  exit_type TEXT NOT NULL CHECK (exit_type IN ('Resignation','Termination','Contract end','Other')),
  expected_exit_date DATE NOT NULL,
  actual_exit_date DATE,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','In Progress','Completed','Cancelled')),
  notes TEXT,
  created_by_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS employee_exits_one_open_idx
  ON employee_exits(employee_id) WHERE status IN ('Scheduled','In Progress');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS employee_exits_expected_status_idx
  ON employee_exits(expected_exit_date, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS offboarding_tasks (
  id TEXT PRIMARY KEY,
  employee_exit_id TEXT NOT NULL REFERENCES employee_exits(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  title TEXT NOT NULL,
  owner_team TEXT NOT NULL CHECK (owner_team IN ('HR','Manager','IT','Payroll')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','In Progress','Completed')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  completed_by_email TEXT,
  asset_assignment_id TEXT REFERENCES asset_assignments(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_exit_id, task_type, asset_assignment_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS offboarding_tasks_exit_status_idx
  ON offboarding_tasks(employee_exit_id, status, owner_team);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS offboarding_tasks_one_standard_task_idx
  ON offboarding_tasks(employee_exit_id, task_type) WHERE asset_assignment_id IS NULL;
--> statement-breakpoint
WITH ranked AS (
  SELECT employee_id, ROW_NUMBER() OVER (ORDER BY employee_id) AS rn
  FROM employees
  WHERE data_source='demo' AND archived_at IS NULL AND LOWER(employment_status)='active'
  ORDER BY employee_id
  LIMIT 18
)
INSERT INTO assets(id, organization_id, asset_tag, asset_type, manufacturer, model, serial_number, status, condition,
  acquired_on, warranty_expires_on, replacement_due_on, data_source)
SELECT
  'ASSET-DEMO-' || LPAD(rn::text, 4, '0'),
  'org:laidbackhr',
  'LAIDBACKHR-' || CASE WHEN rn % 4 = 0 THEN 'BD' WHEN rn % 4 = 1 THEN 'LT' WHEN rn % 4 = 2 THEN 'MN' ELSE 'PH' END || '-' || LPAD(rn::text, 4, '0'),
  CASE WHEN rn % 4 = 0 THEN 'Access badge' WHEN rn % 4 = 1 THEN 'Laptop' WHEN rn % 4 = 2 THEN 'Monitor' ELSE 'Phone' END,
  CASE WHEN rn % 4 = 0 THEN 'HID' WHEN rn % 4 = 1 THEN 'Lenovo' WHEN rn % 4 = 2 THEN 'Dell' ELSE 'Apple' END,
  CASE WHEN rn % 4 = 0 THEN 'Corporate badge' WHEN rn % 4 = 1 THEN 'ThinkPad T14' WHEN rn % 4 = 2 THEN 'P2422H' ELSE 'iPhone 15' END,
  'DEMO-SN-' || LPAD(rn::text, 6, '0'),
  'Assigned',
  CASE WHEN rn IN (6, 14) THEN 'Degraded' ELSE 'Good' END,
  CURRENT_DATE - ((rn % 4 + 1) * INTERVAL '1 year'),
  CURRENT_DATE + ((rn - 9) * INTERVAL '20 days'),
  CURRENT_DATE + ((rn - 12) * INTERVAL '30 days'),
  'demo'
FROM ranked
ON CONFLICT(organization_id, asset_tag) DO NOTHING;
--> statement-breakpoint
WITH ranked AS (
  SELECT employee_id, ROW_NUMBER() OVER (ORDER BY employee_id) AS rn
  FROM employees
  WHERE data_source='demo' AND archived_at IS NULL AND LOWER(employment_status)='active'
  ORDER BY employee_id
  LIMIT 18
)
INSERT INTO asset_assignments(id, asset_id, employee_id, assigned_at, status, assigned_by_email, notes)
SELECT
  'ASSIGN-DEMO-' || LPAD(rn::text, 4, '0'),
  'ASSET-DEMO-' || LPAD(rn::text, 4, '0'),
  employee_id,
  CURRENT_TIMESTAMP - ((rn % 20 + 20) * INTERVAL '1 day'),
  'Assigned',
  'seed@laidbackhr.ai',
  'Demonstration inventory assignment'
FROM ranked
ON CONFLICT(id) DO NOTHING;
--> statement-breakpoint
WITH ranked AS (
  SELECT aa.employee_id, ROW_NUMBER() OVER (ORDER BY aa.employee_id) AS rn
  FROM asset_assignments aa
  JOIN employees e ON e.employee_id=aa.employee_id
  WHERE aa.status='Assigned' AND e.data_source='demo' AND e.archived_at IS NULL
  ORDER BY aa.employee_id
  LIMIT 3
)
INSERT INTO employee_exits(id, employee_id, previous_employment_status, exit_type, expected_exit_date, status, notes, created_by_email)
SELECT
  'EXIT-DEMO-' || LPAD(rn::text, 3, '0'),
  employee_id,
  'Active',
  CASE WHEN rn=3 THEN 'Contract end' ELSE 'Resignation' END,
  CURRENT_DATE + (rn * INTERVAL '18 days'),
  CASE WHEN rn=1 THEN 'In Progress' ELSE 'Scheduled' END,
  'Demonstration offboarding record',
  'seed@laidbackhr.ai'
FROM ranked
ON CONFLICT(id) DO NOTHING;
--> statement-breakpoint
UPDATE employees e
SET employment_status=CASE WHEN x.status='In Progress' THEN 'Notice Period' ELSE 'Scheduled Exit' END,
    updated_at=CURRENT_TIMESTAMP,
    version=version+1
FROM employee_exits x
WHERE x.employee_id=e.employee_id AND x.id LIKE 'EXIT-DEMO-%' AND x.status IN ('Scheduled','In Progress')
  AND e.employment_status='Active';
--> statement-breakpoint
INSERT INTO offboarding_tasks(id, employee_exit_id, task_type, title, owner_team, status, due_date)
SELECT
  x.id || '-' || template.ordinal,
  x.id,
  template.task_type,
  template.title,
  template.owner_team,
  CASE WHEN x.status='In Progress' AND template.ordinal IN ('01','02') THEN 'Completed' ELSE 'Pending' END,
  x.expected_exit_date - template.days_before
FROM employee_exits x
CROSS JOIN (VALUES
  ('01','manager_notified','Manager notified','Manager',21),
  ('02','knowledge_transfer','Knowledge transfer completed','Manager',5),
  ('03','exit_interview','Exit interview completed','HR',2),
  ('04','access_revoked','System access revoked','IT',0),
  ('05','final_payroll','Final payroll processed','Payroll',0)
) AS template(ordinal, task_type, title, owner_team, days_before)
WHERE x.id LIKE 'EXIT-DEMO-%'
ON CONFLICT(employee_exit_id, task_type, asset_assignment_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO offboarding_tasks(id, employee_exit_id, task_type, title, owner_team, status, due_date, asset_assignment_id)
SELECT
  x.id || '-ASSET-' || aa.id,
  x.id,
  'asset_return',
  a.asset_tag || ' returned',
  'IT',
  'Pending',
  x.expected_exit_date,
  aa.id
FROM employee_exits x
JOIN asset_assignments aa ON aa.employee_id=x.employee_id AND aa.status='Assigned' AND aa.returned_at IS NULL
JOIN assets a ON a.id=aa.asset_id
WHERE x.id LIKE 'EXIT-DEMO-%'
ON CONFLICT(employee_exit_id, task_type, asset_assignment_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, priority,
  owner_email, due_at, next_action, source_entity_type, source_entity_id, assigned_at, confidentiality_level)
SELECT x.id, 'offboarding', x.employee_id, 'Employee offboarding', x.status,
  json_build_object('exitType', x.exit_type, 'expectedExitDate', x.expected_exit_date)::text,
  x.created_by_email, 'high', 'people-ops@laidbackhr.cloud', x.expected_exit_date::text,
  'Complete the employee offboarding checklist.', 'employee_exit', x.id, CURRENT_TIMESTAMP, 'restricted'
FROM employee_exits x
WHERE x.id LIKE 'EXIT-DEMO-%'
ON CONFLICT(id) DO NOTHING;
