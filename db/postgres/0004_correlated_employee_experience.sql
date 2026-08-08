INSERT INTO projects(id, code, name, client_name, status, start_date)
VALUES
  ('PRJ-PLATFORM-CLOUD', 'PLATFORM-CLOUD', 'Cloud platform modernization', NULL, 'active', CURRENT_DATE - INTERVAL '18 months'),
  ('PRJ-GTM-ENTERPRISE', 'GTM-ENTERPRISE', 'Enterprise growth programme', NULL, 'active', CURRENT_DATE - INTERVAL '12 months'),
  ('PRJ-PEOPLE-OPS', 'PEOPLE-OPS', 'People operations transformation', NULL, 'active', CURRENT_DATE - INTERVAL '9 months')
ON CONFLICT(code) DO NOTHING;
--> statement-breakpoint
INSERT INTO employee_project_assignments(id, employee_id, project_id, role_title, allocation_percent, starts_on, is_primary)
SELECT
  'ASN-DEMO-' || e.employee_id,
  e.employee_id,
  CASE e.department
    WHEN 'Sales' THEN 'PRJ-GTM-ENTERPRISE'
    WHEN 'Human Resources' THEN 'PRJ-PEOPLE-OPS'
    ELSE 'PRJ-PLATFORM-CLOUD'
  END,
  e.job_title,
  100,
  e.hire_date::date,
  TRUE
FROM employees e
WHERE e.data_source='demo'
  AND LOWER(e.employment_status) IN ('active', 'on leave')
  AND e.hire_date ~ '^\d{4}-\d{2}-\d{2}$'
ON CONFLICT(employee_id, project_id, starts_on) DO NOTHING;
--> statement-breakpoint
INSERT INTO employee_compensation(id, employee_id, annual_salary, currency, pay_frequency, effective_from, created_by_email)
SELECT
  'COMP-DEMO-' || p.employee_id,
  p.employee_id,
  ROUND((p.monthly_income * 12)::numeric, 2),
  'USD',
  'annual',
  e.hire_date::date,
  'azure-migration@laidbackhr.cloud'
FROM attrition_model_profiles p
JOIN employees e ON e.employee_id=p.employee_id
WHERE e.data_source='demo'
  AND e.hire_date ~ '^\d{4}-\d{2}-\d{2}$'
ON CONFLICT(id) DO NOTHING;
