import type { OnboardingJoiner, OnboardingOperations } from "@/lib/onboarding-types"
import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

export type OnboardingPersistenceRow = {
  employee_id: string
  name: string
  work_email: string | null
  department: string
  job_title: string
  location: string
  manager: string
  manager_id: string | null
  hire_date: string | Date
  submission_id: string | null
  submission_status: string | null
  workflow_due_at: string | Date | null
}

const transientPostgresCodes = new Set(["08000", "08001", "08003", "08006", "08007", "08P01", "53300", "57P01", "57P02", "57P03"])

export class OnboardingUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The new-joiner register is temporarily unavailable.", { cause })
    this.name = "OnboardingUnavailableError"
  }
}

function dateOnly(value: string | Date | null | undefined): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null
  const text = String(value ?? "").trim()
  if (!text) return null
  const direct = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (direct) return direct
  const parsed = new Date(text)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null
}

function isTransientDatabaseError(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown }
  if (transientPostgresCodes.has(String(candidate?.code ?? ""))) return true
  return /connection terminated|connection timeout|timeout expired|econnreset|etimedout|server closed the connection/i.test(String(candidate?.message ?? ""))
}

async function retryTransientRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (!isTransientDatabaseError(error)) throw error
    await new Promise((resolve) => setTimeout(resolve, 150))
    try {
      return await read()
    } catch (retryError) {
      if (isTransientDatabaseError(retryError)) throw new OnboardingUnavailableError(retryError)
      throw retryError
    }
  }
}

export function buildOnboardingOperations(rows: OnboardingPersistenceRow[], now = new Date()): OnboardingOperations {
  const today = now.toISOString().slice(0, 10)
  const horizon = new Date(`${today}T12:00:00Z`)
  horizon.setUTCDate(horizon.getUTCDate() + 30)
  const horizonDate = horizon.toISOString().slice(0, 10)
  const joiners: OnboardingJoiner[] = rows.map((row) => {
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
      startDate: dateOnly(row.hire_date) ?? "",
      verificationStatus,
      submissionId: row.submission_id,
      dueDate: dateOnly(row.workflow_due_at),
      nextAction,
      reviewHref: row.submission_id && verificationStatus === "Verification"
        ? `/inbox?view=decisions&type=onboarding&item=${encodeURIComponent(row.submission_id)}&returnTo=${encodeURIComponent("/onboarding")}`
        : `/people/${encodeURIComponent(row.employee_id)}?returnTo=${encodeURIComponent("/onboarding")}`,
    }
  })
  return {
    generatedAt: now.toISOString(),
    summary: {
      preboarding: joiners.length,
      awaitingVerification: joiners.filter((row) => row.verificationStatus === "Verification").length,
      startingNext30Days: joiners.filter((row) => Boolean(row.startDate && row.startDate >= today && row.startDate <= horizonDate)).length,
      missingManager: joiners.filter((row) => !row.managerId).length,
    },
    joiners,
  }
}

export async function listOnboardingOperations(actor: RequestActor): Promise<OnboardingOperations> {
  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Your role cannot view onboarding operations.", 403)
  const database = await ensureHrDatabase()
  const actorEmployee = actor.role === "manager"
    ? await database.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL").bind(actor.email).first<{ employee_id: string }>()
    : null
  const managerSql = actor.role === "manager" ? "AND e.manager_id=?" : ""
  const rows = await retryTransientRead(() => database.prepare(`
    SELECT e.employee_id,
      TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS name,
      e.work_email, e.department, e.job_title, e.location, e.manager, e.manager_id, e.hire_date,
      s.id AS submission_id, s.status AS submission_status, w.due_at AS workflow_due_at
    FROM employee_directory_view e
    LEFT JOIN LATERAL (
      SELECT id, status FROM employee_onboarding_submissions
      WHERE employee_id=e.employee_id ORDER BY created_at DESC LIMIT 1
    ) s ON TRUE
    LEFT JOIN LATERAL (
      SELECT due_at FROM workflow_requests
      WHERE source_entity_type='employee_onboarding_submission'
        AND source_entity_id=s.id AND type='employee_onboarding'
      ORDER BY created_at DESC LIMIT 1
    ) w ON TRUE
    WHERE e.archived_at IS NULL AND LOWER(e.employment_status)='preboarding' ${managerSql}
    ORDER BY e.hire_date, e.last_name, e.first_name
    LIMIT 500
  `).bind(...(actor.role === "manager" ? [actorEmployee?.employee_id ?? ""] : [])).all<OnboardingPersistenceRow>())
  return buildOnboardingOperations(rows.results ?? [])
}
