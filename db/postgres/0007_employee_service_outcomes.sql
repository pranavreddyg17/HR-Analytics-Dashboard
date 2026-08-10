ALTER TABLE employee_cases ADD COLUMN IF NOT EXISTS resolution_note TEXT;
--> statement-breakpoint
ALTER TABLE employee_cases ADD COLUMN IF NOT EXISTS resolved_by_email TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS employee_cases_assignee_status_idx
  ON employee_cases(assigned_to_email, status, submitted_at DESC);
