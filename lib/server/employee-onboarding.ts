import { z } from "zod"

import { ensureHrDatabase, type Database } from "@/lib/server/hr-repository"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

const onboardingSchema = z.object({
  organizationName: z.string().trim().min(2).max(160),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  preferredName: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  department: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().min(2).max(160),
  jobLevel: z.string().trim().min(2).max(80),
  location: z.string().trim().min(2).max(120),
  managerName: z.string().trim().max(160).optional().default(""),
  managerEmail: z.union([z.literal(""), z.string().trim().email()]).optional().default(""),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employmentType: z.enum(["Full-time", "Part-time", "Contract", "Intern"]),
  annualSalary: z.number().min(0).max(10_000_000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD"),
})

async function database(): Promise<Database> {
  const db = await ensureHrDatabase()
  if (!db) throw new PeopleError("Employee onboarding is unavailable.", 503)
  return db
}

export type EmployeeOnboardingState = {
  required: boolean
  status: "required" | "submitted" | "rejected" | "complete"
  submission: Record<string, unknown> | null
}

export async function getEmployeeOnboardingState(actor: RequestActor): Promise<EmployeeOnboardingState> {
  const db = await database()
  const user = await db.prepare(`
    SELECT u.employee_id, u.onboarding_status,
      s.id AS submission_id, s.status AS submission_status, s.organization_name,
      s.first_name, s.last_name, s.preferred_name, s.phone, s.department, s.job_title,
      s.job_level, s.location, s.manager_name, s.manager_email, s.hire_date,
      s.employment_type, s.requested_annual_salary, s.salary_currency, s.review_note
    FROM app_users u
    LEFT JOIN employee_onboarding_submissions s ON s.user_email=u.email
    WHERE u.email=?
    ORDER BY s.created_at DESC LIMIT 1
  `).bind(actor.email).first<Record<string, unknown>>()
  if (!user) throw new PeopleError("Your sign-in account could not be loaded.", 404)
  if (user.employee_id && String(user.onboarding_status) !== "submitted") return { required: false, status: "complete", submission: null }
  const submissionStatus = String(user.submission_status ?? "")
  return {
    required: true,
    status: submissionStatus === "submitted" ? "submitted" : submissionStatus === "rejected" ? "rejected" : "required",
    submission: user.submission_id ? user : null,
  }
}

export async function submitEmployeeOnboarding(value: unknown, actor: RequestActor) {
  const input = onboardingSchema.parse(value)
  const db = await database()
  const state = await getEmployeeOnboardingState(actor)
  if (!state.required) throw new PeopleError("Your account is already linked to an employee profile.", 409)
  if (state.status === "submitted") throw new PeopleError("Your onboarding profile has already been submitted.", 409)

  const existingEmail = await db.prepare("SELECT employee_id FROM employees WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL")
    .bind(actor.email).first<{ employee_id: string }>()
  if (existingEmail) {
    await db.prepare("UPDATE app_users SET employee_id=?, onboarding_status='complete', updated_at=CURRENT_TIMESTAMP WHERE email=?")
      .bind(existingEmail.employee_id, actor.email).run()
    return { employeeId: existingEmail.employee_id, status: "complete", message: "Your existing employee profile was linked." }
  }

  const employeeId = `EMP-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const submissionId = `ONB-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const jobProfileId = `JOB-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const manager = input.managerEmail
    ? await db.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL")
      .bind(input.managerEmail).first<{ employee_id: string }>()
    : null
  const details = JSON.stringify({ submissionId, organizationName: input.organizationName, department: input.department, jobTitle: input.jobTitle, jobLevel: input.jobLevel })

  await db.batch([
    db.prepare(`
      INSERT INTO job_profiles(id, organization_id, department_name, title, job_level)
      VALUES (?, 'org:laidbackhr', ?, ?, ?)
      ON CONFLICT(organization_id, department_name, title, job_level) DO NOTHING
    `).bind(jobProfileId, input.department, input.jobTitle, input.jobLevel),
    db.prepare(`
      INSERT INTO employees(employee_id, first_name, last_name, preferred_name, work_email, phone,
        location, manager_id, hire_date, employment_type,
        employment_status, data_source, organization_id, job_profile_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Preboarding', 'self_service',
        'org:laidbackhr', COALESCE((SELECT id FROM job_profiles WHERE organization_id='org:laidbackhr' AND department_name=? AND title=? AND job_level=? LIMIT 1), ?))
    `).bind(employeeId, input.firstName, input.lastName, input.preferredName || null, actor.email, input.phone || null,
      input.location, manager?.employee_id ?? null, input.hireDate, input.employmentType,
      input.department, input.jobTitle, input.jobLevel, jobProfileId),
    db.prepare(`
      INSERT INTO employee_onboarding_submissions(id, user_email, employee_id, organization_name,
        first_name, last_name, preferred_name, phone, department, job_title, job_level, location,
        manager_name, manager_email, hire_date, employment_type, requested_annual_salary,
        salary_currency, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')
    `).bind(submissionId, actor.email, employeeId, input.organizationName, input.firstName, input.lastName,
      input.preferredName || null, input.phone || null, input.department, input.jobTitle, input.jobLevel,
      input.location, input.managerName || null, input.managerEmail || null, input.hireDate,
      input.employmentType, input.annualSalary, input.currency),
    db.prepare("UPDATE app_users SET employee_id=?, onboarding_status='submitted', organization_id='org:laidbackhr', updated_at=CURRENT_TIMESTAMP WHERE email=?")
      .bind(employeeId, actor.email),
    db.prepare(`
      INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json,
        requested_by_email, priority, owner_email, due_at, next_action, source_entity_type,
        source_entity_id, assigned_at, confidentiality_level)
      VALUES (?, 'employee_onboarding', ?, 'Verify employee onboarding', 'Submitted', ?, ?, 'medium',
        'people-ops@laidbackhr.cloud', (CURRENT_DATE + INTERVAL '3 days')::date::text,
        'Verify organization, reporting line, job profile, and compensation.',
        'employee_onboarding_submission', ?, CURRENT_TIMESTAMP, 'restricted')
    `).bind(submissionId, employeeId, details, actor.email, submissionId),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'employee_onboarding_submitted', 'Employee onboarding profile submitted', ?, ?)")
      .bind(crypto.randomUUID(), employeeId, details, actor.email),
  ])
  return { employeeId, status: "submitted", message: "Your profile was saved. People Operations will verify the employment details." }
}
