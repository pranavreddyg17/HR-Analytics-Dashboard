import type { OnboardingJoiner, OnboardingOperations } from "@/lib/onboarding-types"
import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

type OnboardingRow = {
  employee_id: string
  name: string
  work_email: string | null
  department: string
  job_title: string
  location: string
  manager: string
  manager_id: string | null
  hire_date: string
  submission_id: string | null
  submission_status: string | null
  workflow_due_at: string | null
  workflow_status: string | null
}

export async function listOnboardingOperations(actor: RequestActor): Promise<OnboardingOperations> {
  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Your role cannot view onboarding operations.", 403)
  const database = await ensureHrDatabase()
  const actorEmployee = actor.role === "manager"
    ? await database.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL").bind(actor.email).first<{ employee_id: string }>()
    : null
  const managerSql = actor.role === "manager" ? "AND e.manager_id=?" : ""
  const rows = await database.prepare(`
    SELECT e.employee_id,
      TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS name,
      e.work_email, e.department, e.job_title, e.location, e.manager, e.manager_id, e.hire_date,
      s.id AS submission_id, s.status AS submission_status,
      w.due_at AS workflow_due_at, w.status AS workflow_status
    FROM employee_directory_view e
    LEFT JOIN LATERAL (
      SELECT id, status FROM employee_onboarding_submissions
      WHERE employee_id=e.employee_id ORDER BY created_at DESC LIMIT 1
    ) s ON TRUE
    LEFT JOIN workflow_requests w ON w.source_entity_type='employee_onboarding_submission'
      AND w.source_entity_id=s.id AND w.type='employee_onboarding'
    WHERE e.archived_at IS NULL AND LOWER(e.employment_status)='preboarding' ${managerSql}
    ORDER BY e.hire_date, e.last_name, e.first_name
    LIMIT 500
  `).bind(...(actor.role === "manager" ? [actorEmployee?.employee_id ?? ""] : [])).all<OnboardingRow>()
  const today = new Date().toISOString().slice(0, 10)
  const horizon = new Date(`${today}T12:00:00Z`)
  horizon.setUTCDate(horizon.getUTCDate() + 30)
  const horizonDate = horizon.toISOString().slice(0, 10)
  const joiners: OnboardingJoiner[] = (rows.results ?? []).map((row) => {
    const submissionStatus = row.submission_status?.toLowerCase()
    const verificationStatus: OnboardingJoiner["verificationStatus"] = submissionStatus === "submitted"
      ? "Verification"
      : submissionStatus === "approved" ? "Ready" : "Profile setup"
    const nextAction = verificationStatus === "Verification"
      ? "Verify the submitted employment details."
      : !row.manager_id ? "Assign a manager before the start date."
        : verificationStatus === "Profile setup" ? "Complete the employee profile and start-date handoff." : "Confirm manager and first-week readiness."
    return {
      employeeId: row.employee_id,
      name: row.name,
      workEmail: row.work_email,
      department: row.department,
      jobTitle: row.job_title,
      location: row.location,
      manager: row.manager,
      managerId: row.manager_id,
      startDate: row.hire_date,
      verificationStatus,
      submissionId: row.submission_id,
      dueDate: row.workflow_due_at?.slice(0, 10) ?? null,
      nextAction,
      reviewHref: row.submission_id && verificationStatus === "Verification"
        ? `/inbox?view=decisions&type=onboarding&item=${encodeURIComponent(row.submission_id)}&returnTo=${encodeURIComponent("/onboarding")}`
        : `/people/${encodeURIComponent(row.employee_id)}?returnTo=${encodeURIComponent("/onboarding")}`,
    }
  })
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      preboarding: joiners.length,
      awaitingVerification: joiners.filter((row) => row.verificationStatus === "Verification").length,
      startingNext30Days: joiners.filter((row) => row.startDate >= today && row.startDate <= horizonDate).length,
      missingManager: joiners.filter((row) => !row.managerId).length,
    },
    joiners,
  }
}
