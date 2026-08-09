CREATE TABLE IF NOT EXISTS capability_skills (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS job_profile_skill_requirements (
  job_profile_id TEXT NOT NULL REFERENCES job_profiles(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES capability_skills(id) ON DELETE CASCADE,
  required_level SMALLINT NOT NULL DEFAULT 2 CHECK (required_level BETWEEN 1 AND 5),
  priority SMALLINT NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  source TEXT NOT NULL DEFAULT 'workforce_plan',
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(job_profile_id, skill_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS course_skill_coverage (
  course_id TEXT NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES capability_skills(id) ON DELETE CASCADE,
  proficiency_level SMALLINT NOT NULL DEFAULT 2 CHECK (proficiency_level BETWEEN 1 AND 5),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(course_id, skill_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS job_profile_skill_priority_idx
  ON job_profile_skill_requirements(skill_id, priority, job_profile_id);
--> statement-breakpoint
ALTER TABLE learning_assignment_campaigns DROP CONSTRAINT IF EXISTS learning_assignment_campaigns_target_type_check;
--> statement-breakpoint
ALTER TABLE learning_assignment_campaigns ADD CONSTRAINT learning_assignment_campaigns_target_type_check
  CHECK (target_type IN ('employee', 'department', 'job_title', 'job_level', 'manager_team', 'job_profile'));
--> statement-breakpoint
INSERT INTO capability_skills(id, organization_id, name, category) VALUES
  ('skill:security-privacy', 'org:laidbackhr', 'Security and privacy', 'Risk'),
  ('skill:responsible-ai', 'org:laidbackhr', 'Responsible AI', 'Data and AI'),
  ('skill:cloud-platform', 'org:laidbackhr', 'Cloud platform engineering', 'Engineering'),
  ('skill:software-quality', 'org:laidbackhr', 'Software quality and reliability', 'Engineering'),
  ('skill:data-literacy', 'org:laidbackhr', 'Data literacy', 'Data and AI'),
  ('skill:customer-commercial', 'org:laidbackhr', 'Customer and commercial practice', 'Commercial'),
  ('skill:people-leadership', 'org:laidbackhr', 'People leadership', 'Leadership'),
  ('skill:accessible-products', 'org:laidbackhr', 'Accessible product delivery', 'Product')
ON CONFLICT(organization_id, name) DO NOTHING;
--> statement-breakpoint
INSERT INTO job_profile_skill_requirements(job_profile_id, skill_id, required_level, priority, source)
SELECT j.id, 'skill:security-privacy', 2, 3, 'security_baseline'
FROM job_profiles j WHERE j.organization_id='org:laidbackhr'
ON CONFLICT(job_profile_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO job_profile_skill_requirements(job_profile_id, skill_id, required_level, priority, source)
SELECT j.id, 'skill:cloud-platform', 2, 2, 'role_profile'
FROM job_profiles j
WHERE j.organization_id='org:laidbackhr' AND (j.department_name ~* 'research|development|engineering|technology' OR j.title ~* 'engineer|developer|architect|technical|cloud|platform')
ON CONFLICT(job_profile_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO job_profile_skill_requirements(job_profile_id, skill_id, required_level, priority, source)
SELECT j.id, 'skill:software-quality', 2, 2, 'role_profile'
FROM job_profiles j
WHERE j.organization_id='org:laidbackhr' AND j.title ~* 'engineer|developer|architect|qa|quality|research'
ON CONFLICT(job_profile_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO job_profile_skill_requirements(job_profile_id, skill_id, required_level, priority, source)
SELECT j.id, 'skill:data-literacy', 2, 2, 'role_profile'
FROM job_profiles j
WHERE j.organization_id='org:laidbackhr' AND (j.title ~* 'analyst|research|product|operations|manager|director' OR j.department_name ~* 'human resources')
ON CONFLICT(job_profile_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO job_profile_skill_requirements(job_profile_id, skill_id, required_level, priority, source)
SELECT j.id, 'skill:customer-commercial', 2, 2, 'role_profile'
FROM job_profiles j
WHERE j.organization_id='org:laidbackhr' AND (j.department_name ~* 'sales|customer' OR j.title ~* 'account|sales|customer|solution')
ON CONFLICT(job_profile_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO job_profile_skill_requirements(job_profile_id, skill_id, required_level, priority, source)
SELECT j.id, 'skill:people-leadership', 2, 2, 'role_profile'
FROM job_profiles j
WHERE j.organization_id='org:laidbackhr' AND (j.job_level IN ('Manager','Director','Executive') OR j.title ~* 'manager|director|lead|head|chief|vice president')
ON CONFLICT(job_profile_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO job_profile_skill_requirements(job_profile_id, skill_id, required_level, priority, source)
SELECT j.id, 'skill:responsible-ai', 2, 2, 'technology_baseline'
FROM job_profiles j
WHERE j.organization_id='org:laidbackhr' AND (j.department_name ~* 'research|development|technology' OR j.title ~* 'data|ai|analyst|research|product|engineer')
ON CONFLICT(job_profile_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO course_skill_coverage(course_id, skill_id, proficiency_level)
SELECT c.id, 'skill:security-privacy', 2 FROM learning_courses c
WHERE c.title ~* 'security|privacy|secure|soc 2|incident|data handling'
ON CONFLICT(course_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO course_skill_coverage(course_id, skill_id, proficiency_level)
SELECT c.id, 'skill:responsible-ai', 2 FROM learning_courses c
WHERE c.title ~* 'responsible ai|generative ai|genai|machine learning|ai '
ON CONFLICT(course_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO course_skill_coverage(course_id, skill_id, proficiency_level)
SELECT c.id, 'skill:cloud-platform', 2 FROM learning_courses c
WHERE c.title ~* 'cloud|kubernetes|platform|reliability'
ON CONFLICT(course_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO course_skill_coverage(course_id, skill_id, proficiency_level)
SELECT c.id, 'skill:software-quality', 2 FROM learning_courses c
WHERE c.title ~* 'secure coding|reliability|quality|testing|incident response'
ON CONFLICT(course_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO course_skill_coverage(course_id, skill_id, proficiency_level)
SELECT c.id, 'skill:data-literacy', 2 FROM learning_courses c
WHERE c.title ~* 'analytics|data|research quality'
ON CONFLICT(course_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO course_skill_coverage(course_id, skill_id, proficiency_level)
SELECT c.id, 'skill:customer-commercial', 2 FROM learning_courses c
WHERE c.title ~* 'selling|sales|crm|customer|product analytics'
ON CONFLICT(course_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO course_skill_coverage(course_id, skill_id, proficiency_level)
SELECT c.id, 'skill:people-leadership', 2 FROM learning_courses c
WHERE c.title ~* 'manager|leadership|interviewing|coaching'
ON CONFLICT(course_id, skill_id) DO NOTHING;
--> statement-breakpoint
INSERT INTO course_skill_coverage(course_id, skill_id, proficiency_level)
SELECT c.id, 'skill:accessible-products', 2 FROM learning_courses c
WHERE c.title ~* 'accessibility|accessible'
ON CONFLICT(course_id, skill_id) DO NOTHING;
