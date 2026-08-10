import { z } from "zod"

import { createAiWorkflowDraft } from "@/lib/server/ai-workflows"
import { synthesizeWithAzureResponses } from "@/lib/server/azure-ai"
import { ensureHrDatabase, type Database } from "@/lib/server/hr-repository"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const managementSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_compensation"), annualSalary: z.number().nonnegative().max(100_000_000), currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), payFrequency: z.enum(["annual", "monthly", "biweekly", "weekly", "hourly"]), effectiveFrom: date }),
  z.object({ action: z.literal("assign_project"), projectCode: z.string().trim().min(2).max(40), projectName: z.string().trim().min(2).max(160), clientName: z.string().trim().max(160).nullable().optional(), roleTitle: z.string().trim().min(2).max(160), allocationPercent: z.number().positive().max(100), startsOn: date, endsOn: date.nullable().optional(), isPrimary: z.boolean().default(false) }),
  z.object({ action: z.literal("create_review"), cycleName: z.string().trim().min(3).max(160), startsOn: date, endsOn: date }),
  z.object({ action: z.literal("submit_manager_review"), reviewId: z.string().trim().min(8).max(100), managerReview: z.string().trim().min(50).max(10_000), managerRating: z.number().min(1).max(5) }),
  z.object({ action: z.literal("schedule_one_on_one"), scheduledAt: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal("complete_one_on_one"), meetingId: z.string().trim().min(8).max(100), employeeNotes: z.string().trim().max(10_000).default(""), managerNotes: z.string().trim().min(20).max(10_000) }),
  z.object({ action: z.literal("approve_one_on_one_summary"), meetingId: z.string().trim().min(8).max(100) }),
])

async function database(): Promise<Database> {
  const value = await ensureHrDatabase()
  if (!value) throw new PeopleError("Employee management is unavailable.", 503)
  return value
}

async function employeeAndManager(db: Database, employeeId: string, actor: RequestActor) {
  const employee = await db.prepare("SELECT employee_id, work_email, manager_id FROM employee_directory_view WHERE employee_id=? AND archived_at IS NULL")
    .bind(employeeId).first<{ employee_id: string; work_email: string | null; manager_id: string | null }>()
  if (!employee) throw new PeopleError("Employee not found.", 404)
  const actorEmployee = await db.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL")
    .bind(actor.email).first<{ employee_id: string }>()
  return { employee, actorEmployeeId: actorEmployee?.employee_id ?? null }
}

function requirePeopleTeam(actor: RequestActor) {
  if (!["admin", "hr"].includes(actor.role)) throw new PeopleError("Only HR can change employment, compensation, project, or review records.", 403)
}

export async function manageEmployee(employeeId: string, value: unknown, actor: RequestActor) {
  const input = managementSchema.parse(value)
  const db = await database()
  const { employee, actorEmployeeId } = await employeeAndManager(db, employeeId, actor)

  if (input.action === "set_compensation") {
    requirePeopleTeam(actor)
    const current = await db.prepare("SELECT id, effective_from FROM employee_compensation WHERE employee_id=? AND effective_to IS NULL")
      .bind(employeeId).first<{ id: string; effective_from: string }>()
    if (current && input.effectiveFrom < current.effective_from) throw new PeopleError("New compensation must take effect on or after the current record.", 422)
    if (current && input.effectiveFrom === current.effective_from) {
      await db.batch([
        db.prepare("UPDATE employee_compensation SET annual_salary=?, currency=?, pay_frequency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(input.annualSalary, input.currency, input.payFrequency, current.id),
        db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'compensation_updated', 'Compensation record updated', ?, ?)")
          .bind(crypto.randomUUID(), employeeId, JSON.stringify({ compensationId: current.id, effectiveFrom: input.effectiveFrom }), actor.email),
      ])
      return { id: current.id, status: "active", message: "Compensation record saved." }
    }
    const id = `COMP-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
    await db.batch([
      db.prepare("UPDATE employee_compensation SET effective_to=(CAST(? AS DATE) - INTERVAL '1 day')::date, updated_at=CURRENT_TIMESTAMP WHERE employee_id=? AND effective_to IS NULL AND effective_from<?")
        .bind(input.effectiveFrom, employeeId, input.effectiveFrom),
      db.prepare("INSERT INTO employee_compensation(id, employee_id, annual_salary, currency, pay_frequency, effective_from, created_by_email) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, employeeId, input.annualSalary, input.currency, input.payFrequency, input.effectiveFrom, actor.email),
      db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'compensation_updated', 'Compensation record updated', ?, ?)")
        .bind(crypto.randomUUID(), employeeId, JSON.stringify({ compensationId: id, effectiveFrom: input.effectiveFrom }), actor.email),
    ])
    return { id, status: "active", message: "Compensation record saved." }
  }

  if (input.action === "assign_project") {
    requirePeopleTeam(actor)
    if (input.endsOn && input.endsOn < input.startsOn) throw new PeopleError("Project end date must be on or after the start date.", 422)
    const projectId = `PRJ-${input.projectCode.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 30)}`
    const assignmentId = `ASN-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
    const statements = [
      db.prepare("INSERT INTO projects(id, code, name, client_name, status, start_date) VALUES (?, ?, ?, ?, 'active', ?) ON CONFLICT(code) DO UPDATE SET name=excluded.name, client_name=excluded.client_name, status='active', updated_at=CURRENT_TIMESTAMP")
        .bind(projectId, input.projectCode, input.projectName, input.clientName || null, input.startsOn),
    ]
    if (input.isPrimary) statements.push(db.prepare("UPDATE employee_project_assignments SET is_primary=FALSE, updated_at=CURRENT_TIMESTAMP WHERE employee_id=? AND ends_on IS NULL").bind(employeeId))
    statements.push(
      db.prepare("INSERT INTO employee_project_assignments(id, employee_id, project_id, role_title, allocation_percent, starts_on, ends_on, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(assignmentId, employeeId, projectId, input.roleTitle, input.allocationPercent, input.startsOn, input.endsOn ?? null, input.isPrimary),
      db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'project_assigned', 'Project assignment added', ?, ?)")
        .bind(crypto.randomUUID(), employeeId, JSON.stringify({ projectId, assignmentId }), actor.email),
    )
    await db.batch(statements)
    return { id: assignmentId, projectId, status: "active", message: "Project assignment saved." }
  }

  if (input.action === "create_review") {
    requirePeopleTeam(actor)
    if (input.endsOn < input.startsOn) throw new PeopleError("Review end date must be on or after the start date.", 422)
    const existingCycle = await db.prepare(`
      SELECT id FROM review_cycles
      WHERE LOWER(name)=LOWER(?) AND starts_on=? AND ends_on=? AND status IN ('draft', 'open')
      ORDER BY created_at DESC LIMIT 1
    `).bind(input.cycleName, input.startsOn, input.endsOn).first<{ id: string }>()
    const cycleId = existingCycle?.id ?? `CYCLE-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
    const existingReview = await db.prepare("SELECT id FROM performance_reviews WHERE cycle_id=? AND employee_id=?")
      .bind(cycleId, employeeId).first<{ id: string }>()
    if (existingReview) throw new PeopleError("This employee is already assigned to the review cycle.", 409)
    const reviewId = `REV-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
    const statements = [
      db.prepare("INSERT INTO performance_reviews(id, cycle_id, employee_id, manager_employee_id, status) VALUES (?, ?, ?, ?, 'self_review')").bind(reviewId, cycleId, employeeId, employee.manager_id),
      db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'review_assigned', 'Performance review assigned', ?, ?)").bind(crypto.randomUUID(), employeeId, JSON.stringify({ reviewId, cycleId }), actor.email),
    ]
    if (!existingCycle) statements.unshift(db.prepare("INSERT INTO review_cycles(id, name, starts_on, ends_on, status, created_by_email) VALUES (?, ?, ?, ?, 'open', ?)").bind(cycleId, input.cycleName, input.startsOn, input.endsOn, actor.email))
    await db.batch(statements)
    return { id: reviewId, cycleId, status: "self_review", message: "Review assigned to the employee." }
  }

  const canManageEmployeeDevelopment = ["admin", "hr"].includes(actor.role) || actor.role === "manager" && employee.manager_id === actorEmployeeId
  if (!canManageEmployeeDevelopment) throw new PeopleError("Only the employee's manager or HR can manage reviews and one-on-ones.", 403)

  if (input.action === "submit_manager_review") {
    const review = await db.prepare("SELECT id, status, manager_employee_id FROM performance_reviews WHERE id=? AND employee_id=?")
      .bind(input.reviewId, employeeId).first<{ id: string; status: string; manager_employee_id: string | null }>()
    if (!review) throw new PeopleError("Performance review not found.", 404)
    if (review.status !== "manager_review") throw new PeopleError("The employee self-review must be submitted before the manager review.", 409)
    if (actor.role === "manager" && review.manager_employee_id !== actorEmployeeId) throw new PeopleError("Managers can only complete reviews assigned to them.", 403)
    await db.batch([
      db.prepare("UPDATE performance_reviews SET manager_review=?, manager_rating=?, status='completed', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(input.managerReview, input.managerRating, input.reviewId),
      db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'review_completed', 'Performance review completed', ?, ?)")
        .bind(crypto.randomUUID(), employeeId, JSON.stringify({ reviewId: input.reviewId }), actor.email),
    ])
    return { id: input.reviewId, status: "completed", message: "Manager review completed and shared with the employee." }
  }

  if (input.action === "schedule_one_on_one") {
    const id = `1ON1-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
    await db.prepare("INSERT INTO one_on_one_meetings(id, employee_id, manager_employee_id, scheduled_at, status) VALUES (?, ?, ?, ?, 'scheduled')")
      .bind(id, employeeId, employee.manager_id || actorEmployeeId, input.scheduledAt).run()
    return { id, status: "scheduled", message: "One-on-one scheduled." }
  }

  const meeting = await db.prepare("SELECT id, employee_id, employee_notes, manager_notes, ai_summary, status FROM one_on_one_meetings WHERE id=? AND employee_id=?")
    .bind(input.meetingId, employeeId).first<{ id: string; employee_id: string; employee_notes: string | null; manager_notes: string | null; ai_summary: string | null; status: string }>()
  if (!meeting) throw new PeopleError("One-on-one not found.", 404)

  if (input.action === "complete_one_on_one") {
    const source = `Employee notes:\n${input.employeeNotes || "Not recorded"}\n\nManager notes:\n${input.managerNotes}`
    const generated = await synthesizeWithAzureResponses({
      system: "Summarize a one-on-one meeting for employee and manager review. Use only the supplied notes. Return a concise factual synopsis and a short list of agreed next steps. Do not infer sentiment, performance, health, or attrition intent.",
      user: source,
    }).catch(() => null)
    const summary = generated || `Meeting synopsis\n\n${input.managerNotes}\n\nEmployee notes\n${input.employeeNotes || "No employee notes recorded."}`
    await db.prepare("UPDATE one_on_one_meetings SET status='completed', held_at=CURRENT_TIMESTAMP, employee_notes=?, manager_notes=?, ai_summary=?, summary_approved_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(input.employeeNotes || null, input.managerNotes, summary, input.meetingId).run()
    return { id: input.meetingId, status: "completed", summary, provider: generated ? "azure-openai" : "deterministic", requiresApproval: true, message: "Synopsis prepared for manager approval." }
  }

  if (!meeting.ai_summary) throw new PeopleError("Prepare the meeting synopsis before approving it.", 409)
  await db.prepare("UPDATE one_on_one_meetings SET summary_approved_by_email=?, summary_approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(actor.email, input.meetingId).run()
  const draft = employee.work_email ? await createAiWorkflowDraft({
    type: "employee_email",
    employeeIds: [employeeId],
    subject: "One-on-one follow-up",
    message: meeting.ai_summary,
  }, actor) : null
  return { id: input.meetingId, status: "approved", emailDraft: draft, message: draft ? "Synopsis approved and follow-up email prepared for review." : "Synopsis approved. Add a work email to prepare the follow-up." }
}
