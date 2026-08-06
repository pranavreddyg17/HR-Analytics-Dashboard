CREATE TABLE IF NOT EXISTS `attrition_assessment_features` (
	`assessment_id` text NOT NULL,
	`feature_key` text NOT NULL,
	`feature_value` text NOT NULL,
	`contribution` real,
	`contribution_rank` integer,
	`explanation` text,
	PRIMARY KEY(`assessment_id`, `feature_key`),
	FOREIGN KEY (`assessment_id`) REFERENCES `attrition_assessments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `attrition_assessment_features_key_idx` ON `attrition_assessment_features` (`feature_key`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `attrition_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`model_version_id` text NOT NULL,
	`risk_score` real NOT NULL,
	`data_source` text DEFAULT 'demo' NOT NULL,
	`assessed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_version_id`) REFERENCES `model_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `attrition_assessments_employee_model_uq` ON `attrition_assessments` (`employee_id`,`model_version_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `attrition_assessments_risk_idx` ON `attrition_assessments` (`model_version_id`,`risk_score`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `candidate_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`requisition_id` text NOT NULL,
	`stage` text NOT NULL,
	`source` text NOT NULL,
	`applied_at` text NOT NULL,
	`owner_email` text NOT NULL,
	`next_step` text NOT NULL,
	`next_step_due_at` text,
	`notes` text,
	`rejected_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `talent_candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requisition_id`) REFERENCES `job_requisitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `candidate_applications_requisition_stage_idx` ON `candidate_applications` (`requisition_id`,`stage`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `candidate_applications_candidate_idx` ON `candidate_applications` (`candidate_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `candidate_applications_due_stage_idx` ON `candidate_applications` (`next_step_due_at`,`stage`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `candidate_applications_requisition_candidate_uq` ON `candidate_applications` (`requisition_id`,`candidate_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `course_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`due_date` text,
	`status` text NOT NULL,
	`completed_at` text,
	`assessment_score` real,
	`assigned_hours` real DEFAULT 0 NOT NULL,
	`data_source` text DEFAULT 'imported' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `learning_courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `course_assignments_employee_status_idx` ON `course_assignments` (`employee_id`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `course_assignments_due_status_idx` ON `course_assignments` (`due_date`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `course_assignments_course_idx` ON `course_assignments` (`course_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`parent_department_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `departments_name_uq` ON `departments` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `departments_code_uq` ON `departments` (`code`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `departments_parent_idx` ON `departments` (`parent_department_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `employee_exits` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`exit_date` text NOT NULL,
	`exit_reason_id` text NOT NULL,
	`exit_type` text NOT NULL,
	`department_id` text,
	`data_source` text DEFAULT 'imported' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exit_reason_id`) REFERENCES `exit_reasons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employee_exits_employee_date_idx` ON `employee_exits` (`employee_id`,`exit_date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employee_exits_department_date_idx` ON `employee_exits` (`department_id`,`exit_date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employee_exits_reason_idx` ON `employee_exits` (`exit_reason_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `employee_promotions` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`previous_job_profile_id` text NOT NULL,
	`new_job_profile_id` text NOT NULL,
	`department_id` text,
	`promotion_date` text NOT NULL,
	`data_source` text DEFAULT 'imported' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_job_profile_id`) REFERENCES `job_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`new_job_profile_id`) REFERENCES `job_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employee_promotions_employee_date_idx` ON `employee_promotions` (`employee_id`,`promotion_date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employee_promotions_department_date_idx` ON `employee_promotions` (`department_id`,`promotion_date`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `employment_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`department_id` text NOT NULL,
	`job_profile_id` text NOT NULL,
	`location_id` text NOT NULL,
	`manager_employee_id` text,
	`employment_type` text NOT NULL,
	`employment_status` text NOT NULL,
	`effective_start` text NOT NULL,
	`effective_end` text,
	`is_primary` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_profile_id`) REFERENCES `job_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manager_employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employment_assignments_employee_dates_idx` ON `employment_assignments` (`employee_id`,`effective_start`,`effective_end`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employment_assignments_department_status_idx` ON `employment_assignments` (`department_id`,`employment_status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employment_assignments_manager_idx` ON `employment_assignments` (`manager_employee_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `employment_assignments_primary_idx` ON `employment_assignments` (`employee_id`,`is_primary`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exit_reasons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `exit_reasons_name_uq` ON `exit_reasons` (`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`job_family` text,
	`job_level` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `job_profiles_title_uq` ON `job_profiles` (`title`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_requisitions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_profile_id` text NOT NULL,
	`department_id` text NOT NULL,
	`location_id` text NOT NULL,
	`opened_at` text NOT NULL,
	`hired_at` text,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`data_source` text DEFAULT 'imported' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_profile_id`) REFERENCES `job_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_requisitions_department_status_idx` ON `job_requisitions` (`department_id`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_requisitions_opened_idx` ON `job_requisitions` (`opened_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `learning_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`title` text NOT NULL,
	`default_duration_hours` real DEFAULT 0 NOT NULL,
	`is_mandatory` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `learning_courses_title_uq` ON `learning_courses` (`title`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `learning_courses_code_uq` ON `learning_courses` (`code`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`leave_days` real NOT NULL,
	`status` text NOT NULL,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`decided_at` text,
	`decided_by_email` text,
	`data_source` text DEFAULT 'imported' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`employee_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `leave_requests_employee_dates_idx` ON `leave_requests` (`employee_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `leave_requests_status_start_idx` ON `leave_requests` (`status`,`start_date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `leave_requests_type_idx` ON `leave_requests` (`leave_type_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `leave_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_paid` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `leave_types_name_uq` ON `leave_types` (`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`country_code` text,
	`timezone` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `locations_name_uq` ON `locations` (`name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`model_name` text NOT NULL,
	`algorithm` text,
	`review_threshold` real,
	`evaluation_window_days` integer,
	`metrics_json` text,
	`intended_use` text,
	`prohibited_use` text,
	`trained_at` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `talent_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `talent_candidates_email_uq` ON `talent_candidates` (`email`);
--> statement-breakpoint
INSERT OR IGNORE INTO departments(id, name)
SELECT 'dept:' || LOWER(TRIM(name)), name FROM (
  SELECT department AS name FROM employees
  UNION SELECT department FROM hiring_records
  UNION SELECT department FROM attrition_events
  UNION SELECT department FROM promotion_records
) WHERE TRIM(COALESCE(name, '')) <> '';
--> statement-breakpoint
INSERT OR IGNORE INTO locations(id, name)
SELECT 'loc:' || LOWER(TRIM(name)), name FROM (
  SELECT location AS name FROM employees
  UNION SELECT location FROM hiring_records
) WHERE TRIM(COALESCE(name, '')) <> '';
--> statement-breakpoint
INSERT OR IGNORE INTO job_profiles(id, title)
SELECT 'job:' || LOWER(TRIM(title)), title FROM (
  SELECT job_title AS title FROM employees
  UNION SELECT position FROM hiring_records
  UNION SELECT previous_title FROM promotion_records
  UNION SELECT new_title FROM promotion_records
) WHERE TRIM(COALESCE(title, '')) <> '';
--> statement-breakpoint
INSERT OR IGNORE INTO employment_assignments(
  id, employee_id, department_id, job_profile_id, location_id, manager_employee_id,
  employment_type, employment_status, effective_start, effective_end, is_primary, created_at, updated_at
)
SELECT e.employee_id || ':v' || e.version, e.employee_id,
  'dept:' || LOWER(TRIM(e.department)), 'job:' || LOWER(TRIM(e.job_title)),
  'loc:' || LOWER(TRIM(e.location)), NULL, e.employment_type, e.employment_status,
  e.hire_date, NULL, 1, COALESCE(e.created_at, e.updated_at), e.updated_at
FROM employees e;
--> statement-breakpoint
UPDATE employment_assignments
SET manager_employee_id = (
  SELECT e.manager_id FROM employees e
  WHERE e.employee_id = employment_assignments.employee_id
    AND EXISTS (SELECT 1 FROM employees m WHERE m.employee_id = e.manager_id)
)
WHERE is_primary = 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS employment_assignments_one_primary_uq
ON employment_assignments(employee_id) WHERE is_primary = 1;
--> statement-breakpoint
INSERT OR IGNORE INTO leave_types(id, name, is_paid)
SELECT 'leave:' || LOWER(TRIM(leave_type)), leave_type,
  CASE WHEN LOWER(leave_type) = 'unpaid' THEN 0 ELSE 1 END
FROM leave_records WHERE TRIM(COALESCE(leave_type, '')) <> ''
GROUP BY LOWER(TRIM(leave_type));
--> statement-breakpoint
INSERT OR IGNORE INTO leave_requests(
  id, employee_id, leave_type_id, start_date, end_date, leave_days, status,
  requested_at, decided_at, decided_by_email, data_source, updated_at
)
SELECT l.id, l.employee_id, 'leave:' || LOWER(TRIM(l.leave_type)), l.start_date,
  l.end_date, l.leave_days, l.approval_status, l.updated_at,
  CASE WHEN LOWER(l.approval_status) <> 'pending' THEN l.updated_at END,
  CASE WHEN LOWER(l.approval_status) <> 'pending' THEN w.resolved_by_email END,
  l.data_source, l.updated_at
FROM leave_records l
LEFT JOIN workflow_requests w ON w.id = l.id AND w.type = 'leave'
WHERE EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = l.employee_id);
--> statement-breakpoint
INSERT OR IGNORE INTO learning_courses(id, title, default_duration_hours, is_mandatory)
SELECT 'course:' || LOWER(TRIM(training_program)), training_program, MAX(training_hours),
  CASE WHEN LOWER(training_program) LIKE '%security%'
    OR LOWER(training_program) LIKE '%privacy%'
    OR LOWER(training_program) LIKE '%safety%'
    OR LOWER(training_program) LIKE '%soc 2%' THEN 1 ELSE 0 END
FROM training_records WHERE TRIM(COALESCE(training_program, '')) <> ''
GROUP BY LOWER(TRIM(training_program));
--> statement-breakpoint
INSERT OR IGNORE INTO course_assignments(
  id, course_id, employee_id, assigned_at, due_date, status, completed_at,
  assessment_score, assigned_hours, data_source, updated_at
)
SELECT t.id, 'course:' || LOWER(TRIM(t.training_program)), t.employee_id,
  COALESCE(w.created_at, t.updated_at), json_extract(w.details_json, '$.dueDate'),
  t.completion_status, t.completion_date, t.assessment_score, t.training_hours,
  t.data_source, t.updated_at
FROM training_records t
LEFT JOIN workflow_requests w ON w.id = t.id AND w.type = 'training'
WHERE EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = t.employee_id);
--> statement-breakpoint
INSERT OR IGNORE INTO job_requisitions(
  id, job_profile_id, department_id, location_id, opened_at, hired_at, source,
  status, data_source, updated_at
)
SELECT h.id, 'job:' || LOWER(TRIM(h.position)), 'dept:' || LOWER(TRIM(h.department)),
  'loc:' || LOWER(TRIM(h.location)), h.application_date, h.hiring_date,
  h.hiring_source, h.recruitment_status, h.data_source, h.updated_at
FROM hiring_records h;
--> statement-breakpoint
INSERT OR IGNORE INTO talent_candidates(id, full_name, email, created_at, updated_at)
SELECT 'candidate:' || LOWER(TRIM(email)), MAX(full_name), LOWER(TRIM(email)),
  MIN(created_at), MAX(updated_at)
FROM hiring_candidates
WHERE TRIM(COALESCE(email, '')) <> ''
GROUP BY LOWER(TRIM(email));
--> statement-breakpoint
INSERT OR IGNORE INTO candidate_applications(
  id, candidate_id, requisition_id, stage, source, applied_at, owner_email,
  next_step, next_step_due_at, notes, rejected_reason, created_at, updated_at
)
SELECT c.id, 'candidate:' || LOWER(TRIM(c.email)), c.requisition_id, c.stage,
  c.source, c.applied_at, c.owner_email, c.next_step, c.next_step_due_at,
  c.notes, c.rejected_reason, c.created_at, c.updated_at
FROM hiring_candidates c
WHERE EXISTS (SELECT 1 FROM job_requisitions r WHERE r.id = c.requisition_id);
--> statement-breakpoint
INSERT OR IGNORE INTO exit_reasons(id, name)
SELECT 'exit:' || LOWER(TRIM(exit_reason)), exit_reason
FROM attrition_events WHERE TRIM(COALESCE(exit_reason, '')) <> ''
GROUP BY LOWER(TRIM(exit_reason));
--> statement-breakpoint
INSERT OR IGNORE INTO employee_exits(
  id, employee_id, exit_date, exit_reason_id, exit_type, department_id,
  data_source, updated_at
)
SELECT a.id, a.employee_id, a.exit_date, 'exit:' || LOWER(TRIM(a.exit_reason)),
  a.exit_type, 'dept:' || LOWER(TRIM(a.department)),
  a.data_source, a.updated_at
FROM attrition_events a
WHERE EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = a.employee_id);
--> statement-breakpoint
INSERT OR IGNORE INTO employee_promotions(
  id, employee_id, previous_job_profile_id, new_job_profile_id, department_id,
  promotion_date, data_source, updated_at
)
SELECT p.id, p.employee_id, 'job:' || LOWER(TRIM(p.previous_title)),
  'job:' || LOWER(TRIM(p.new_title)), 'dept:' || LOWER(TRIM(p.department)),
  p.promotion_date, p.data_source, p.updated_at
FROM promotion_records p
WHERE EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = p.employee_id);
--> statement-breakpoint
INSERT OR IGNORE INTO model_versions(
  id, model_name, algorithm, review_threshold, evaluation_window_days,
  metrics_json, intended_use, prohibited_use
)
SELECT DISTINCT model_version, 'Historical attrition benchmark', 'Runtime model; see version metadata', 0.20, 365,
  '{}',
  'Prioritize qualified human review of aggregate workforce patterns and synthetic validation profiles.',
  'Automated employment decisions, resignation timing, causal claims, or use as the sole basis for an employee action.'
FROM attrition_model_profiles;
--> statement-breakpoint
INSERT OR IGNORE INTO attrition_assessments(
  id, employee_id, model_version_id, risk_score, data_source, assessed_at
)
SELECT p.employee_id || ':' || p.model_version, p.employee_id, p.model_version,
  p.risk_score, p.data_source, p.updated_at
FROM attrition_model_profiles p
WHERE EXISTS (SELECT 1 FROM employees e WHERE e.employee_id = p.employee_id);
--> statement-breakpoint
INSERT OR REPLACE INTO attrition_assessment_features(
  assessment_id, feature_key, feature_value, contribution_rank, explanation
)
SELECT p.employee_id || ':' || p.model_version, 'monthly_income', CAST(p.monthly_income AS TEXT),
  CASE WHEN LOWER(p.top_driver) LIKE '%income%' OR LOWER(p.top_driver) LIKE '%compensation%' THEN 1 END,
  CASE WHEN LOWER(p.top_driver) LIKE '%income%' OR LOWER(p.top_driver) LIKE '%compensation%' THEN p.top_driver END
FROM attrition_model_profiles p JOIN attrition_assessments a ON a.id = p.employee_id || ':' || p.model_version;
--> statement-breakpoint
INSERT OR REPLACE INTO attrition_assessment_features(assessment_id, feature_key, feature_value, contribution_rank, explanation)
SELECT p.employee_id || ':' || p.model_version, 'distance_from_home', CAST(p.distance_from_home AS TEXT),
  CASE WHEN LOWER(p.top_driver) LIKE '%distance%' OR LOWER(p.top_driver) LIKE '%commute%' THEN 1 END,
  CASE WHEN LOWER(p.top_driver) LIKE '%distance%' OR LOWER(p.top_driver) LIKE '%commute%' THEN p.top_driver END
FROM attrition_model_profiles p JOIN attrition_assessments a ON a.id = p.employee_id || ':' || p.model_version;
--> statement-breakpoint
INSERT OR REPLACE INTO attrition_assessment_features(assessment_id, feature_key, feature_value, contribution_rank, explanation)
SELECT p.employee_id || ':' || p.model_version, 'education_level', CAST(p.education_level AS TEXT), NULL, NULL
FROM attrition_model_profiles p JOIN attrition_assessments a ON a.id = p.employee_id || ':' || p.model_version;
--> statement-breakpoint
INSERT OR REPLACE INTO attrition_assessment_features(assessment_id, feature_key, feature_value, contribution_rank, explanation)
SELECT p.employee_id || ':' || p.model_version, 'education_field', p.education_field,
  CASE WHEN LOWER(p.top_driver) LIKE '%education%' THEN 1 END,
  CASE WHEN LOWER(p.top_driver) LIKE '%education%' THEN p.top_driver END
FROM attrition_model_profiles p JOIN attrition_assessments a ON a.id = p.employee_id || ':' || p.model_version;
--> statement-breakpoint
INSERT OR REPLACE INTO attrition_assessment_features(assessment_id, feature_key, feature_value, contribution_rank, explanation)
SELECT p.employee_id || ':' || p.model_version, 'environment_satisfaction', CAST(p.environment_satisfaction AS TEXT),
  CASE WHEN LOWER(p.top_driver) LIKE '%environment%' THEN 1 END,
  CASE WHEN LOWER(p.top_driver) LIKE '%environment%' THEN p.top_driver END
FROM attrition_model_profiles p JOIN attrition_assessments a ON a.id = p.employee_id || ':' || p.model_version;
--> statement-breakpoint
INSERT OR REPLACE INTO attrition_assessment_features(assessment_id, feature_key, feature_value, contribution_rank, explanation)
SELECT p.employee_id || ':' || p.model_version, 'job_satisfaction', CAST(p.job_satisfaction AS TEXT),
  CASE WHEN LOWER(p.top_driver) LIKE '%job satisfaction%' THEN 1 END,
  CASE WHEN LOWER(p.top_driver) LIKE '%job satisfaction%' THEN p.top_driver END
FROM attrition_model_profiles p JOIN attrition_assessments a ON a.id = p.employee_id || ':' || p.model_version;
--> statement-breakpoint
INSERT OR REPLACE INTO attrition_assessment_features(assessment_id, feature_key, feature_value, contribution_rank, explanation)
SELECT p.employee_id || ':' || p.model_version, 'prior_companies', CAST(p.prior_companies AS TEXT),
  CASE WHEN LOWER(p.top_driver) LIKE '%prior compan%' OR LOWER(p.top_driver) LIKE '%companies worked%' THEN 1 END,
  CASE WHEN LOWER(p.top_driver) LIKE '%prior compan%' OR LOWER(p.top_driver) LIKE '%companies worked%' THEN p.top_driver END
FROM attrition_model_profiles p JOIN attrition_assessments a ON a.id = p.employee_id || ':' || p.model_version;
--> statement-breakpoint
INSERT OR REPLACE INTO attrition_assessment_features(assessment_id, feature_key, feature_value, contribution_rank, explanation)
SELECT p.employee_id || ':' || p.model_version, 'work_life_balance', CAST(p.work_life_balance AS TEXT),
  CASE WHEN LOWER(p.top_driver) LIKE '%work-life%' OR LOWER(p.top_driver) LIKE '%work life%' THEN 1 END,
  CASE WHEN LOWER(p.top_driver) LIKE '%work-life%' OR LOWER(p.top_driver) LIKE '%work life%' THEN p.top_driver END
FROM attrition_model_profiles p JOIN attrition_assessments a ON a.id = p.employee_id || ':' || p.model_version;
--> statement-breakpoint
INSERT OR REPLACE INTO attrition_assessment_features(assessment_id, feature_key, feature_value, contribution_rank, explanation)
SELECT p.employee_id || ':' || p.model_version, 'years_at_company', CAST(p.years_at_company AS TEXT),
  CASE WHEN LOWER(p.top_driver) LIKE '%tenure%' OR LOWER(p.top_driver) LIKE '%years at company%' THEN 1 END,
  CASE WHEN LOWER(p.top_driver) LIKE '%tenure%' OR LOWER(p.top_driver) LIKE '%years at company%' THEN p.top_driver END
FROM attrition_model_profiles p JOIN attrition_assessments a ON a.id = p.employee_id || ':' || p.model_version;
--> statement-breakpoint
INSERT OR REPLACE INTO attrition_assessment_features(assessment_id, feature_key, feature_value, contribution_rank, explanation)
SELECT p.employee_id || ':' || p.model_version, 'department', e.department,
  CASE WHEN LOWER(p.top_driver) LIKE '%department%' THEN 1 END,
  CASE WHEN LOWER(p.top_driver) LIKE '%department%' THEN p.top_driver END
FROM attrition_model_profiles p
JOIN attrition_assessments a ON a.id = p.employee_id || ':' || p.model_version
JOIN employees e ON e.employee_id = p.employee_id;
--> statement-breakpoint
CREATE VIEW IF NOT EXISTS employee_directory_view AS
SELECT e.employee_id, e.first_name, e.last_name, e.preferred_name, e.work_email,
  e.phone, d.name AS department, j.title AS job_title, l.name AS location,
  COALESCE(NULLIF(TRIM(COALESCE(m.preferred_name, m.first_name, '') || ' ' || COALESCE(m.last_name, '')), ''), 'Not assigned') AS manager,
  ea.manager_employee_id AS manager_id, ea.effective_start AS hire_date,
  ea.employment_type, ea.employment_status,
  ROUND(MAX(0, (julianday('now') - julianday(ea.effective_start)) / 365.25), 1) AS tenure_years,
  e.data_source, e.archived_at, e.version, e.created_at, e.updated_at
FROM employees e
JOIN employment_assignments ea ON ea.employee_id = e.employee_id AND ea.is_primary = 1
JOIN departments d ON d.id = ea.department_id
JOIN job_profiles j ON j.id = ea.job_profile_id
JOIN locations l ON l.id = ea.location_id
LEFT JOIN employees m ON m.employee_id = ea.manager_employee_id;
--> statement-breakpoint
CREATE VIEW IF NOT EXISTS hiring_requisitions_view AS
SELECT r.id, j.title AS position, d.name AS department, r.opened_at AS application_date,
  r.hired_at AS hiring_date, r.source AS hiring_source,
  CASE WHEN r.hired_at IS NULL THEN NULL
    ELSE CAST(MAX(0, julianday(r.hired_at) - julianday(r.opened_at)) AS INTEGER)
  END AS time_to_hire_days,
  r.status AS recruitment_status, l.name AS location, r.data_source, r.updated_at
FROM job_requisitions r
JOIN job_profiles j ON j.id = r.job_profile_id
JOIN departments d ON d.id = r.department_id
JOIN locations l ON l.id = r.location_id;
--> statement-breakpoint
CREATE VIEW IF NOT EXISTS candidate_applications_view AS
SELECT a.id, a.requisition_id, c.full_name, c.email, a.stage, a.source,
  a.applied_at, a.owner_email, a.next_step, a.next_step_due_at, a.notes,
  a.rejected_reason, a.created_at, a.updated_at
FROM candidate_applications a
JOIN talent_candidates c ON c.id = a.candidate_id;
--> statement-breakpoint
CREATE VIEW IF NOT EXISTS leave_requests_view AS
SELECT r.id, r.employee_id, t.name AS leave_type, r.start_date, r.end_date,
  r.leave_days, r.status AS approval_status, COALESCE(d.name, '') AS department,
  r.data_source, r.updated_at
FROM leave_requests r
JOIN leave_types t ON t.id = r.leave_type_id
LEFT JOIN employment_assignments ea ON ea.employee_id = r.employee_id AND ea.is_primary = 1
LEFT JOIN departments d ON d.id = ea.department_id;
--> statement-breakpoint
CREATE VIEW IF NOT EXISTS learning_assignments_view AS
SELECT a.id, c.title AS training_program, a.employee_id,
  a.status AS completion_status, a.completed_at AS completion_date,
  a.assigned_hours AS training_hours, a.assessment_score,
  COALESCE(d.name, '') AS department, a.data_source, a.updated_at,
  a.due_date, a.assigned_at
FROM course_assignments a
JOIN learning_courses c ON c.id = a.course_id
LEFT JOIN employment_assignments ea ON ea.employee_id = a.employee_id AND ea.is_primary = 1
LEFT JOIN departments d ON d.id = ea.department_id;
--> statement-breakpoint
CREATE VIEW IF NOT EXISTS promotion_events_view AS
SELECT p.id, p.employee_id, previous_job.title AS previous_title,
  new_job.title AS new_title, p.promotion_date, COALESCE(d.name, '') AS department,
  CAST(MAX(0, (julianday(p.promotion_date) - julianday(COALESCE(
    (SELECT MAX(previous.promotion_date) FROM employee_promotions previous
      WHERE previous.employee_id = p.employee_id AND previous.promotion_date < p.promotion_date),
    (SELECT MIN(assignment.effective_start) FROM employment_assignments assignment
      WHERE assignment.employee_id = p.employee_id),
    p.promotion_date
  ))) / 30.4375) AS INTEGER) AS months_since_previous_promotion,
  p.data_source, p.updated_at
FROM employee_promotions p
JOIN job_profiles previous_job ON previous_job.id = p.previous_job_profile_id
JOIN job_profiles new_job ON new_job.id = p.new_job_profile_id
LEFT JOIN departments d ON d.id = p.department_id;
--> statement-breakpoint
CREATE VIEW IF NOT EXISTS attrition_events_view AS
SELECT x.id, x.employee_id, x.exit_date, r.name AS exit_reason, x.exit_type,
  COALESCE(d.name, '') AS department,
  ROUND(MAX(0, (julianday(x.exit_date) - julianday(COALESCE(
    (SELECT MIN(assignment.effective_start) FROM employment_assignments assignment
      WHERE assignment.employee_id = x.employee_id),
    x.exit_date
  ))) / 365.25), 1) AS tenure_years,
  x.data_source, x.updated_at
FROM employee_exits x
JOIN exit_reasons r ON r.id = x.exit_reason_id
LEFT JOIN departments d ON d.id = x.department_id;
--> statement-breakpoint
CREATE VIEW IF NOT EXISTS attrition_model_profiles_view AS
SELECT a.employee_id,
  CASE WHEN EXISTS (SELECT 1 FROM employee_exits x WHERE x.employee_id = a.employee_id) THEN 'Yes' ELSE 'No' END AS observed_attrition,
  a.risk_score,
  CASE
    WHEN a.risk_score >= COALESCE(v.review_threshold, 0.20) * 100 THEN 'high'
    WHEN a.risk_score >= COALESCE(v.review_threshold, 0.20) * 0.55 * 100 THEN 'medium'
    ELSE 'low'
  END AS risk_level,
  COALESCE(MAX(CASE WHEN f.contribution_rank = 1 THEN f.explanation END), 'No leading contribution recorded') AS top_driver,
  CAST(MAX(CASE WHEN f.feature_key = 'monthly_income' THEN f.feature_value END) AS REAL) AS monthly_income,
  CAST(MAX(CASE WHEN f.feature_key = 'distance_from_home' THEN f.feature_value END) AS INTEGER) AS distance_from_home,
  CAST(MAX(CASE WHEN f.feature_key = 'education_level' THEN f.feature_value END) AS INTEGER) AS education_level,
  MAX(CASE WHEN f.feature_key = 'education_field' THEN f.feature_value END) AS education_field,
  CAST(MAX(CASE WHEN f.feature_key = 'environment_satisfaction' THEN f.feature_value END) AS INTEGER) AS environment_satisfaction,
  CAST(MAX(CASE WHEN f.feature_key = 'job_satisfaction' THEN f.feature_value END) AS INTEGER) AS job_satisfaction,
  CAST(MAX(CASE WHEN f.feature_key = 'prior_companies' THEN f.feature_value END) AS INTEGER) AS prior_companies,
  CAST(MAX(CASE WHEN f.feature_key = 'work_life_balance' THEN f.feature_value END) AS INTEGER) AS work_life_balance,
  CAST(MAX(CASE WHEN f.feature_key = 'years_at_company' THEN f.feature_value END) AS REAL) AS years_at_company,
  a.model_version_id AS model_version, a.data_source, a.assessed_at AS updated_at
FROM attrition_assessments a
JOIN model_versions v ON v.id = a.model_version_id
JOIN attrition_assessment_features f ON f.assessment_id = a.id
GROUP BY a.id;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_employee_insert
AFTER INSERT ON employees
BEGIN
  INSERT INTO departments(id, name) VALUES ('dept:' || LOWER(TRIM(NEW.department)), NEW.department)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO job_profiles(id, title) VALUES ('job:' || LOWER(TRIM(NEW.job_title)), NEW.job_title)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO locations(id, name) VALUES ('loc:' || LOWER(TRIM(NEW.location)), NEW.location)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO employment_assignments(
    id, employee_id, department_id, job_profile_id, location_id, manager_employee_id,
    employment_type, employment_status, effective_start, is_primary, created_at, updated_at
  ) VALUES (
    NEW.employee_id || ':v' || NEW.version, NEW.employee_id,
    'dept:' || LOWER(TRIM(NEW.department)), 'job:' || LOWER(TRIM(NEW.job_title)),
    'loc:' || LOWER(TRIM(NEW.location)),
    CASE WHEN EXISTS (SELECT 1 FROM employees WHERE employee_id = NEW.manager_id) THEN NEW.manager_id END,
    NEW.employment_type, NEW.employment_status, NEW.hire_date, 1,
    COALESCE(NEW.created_at, CURRENT_TIMESTAMP), NEW.updated_at
  ) ON CONFLICT(id) DO UPDATE SET
    department_id = excluded.department_id, job_profile_id = excluded.job_profile_id,
    location_id = excluded.location_id, manager_employee_id = excluded.manager_employee_id,
    employment_type = excluded.employment_type, employment_status = excluded.employment_status,
    effective_start = excluded.effective_start, effective_end = NULL, is_primary = 1,
    updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_employee_assignment_update
AFTER UPDATE OF department, job_title, location, manager_id, employment_type, employment_status ON employees
WHEN OLD.department IS NOT NEW.department
  OR OLD.job_title IS NOT NEW.job_title
  OR OLD.location IS NOT NEW.location
  OR OLD.manager_id IS NOT NEW.manager_id
  OR OLD.employment_type IS NOT NEW.employment_type
  OR OLD.employment_status IS NOT NEW.employment_status
BEGIN
  INSERT INTO departments(id, name) VALUES ('dept:' || LOWER(TRIM(NEW.department)), NEW.department)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO job_profiles(id, title) VALUES ('job:' || LOWER(TRIM(NEW.job_title)), NEW.job_title)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO locations(id, name) VALUES ('loc:' || LOWER(TRIM(NEW.location)), NEW.location)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  UPDATE employment_assignments
    SET effective_end = date('now'), is_primary = 0, updated_at = CURRENT_TIMESTAMP
    WHERE employee_id = NEW.employee_id AND is_primary = 1;
  INSERT INTO employment_assignments(
    id, employee_id, department_id, job_profile_id, location_id, manager_employee_id,
    employment_type, employment_status, effective_start, is_primary, created_at, updated_at
  ) VALUES (
    NEW.employee_id || ':v' || NEW.version, NEW.employee_id,
    'dept:' || LOWER(TRIM(NEW.department)), 'job:' || LOWER(TRIM(NEW.job_title)),
    'loc:' || LOWER(TRIM(NEW.location)),
    CASE WHEN EXISTS (SELECT 1 FROM employees WHERE employee_id = NEW.manager_id) THEN NEW.manager_id END,
    NEW.employment_type, NEW.employment_status, date('now'), 1,
    CURRENT_TIMESTAMP, NEW.updated_at
  ) ON CONFLICT(id) DO UPDATE SET
    department_id = excluded.department_id, job_profile_id = excluded.job_profile_id,
    location_id = excluded.location_id, manager_employee_id = excluded.manager_employee_id,
    employment_type = excluded.employment_type, employment_status = excluded.employment_status,
    effective_start = excluded.effective_start, effective_end = NULL, is_primary = 1,
    updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_employee_hire_date_correction
AFTER UPDATE OF hire_date ON employees
WHEN OLD.hire_date IS NOT NEW.hire_date
BEGIN
  UPDATE employment_assignments
  SET effective_start = NEW.hire_date, updated_at = NEW.updated_at
  WHERE id = (
    SELECT id FROM employment_assignments
    WHERE employee_id = NEW.employee_id
    ORDER BY effective_start ASC, created_at ASC
    LIMIT 1
  );
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_employee_delete
BEFORE DELETE ON employees
BEGIN
  DELETE FROM attrition_assessments WHERE employee_id = OLD.employee_id;
  DELETE FROM employee_promotions WHERE employee_id = OLD.employee_id;
  DELETE FROM employee_exits WHERE employee_id = OLD.employee_id;
  DELETE FROM course_assignments WHERE employee_id = OLD.employee_id;
  DELETE FROM leave_requests WHERE employee_id = OLD.employee_id;
  DELETE FROM employment_assignments WHERE employee_id = OLD.employee_id;
  UPDATE employment_assignments SET manager_employee_id = NULL
    WHERE manager_employee_id = OLD.employee_id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_hiring_insert
AFTER INSERT ON hiring_records
BEGIN
  INSERT INTO departments(id, name) VALUES ('dept:' || LOWER(TRIM(NEW.department)), NEW.department)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO job_profiles(id, title) VALUES ('job:' || LOWER(TRIM(NEW.position)), NEW.position)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO locations(id, name) VALUES ('loc:' || LOWER(TRIM(NEW.location)), NEW.location)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO job_requisitions(
    id, job_profile_id, department_id, location_id, opened_at, hired_at,
    source, status, data_source, updated_at
  ) VALUES (
    NEW.id, 'job:' || LOWER(TRIM(NEW.position)), 'dept:' || LOWER(TRIM(NEW.department)),
    'loc:' || LOWER(TRIM(NEW.location)), NEW.application_date, NEW.hiring_date,
    NEW.hiring_source, NEW.recruitment_status, NEW.data_source, NEW.updated_at
  ) ON CONFLICT(id) DO UPDATE SET
    job_profile_id = excluded.job_profile_id, department_id = excluded.department_id,
    location_id = excluded.location_id, opened_at = excluded.opened_at,
    hired_at = excluded.hired_at, source = excluded.source,
    status = excluded.status,
    data_source = excluded.data_source, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_hiring_update
AFTER UPDATE ON hiring_records
BEGIN
  INSERT INTO departments(id, name) VALUES ('dept:' || LOWER(TRIM(NEW.department)), NEW.department)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO job_profiles(id, title) VALUES ('job:' || LOWER(TRIM(NEW.position)), NEW.position)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO locations(id, name) VALUES ('loc:' || LOWER(TRIM(NEW.location)), NEW.location)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  UPDATE job_requisitions SET
    job_profile_id = 'job:' || LOWER(TRIM(NEW.position)),
    department_id = 'dept:' || LOWER(TRIM(NEW.department)),
    location_id = 'loc:' || LOWER(TRIM(NEW.location)),
    opened_at = NEW.application_date, hired_at = NEW.hiring_date,
    source = NEW.hiring_source,
    status = NEW.recruitment_status, data_source = NEW.data_source,
    updated_at = NEW.updated_at
  WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_hiring_delete
AFTER DELETE ON hiring_records
BEGIN
  DELETE FROM candidate_applications WHERE requisition_id = OLD.id;
  DELETE FROM job_requisitions WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_candidate_insert
AFTER INSERT ON hiring_candidates
BEGIN
  INSERT INTO talent_candidates(id, full_name, email, created_at, updated_at)
  VALUES ('candidate:' || LOWER(TRIM(NEW.email)), NEW.full_name, LOWER(TRIM(NEW.email)), NEW.created_at, NEW.updated_at)
  ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name,
    email = excluded.email, updated_at = excluded.updated_at;
  INSERT INTO candidate_applications(
    id, candidate_id, requisition_id, stage, source, applied_at, owner_email,
    next_step, next_step_due_at, notes, rejected_reason, created_at, updated_at
  ) SELECT NEW.id, 'candidate:' || LOWER(TRIM(NEW.email)), NEW.requisition_id,
    NEW.stage, NEW.source, NEW.applied_at, NEW.owner_email, NEW.next_step,
    NEW.next_step_due_at, NEW.notes, NEW.rejected_reason, NEW.created_at, NEW.updated_at
  WHERE EXISTS (SELECT 1 FROM job_requisitions WHERE id = NEW.requisition_id)
  ON CONFLICT(id) DO UPDATE SET
    candidate_id = excluded.candidate_id, requisition_id = excluded.requisition_id,
    stage = excluded.stage, source = excluded.source, applied_at = excluded.applied_at,
    owner_email = excluded.owner_email, next_step = excluded.next_step,
    next_step_due_at = excluded.next_step_due_at, notes = excluded.notes,
    rejected_reason = excluded.rejected_reason, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_candidate_update
AFTER UPDATE ON hiring_candidates
BEGIN
  INSERT INTO talent_candidates(id, full_name, email, created_at, updated_at)
  VALUES ('candidate:' || LOWER(TRIM(NEW.email)), NEW.full_name, LOWER(TRIM(NEW.email)), NEW.created_at, NEW.updated_at)
  ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name,
    email = excluded.email, updated_at = excluded.updated_at;
  UPDATE candidate_applications SET
    candidate_id = 'candidate:' || LOWER(TRIM(NEW.email)),
    requisition_id = NEW.requisition_id, stage = NEW.stage, source = NEW.source,
    applied_at = NEW.applied_at, owner_email = NEW.owner_email,
    next_step = NEW.next_step, next_step_due_at = NEW.next_step_due_at,
    notes = NEW.notes, rejected_reason = NEW.rejected_reason,
    updated_at = NEW.updated_at
  WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_candidate_delete
AFTER DELETE ON hiring_candidates
BEGIN
  DELETE FROM candidate_applications WHERE id = OLD.id;
  DELETE FROM talent_candidates
    WHERE id = 'candidate:' || LOWER(TRIM(OLD.email))
      AND NOT EXISTS (
        SELECT 1 FROM candidate_applications
        WHERE candidate_id = 'candidate:' || LOWER(TRIM(OLD.email))
      );
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_leave_insert
AFTER INSERT ON leave_records
BEGIN
  INSERT INTO leave_types(id, name, is_paid)
  VALUES (
    'leave:' || LOWER(TRIM(NEW.leave_type)), NEW.leave_type,
    CASE WHEN LOWER(NEW.leave_type) = 'unpaid' THEN 0 ELSE 1 END
  ) ON CONFLICT(id) DO UPDATE SET name = excluded.name;
  INSERT INTO leave_requests(
    id, employee_id, leave_type_id, start_date, end_date, leave_days,
    status, requested_at, data_source, updated_at
  ) SELECT NEW.id, NEW.employee_id, 'leave:' || LOWER(TRIM(NEW.leave_type)),
    NEW.start_date, NEW.end_date, NEW.leave_days, NEW.approval_status,
    NEW.updated_at, NEW.data_source, NEW.updated_at
  WHERE EXISTS (SELECT 1 FROM employees WHERE employee_id = NEW.employee_id)
  ON CONFLICT(id) DO UPDATE SET
    employee_id = excluded.employee_id, leave_type_id = excluded.leave_type_id,
    start_date = excluded.start_date, end_date = excluded.end_date,
    leave_days = excluded.leave_days, status = excluded.status,
    data_source = excluded.data_source, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_leave_update
AFTER UPDATE ON leave_records
BEGIN
  INSERT INTO leave_types(id, name, is_paid)
  VALUES (
    'leave:' || LOWER(TRIM(NEW.leave_type)), NEW.leave_type,
    CASE WHEN LOWER(NEW.leave_type) = 'unpaid' THEN 0 ELSE 1 END
  ) ON CONFLICT(id) DO UPDATE SET name = excluded.name;
  UPDATE leave_requests SET
    employee_id = NEW.employee_id,
    leave_type_id = 'leave:' || LOWER(TRIM(NEW.leave_type)),
    start_date = NEW.start_date, end_date = NEW.end_date,
    leave_days = NEW.leave_days, status = NEW.approval_status,
    decided_at = CASE WHEN LOWER(NEW.approval_status) <> 'pending' THEN CURRENT_TIMESTAMP END,
    data_source = NEW.data_source, updated_at = NEW.updated_at
  WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_leave_delete
AFTER DELETE ON leave_records
BEGIN
  DELETE FROM leave_requests WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_training_insert
AFTER INSERT ON training_records
BEGIN
  INSERT INTO learning_courses(id, title, default_duration_hours, is_mandatory)
  VALUES (
    'course:' || LOWER(TRIM(NEW.training_program)), NEW.training_program,
    NEW.training_hours,
    CASE WHEN LOWER(NEW.training_program) LIKE '%security%'
      OR LOWER(NEW.training_program) LIKE '%privacy%'
      OR LOWER(NEW.training_program) LIKE '%safety%'
      OR LOWER(NEW.training_program) LIKE '%soc 2%' THEN 1 ELSE 0 END
  ) ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    default_duration_hours = MAX(learning_courses.default_duration_hours, excluded.default_duration_hours),
    is_mandatory = MAX(learning_courses.is_mandatory, excluded.is_mandatory),
    updated_at = CURRENT_TIMESTAMP;
  INSERT INTO course_assignments(
    id, course_id, employee_id, assigned_at, status, completed_at,
    assessment_score, assigned_hours, data_source, updated_at
  ) SELECT NEW.id, 'course:' || LOWER(TRIM(NEW.training_program)), NEW.employee_id,
    NEW.updated_at, NEW.completion_status, NEW.completion_date,
    NEW.assessment_score, NEW.training_hours, NEW.data_source, NEW.updated_at
  WHERE EXISTS (SELECT 1 FROM employees WHERE employee_id = NEW.employee_id)
  ON CONFLICT(id) DO UPDATE SET
    course_id = excluded.course_id, employee_id = excluded.employee_id,
    status = excluded.status, completed_at = excluded.completed_at,
    assessment_score = excluded.assessment_score,
    assigned_hours = excluded.assigned_hours, data_source = excluded.data_source,
    updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_training_update
AFTER UPDATE ON training_records
BEGIN
  INSERT INTO learning_courses(id, title, default_duration_hours, is_mandatory)
  VALUES (
    'course:' || LOWER(TRIM(NEW.training_program)), NEW.training_program,
    NEW.training_hours,
    CASE WHEN LOWER(NEW.training_program) LIKE '%security%'
      OR LOWER(NEW.training_program) LIKE '%privacy%'
      OR LOWER(NEW.training_program) LIKE '%safety%'
      OR LOWER(NEW.training_program) LIKE '%soc 2%' THEN 1 ELSE 0 END
  ) ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    default_duration_hours = MAX(learning_courses.default_duration_hours, excluded.default_duration_hours),
    is_mandatory = MAX(learning_courses.is_mandatory, excluded.is_mandatory),
    updated_at = CURRENT_TIMESTAMP;
  UPDATE course_assignments SET
    course_id = 'course:' || LOWER(TRIM(NEW.training_program)),
    employee_id = NEW.employee_id, status = NEW.completion_status,
    completed_at = NEW.completion_date, assessment_score = NEW.assessment_score,
    assigned_hours = NEW.training_hours, data_source = NEW.data_source,
    updated_at = NEW.updated_at
  WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_training_delete
AFTER DELETE ON training_records
BEGIN
  DELETE FROM course_assignments WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_training_workflow_insert
AFTER INSERT ON workflow_requests
WHEN NEW.type = 'training'
BEGIN
  UPDATE course_assignments SET
    assigned_at = COALESCE(NEW.created_at, assigned_at),
    due_date = json_extract(NEW.details_json, '$.dueDate'),
    updated_at = NEW.updated_at
  WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_training_workflow_update
AFTER UPDATE OF details_json, status, updated_at ON workflow_requests
WHEN NEW.type = 'training'
BEGIN
  UPDATE course_assignments SET
    due_date = json_extract(NEW.details_json, '$.dueDate'),
    updated_at = NEW.updated_at
  WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_attrition_insert
AFTER INSERT ON attrition_events
BEGIN
  INSERT INTO departments(id, name)
  VALUES ('dept:' || LOWER(TRIM(NEW.department)), NEW.department)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO exit_reasons(id, name)
  VALUES ('exit:' || LOWER(TRIM(NEW.exit_reason)), NEW.exit_reason)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name;
  INSERT INTO employee_exits(
    id, employee_id, exit_date, exit_reason_id, exit_type, department_id,
    data_source, updated_at
  ) SELECT NEW.id, NEW.employee_id, NEW.exit_date,
    'exit:' || LOWER(TRIM(NEW.exit_reason)), NEW.exit_type,
    'dept:' || LOWER(TRIM(NEW.department)),
    NEW.data_source, NEW.updated_at
  WHERE EXISTS (SELECT 1 FROM employees WHERE employee_id = NEW.employee_id)
  ON CONFLICT(id) DO UPDATE SET
    employee_id = excluded.employee_id, exit_date = excluded.exit_date,
    exit_reason_id = excluded.exit_reason_id, exit_type = excluded.exit_type,
    department_id = excluded.department_id,
    data_source = excluded.data_source, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_attrition_update
AFTER UPDATE ON attrition_events
BEGIN
  INSERT INTO departments(id, name)
  VALUES ('dept:' || LOWER(TRIM(NEW.department)), NEW.department)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO exit_reasons(id, name)
  VALUES ('exit:' || LOWER(TRIM(NEW.exit_reason)), NEW.exit_reason)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name;
  UPDATE employee_exits SET
    employee_id = NEW.employee_id, exit_date = NEW.exit_date,
    exit_reason_id = 'exit:' || LOWER(TRIM(NEW.exit_reason)),
    exit_type = NEW.exit_type, department_id = 'dept:' || LOWER(TRIM(NEW.department)),
    data_source = NEW.data_source,
    updated_at = NEW.updated_at
  WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_attrition_delete
AFTER DELETE ON attrition_events
BEGIN
  DELETE FROM employee_exits WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_promotion_insert
AFTER INSERT ON promotion_records
BEGIN
  INSERT INTO departments(id, name)
  VALUES ('dept:' || LOWER(TRIM(NEW.department)), NEW.department)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO job_profiles(id, title)
  VALUES ('job:' || LOWER(TRIM(NEW.previous_title)), NEW.previous_title)
  ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO job_profiles(id, title)
  VALUES ('job:' || LOWER(TRIM(NEW.new_title)), NEW.new_title)
  ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO employee_promotions(
    id, employee_id, previous_job_profile_id, new_job_profile_id,
    department_id, promotion_date,
    data_source, updated_at
  ) SELECT NEW.id, NEW.employee_id,
    'job:' || LOWER(TRIM(NEW.previous_title)), 'job:' || LOWER(TRIM(NEW.new_title)),
    'dept:' || LOWER(TRIM(NEW.department)), NEW.promotion_date,
    NEW.data_source, NEW.updated_at
  WHERE EXISTS (SELECT 1 FROM employees WHERE employee_id = NEW.employee_id)
  ON CONFLICT(id) DO UPDATE SET
    employee_id = excluded.employee_id,
    previous_job_profile_id = excluded.previous_job_profile_id,
    new_job_profile_id = excluded.new_job_profile_id,
    department_id = excluded.department_id, promotion_date = excluded.promotion_date,
    data_source = excluded.data_source, updated_at = excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_promotion_update
AFTER UPDATE ON promotion_records
BEGIN
  INSERT INTO departments(id, name)
  VALUES ('dept:' || LOWER(TRIM(NEW.department)), NEW.department)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO job_profiles(id, title)
  VALUES ('job:' || LOWER(TRIM(NEW.previous_title)), NEW.previous_title)
  ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP;
  INSERT INTO job_profiles(id, title)
  VALUES ('job:' || LOWER(TRIM(NEW.new_title)), NEW.new_title)
  ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP;
  UPDATE employee_promotions SET
    employee_id = NEW.employee_id,
    previous_job_profile_id = 'job:' || LOWER(TRIM(NEW.previous_title)),
    new_job_profile_id = 'job:' || LOWER(TRIM(NEW.new_title)),
    department_id = 'dept:' || LOWER(TRIM(NEW.department)),
    promotion_date = NEW.promotion_date,
    data_source = NEW.data_source, updated_at = NEW.updated_at
  WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_promotion_delete
AFTER DELETE ON promotion_records
BEGIN
  DELETE FROM employee_promotions WHERE id = OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_model_profile_insert
AFTER INSERT ON attrition_model_profiles
WHEN EXISTS (SELECT 1 FROM employees WHERE employee_id = NEW.employee_id)
BEGIN
  INSERT OR IGNORE INTO model_versions(id, model_name, algorithm, review_threshold, evaluation_window_days, intended_use, prohibited_use)
  VALUES (NEW.model_version, 'Historical attrition benchmark', 'Runtime model; see version metadata', 0.20, 365,
    'Qualified human review of aggregate patterns and synthetic validation profiles.',
    'Automated employment decisions, resignation timing, or causal claims.');
  INSERT INTO attrition_assessments(
    id, employee_id, model_version_id, risk_score, data_source, assessed_at
  ) SELECT NEW.employee_id || ':' || NEW.model_version, NEW.employee_id,
    NEW.model_version, NEW.risk_score, NEW.data_source, NEW.updated_at
  WHERE EXISTS (SELECT 1 FROM employees WHERE employee_id = NEW.employee_id)
  ON CONFLICT(id) DO UPDATE SET
    risk_score = excluded.risk_score, data_source = excluded.data_source,
    assessed_at = excluded.assessed_at;
  INSERT OR REPLACE INTO attrition_assessment_features(
    assessment_id, feature_key, feature_value, contribution_rank, explanation
  ) SELECT NEW.employee_id || ':' || NEW.model_version, 'monthly_income', CAST(NEW.monthly_income AS TEXT),
    CASE WHEN LOWER(NEW.top_driver) LIKE '%income%' OR LOWER(NEW.top_driver) LIKE '%compensation%' THEN 1 END,
    CASE WHEN LOWER(NEW.top_driver) LIKE '%income%' OR LOWER(NEW.top_driver) LIKE '%compensation%' THEN NEW.top_driver END
    WHERE EXISTS (SELECT 1 FROM attrition_assessments WHERE id = NEW.employee_id || ':' || NEW.model_version);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'distance_from_home', CAST(NEW.distance_from_home AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%distance%' OR LOWER(NEW.top_driver) LIKE '%commute%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%distance%' OR LOWER(NEW.top_driver) LIKE '%commute%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'education_level', CAST(NEW.education_level AS TEXT), NULL, NULL, NULL);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'education_field', NEW.education_field, NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%education%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%education%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'environment_satisfaction', CAST(NEW.environment_satisfaction AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%environment%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%environment%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'job_satisfaction', CAST(NEW.job_satisfaction AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%job satisfaction%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%job satisfaction%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'prior_companies', CAST(NEW.prior_companies AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%prior compan%' OR LOWER(NEW.top_driver) LIKE '%companies worked%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%prior compan%' OR LOWER(NEW.top_driver) LIKE '%companies worked%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'work_life_balance', CAST(NEW.work_life_balance AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%work-life%' OR LOWER(NEW.top_driver) LIKE '%work life%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%work-life%' OR LOWER(NEW.top_driver) LIKE '%work life%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'years_at_company', CAST(NEW.years_at_company AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%tenure%' OR LOWER(NEW.top_driver) LIKE '%years at company%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%tenure%' OR LOWER(NEW.top_driver) LIKE '%years at company%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features
    SELECT NEW.employee_id || ':' || NEW.model_version, 'department', department, NULL,
      CASE WHEN LOWER(NEW.top_driver) LIKE '%department%' THEN 1 END,
      CASE WHEN LOWER(NEW.top_driver) LIKE '%department%' THEN NEW.top_driver END
    FROM employees WHERE employee_id = NEW.employee_id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_model_profile_update
AFTER UPDATE ON attrition_model_profiles
WHEN EXISTS (SELECT 1 FROM employees WHERE employee_id = NEW.employee_id)
BEGIN
  DELETE FROM attrition_assessment_features
    WHERE assessment_id = OLD.employee_id || ':' || OLD.model_version;
  DELETE FROM attrition_assessments
    WHERE id = OLD.employee_id || ':' || OLD.model_version;
  INSERT OR IGNORE INTO model_versions(id, model_name, algorithm, review_threshold, evaluation_window_days, intended_use, prohibited_use)
  VALUES (NEW.model_version, 'Historical attrition benchmark', 'Runtime model; see version metadata', 0.20, 365,
    'Qualified human review of aggregate patterns and synthetic validation profiles.',
    'Automated employment decisions, resignation timing, or causal claims.');
  INSERT INTO attrition_assessments(
    id, employee_id, model_version_id, risk_score, data_source, assessed_at
  ) SELECT NEW.employee_id || ':' || NEW.model_version, NEW.employee_id,
    NEW.model_version, NEW.risk_score, NEW.data_source, NEW.updated_at
  WHERE EXISTS (SELECT 1 FROM employees WHERE employee_id = NEW.employee_id);
  INSERT OR REPLACE INTO attrition_assessment_features(
    assessment_id, feature_key, feature_value, contribution_rank, explanation
  ) SELECT NEW.employee_id || ':' || NEW.model_version, 'monthly_income', CAST(NEW.monthly_income AS TEXT),
    CASE WHEN LOWER(NEW.top_driver) LIKE '%income%' OR LOWER(NEW.top_driver) LIKE '%compensation%' THEN 1 END,
    CASE WHEN LOWER(NEW.top_driver) LIKE '%income%' OR LOWER(NEW.top_driver) LIKE '%compensation%' THEN NEW.top_driver END
    WHERE EXISTS (SELECT 1 FROM attrition_assessments WHERE id = NEW.employee_id || ':' || NEW.model_version);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'distance_from_home', CAST(NEW.distance_from_home AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%distance%' OR LOWER(NEW.top_driver) LIKE '%commute%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%distance%' OR LOWER(NEW.top_driver) LIKE '%commute%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'education_level', CAST(NEW.education_level AS TEXT), NULL, NULL, NULL);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'education_field', NEW.education_field, NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%education%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%education%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'environment_satisfaction', CAST(NEW.environment_satisfaction AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%environment%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%environment%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'job_satisfaction', CAST(NEW.job_satisfaction AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%job satisfaction%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%job satisfaction%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'prior_companies', CAST(NEW.prior_companies AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%prior compan%' OR LOWER(NEW.top_driver) LIKE '%companies worked%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%prior compan%' OR LOWER(NEW.top_driver) LIKE '%companies worked%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'work_life_balance', CAST(NEW.work_life_balance AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%work-life%' OR LOWER(NEW.top_driver) LIKE '%work life%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%work-life%' OR LOWER(NEW.top_driver) LIKE '%work life%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features VALUES (NEW.employee_id || ':' || NEW.model_version, 'years_at_company', CAST(NEW.years_at_company AS TEXT), NULL, CASE WHEN LOWER(NEW.top_driver) LIKE '%tenure%' OR LOWER(NEW.top_driver) LIKE '%years at company%' THEN 1 END, CASE WHEN LOWER(NEW.top_driver) LIKE '%tenure%' OR LOWER(NEW.top_driver) LIKE '%years at company%' THEN NEW.top_driver END);
  INSERT OR REPLACE INTO attrition_assessment_features
    SELECT NEW.employee_id || ':' || NEW.model_version, 'department', department, NULL,
      CASE WHEN LOWER(NEW.top_driver) LIKE '%department%' THEN 1 END,
      CASE WHEN LOWER(NEW.top_driver) LIKE '%department%' THEN NEW.top_driver END
    FROM employees WHERE employee_id = NEW.employee_id;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS normalize_model_profile_delete
AFTER DELETE ON attrition_model_profiles
BEGIN
  DELETE FROM attrition_assessment_features
    WHERE assessment_id = OLD.employee_id || ':' || OLD.model_version;
  DELETE FROM attrition_assessments
    WHERE id = OLD.employee_id || ':' || OLD.model_version;
END;
--> statement-breakpoint
PRAGMA optimize;
