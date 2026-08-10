import { z } from "zod"

import type { ManagedEmployee, WorkflowActorContext } from "@/lib/people-types"
import { ensureHrDatabase, type Database } from "@/lib/server/hr-repository"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const workflowSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("leave"),
    employeeId: z.string().trim().min(2).max(40).optional(),
    leaveType: z.enum(["Annual", "Sick", "Parental", "Personal", "Caregiver", "Unpaid"]),
    startDate: date,
    endDate: date,
    note: z.string().trim().max(600).optional().default(""),
  }),
  z.object({
    type: z.literal("hiring"),
    position: z.string().trim().min(2).max(120),
    department: z.string().trim().min(1).max(100),
    location: z.string().trim().min(1).max(120),
    employmentType: z.enum(["Full-time", "Part-time", "Contract", "Intern", "Temporary"]),
    justification: z.string().trim().min(10).max(800),
  }),
])

const actionSchema = z.object({
  id: z.string().trim().min(2).max(100),
  type: z.enum(["leave", "hiring", "training", "reimbursement", "case", "onboarding"]),
  action: z.enum(["approve", "reject", "complete"]),
  note: z.string().trim().max(600).optional().default(""),
})

async function database(): Promise<Database> {
  const db = await ensureHrDatabase()
  if (!db) throw new PeopleError("Workflow storage is unavailable.", 503)
  return db
}

async function employeeByEmail(db: Database, email: string): Promise<ManagedEmployee | null> {
  return db.prepare("SELECT e.*, TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS display_name, '' AS initials, NULL AS manager_name, 0 AS direct_reports FROM employee_directory_view e WHERE LOWER(e.work_email)=LOWER(?) AND e.archived_at IS NULL")
    .bind(email).first<ManagedEmployee>()
}

async function employeeById(db: Database, employeeId: string): Promise<ManagedEmployee | null> {
  return db.prepare("SELECT e.*, TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS display_name, '' AS initials, NULL AS manager_name, 0 AS direct_reports FROM employee_directory_view e WHERE e.employee_id=? AND e.archived_at IS NULL")
    .bind(employeeId).first<ManagedEmployee>()
}

function inclusiveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime()
  const end = new Date(`${endDate}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new PeopleError("End date must be on or after the start date.", 422)
  return Math.floor((end - start) / 86_400_000) + 1
}

function dateAfter(value: string, days: number): string {
  const dateValue = new Date(`${value}T12:00:00Z`)
  dateValue.setUTCDate(dateValue.getUTCDate() + days)
  return dateValue.toISOString().slice(0, 10)
}

function earlierDate(left: string, right: string): string {
  return left < right ? left : right
}

function priorityForDueDate(dueDate: string, today: string): "high" | "medium" {
  return dueDate <= dateAfter(today, 1) ? "high" : "medium"
}

async function managerOwnerEmail(db: Database, employee: ManagedEmployee): Promise<string> {
  if (!employee.manager_id) return "people-ops@laidbackhr.cloud"
  const manager = await db.prepare("SELECT work_email FROM employee_directory_view WHERE employee_id=? AND archived_at IS NULL")
    .bind(employee.manager_id).first<{ work_email: string | null }>()
  return manager?.work_email?.trim().toLowerCase() || "people-ops@laidbackhr.cloud"
}

async function chosenEmployee(db: Database, actor: RequestActor, requestedId?: string): Promise<ManagedEmployee> {
  const ownEmployee = await employeeByEmail(db, actor.email)
  if (!requestedId || requestedId === ownEmployee?.employee_id) {
    if (!ownEmployee) throw new PeopleError("Your Google account is not linked to an employee profile. Ask HR to add your work email to your employee record.", 409)
    return ownEmployee
  }
  if (!(["admin", "hr"] as string[]).includes(actor.role)) throw new PeopleError("You can only submit leave for your own employee profile.", 403)
  const selected = await employeeById(db, requestedId)
  if (!selected) throw new PeopleError("Choose an active employee record.", 404)
  return selected
}

export async function getWorkflowActorContext(actor: RequestActor): Promise<WorkflowActorContext> {
  const db = await database()
  const employee = await employeeByEmail(db, actor.email)
  return {
    role: actor.role,
    email: actor.email,
    employeeId: employee?.employee_id ?? null,
    employeeName: employee?.display_name ?? null,
    canRequestHiring: ["admin", "hr", "manager"].includes(actor.role),
    canAssignTraining: ["admin", "hr", "manager"].includes(actor.role),
  }
}

export async function createWorkflow(value: unknown, actor: RequestActor) {
  const input = workflowSchema.parse(value)
  const db = await database()
  const id = `${input.type.slice(0, 3).toUpperCase()}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const now = new Date().toISOString().slice(0, 10)

  if (input.type === "leave") {
    const employee = await chosenEmployee(db, actor, input.employeeId)
    const days = inclusiveDays(input.startDate, input.endDate)
    const overlap = await db.prepare("SELECT id FROM leave_requests_view WHERE employee_id=? AND LOWER(data_source) <> 'demo' AND LOWER(approval_status) IN ('pending','approved') AND start_date <= ? AND end_date >= ?")
      .bind(employee.employee_id, input.endDate, input.startDate).first<{ id: string }>()
    if (overlap) throw new PeopleError("This employee already has a pending or approved leave request for those dates.", 409)
    const title = `${input.leaveType} leave request`
    const dueAt = earlierDate(dateAfter(now, 3), dateAfter(input.startDate, -1))
    const ownerEmail = await managerOwnerEmail(db, employee)
    const details = JSON.stringify({ leaveType: input.leaveType, startDate: input.startDate, endDate: input.endDate, days, note: input.note, decisionDueDate: dueAt })
    await db.batch([
      db.prepare("INSERT INTO leave_records(id, employee_id, leave_type, start_date, end_date, leave_days, approval_status, department, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, 'workflow', CURRENT_TIMESTAMP)")
        .bind(id, employee.employee_id, input.leaveType, input.startDate, input.endDate, days, employee.department),
      db.prepare("INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, priority, owner_email, due_at, next_action, source_entity_type, source_entity_id, assigned_at, confidentiality_level) VALUES (?, 'leave', ?, ?, 'Pending', ?, ?, ?, ?, ?, 'Approve or decline the request.', 'leave_record', ?, CURRENT_TIMESTAMP, 'restricted')")
        .bind(id, employee.employee_id, title, details, actor.email, priorityForDueDate(dueAt, now), ownerEmail, dueAt, id),
      db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'leave_requested', ?, ?, ?)")
        .bind(crypto.randomUUID(), employee.employee_id, `${actor.displayName} requested ${days} day${days === 1 ? "" : "s"} of ${input.leaveType.toLowerCase()} leave`, details, actor.email),
    ])
    return { id, type: input.type, status: "Pending", message: "Leave request submitted for approval." }
  }

  if (input.type === "hiring") {
    if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Only managers and HR can request a new position.", 403)
    const title = `New ${input.position} requisition`
    const details = JSON.stringify({ employmentType: input.employmentType, justification: input.justification })
    const dueAt = dateAfter(now, 3)
    const ownerEmail = ["admin", "hr"].includes(actor.role) ? actor.email : "talent@laidbackhr.cloud"
    await db.batch([
      db.prepare("INSERT INTO hiring_records(id, position, department, application_date, hiring_date, hiring_source, recruitment_status, location, data_source, updated_at) VALUES (?, ?, ?, ?, NULL, 'Manager request', 'Requested', ?, 'workflow', CURRENT_TIMESTAMP)")
        .bind(id, input.position, input.department, now, input.location),
      db.prepare("INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, priority, owner_email, due_at, next_action, source_entity_type, source_entity_id, assigned_at, confidentiality_level) VALUES (?, 'hiring', NULL, ?, 'Requested', ?, ?, 'high', ?, ?, 'Approve or decline the requisition.', 'hiring_record', ?, CURRENT_TIMESTAMP, 'internal')")
        .bind(id, title, details, actor.email, ownerEmail, dueAt, id),
    ])
    return { id, type: input.type, status: "Requested", message: "Hiring requisition sent to HR for approval." }
  }

  throw new PeopleError("Unsupported workflow type.", 422)
}

export async function actOnWorkflow(value: unknown, actor: RequestActor) {
  const input = actionSchema.parse(value)
  const db = await database()
  const persistedType = input.type === "case" ? "employee_case" : input.type === "onboarding" ? "employee_onboarding" : input.type
  const workflow = await db.prepare("SELECT * FROM workflow_requests WHERE id=? AND type=?").bind(input.id, persistedType).first<Record<string, string | null>>()
  if (!workflow) throw new PeopleError("Workflow request not found.", 404)

  if (input.type === "onboarding") {
    if (!["admin", "hr"].includes(actor.role)) throw new PeopleError("Only HR can verify employee onboarding.", 403)
    if (!["approve", "reject"].includes(input.action)) throw new PeopleError("Choose approve or reject.", 422)
    if (input.action === "reject" && input.note.length < 10) throw new PeopleError("Add a reason before rejecting the onboarding profile.", 422)
    const submission = await db.prepare("SELECT id, employee_id, user_email, requested_annual_salary, salary_currency, hire_date FROM employee_onboarding_submissions WHERE id=? AND status='submitted'")
      .bind(input.id).first<{ id: string; employee_id: string; user_email: string; requested_annual_salary: number; salary_currency: string; hire_date: string }>()
    if (!submission) throw new PeopleError("This onboarding profile has already been reviewed.", 409)
    if (submission.user_email.toLowerCase() === actor.email.toLowerCase()) throw new PeopleError("You cannot verify your own onboarding profile.", 403)
    if (input.action === "approve") {
      await db.batch([
        db.prepare("UPDATE employee_onboarding_submissions SET status='approved', reviewed_by_email=?, reviewed_at=CURRENT_TIMESTAMP, review_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(actor.email, input.note || null, input.id),
        db.prepare("UPDATE employees SET employment_status='Active', updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE employee_id=?").bind(submission.employee_id),
        db.prepare(`INSERT INTO employee_compensation(id, employee_id, annual_salary, currency, pay_frequency, effective_from, created_by_email)
          VALUES (?, ?, ?, ?, 'annual', ?, ?)
          ON CONFLICT(id) DO NOTHING`).bind(`COMP-${submission.id}`, submission.employee_id, submission.requested_annual_salary, submission.salary_currency, submission.hire_date, actor.email),
        db.prepare("UPDATE app_users SET onboarding_status='complete', updated_at=CURRENT_TIMESTAMP WHERE email=?").bind(submission.user_email),
        db.prepare("UPDATE workflow_requests SET status='Approved', next_action='No further action.', resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(actor.email, input.note || `${actor.displayName} verified the onboarding profile.`, input.id),
        db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'employee_onboarding_approved', 'Employee onboarding verified', ?, ?)").bind(crypto.randomUUID(), submission.employee_id, JSON.stringify({ submissionId: input.id }), actor.email),
      ])
      return { id: input.id, status: "Approved", message: "Employee onboarding verified and activated." }
    }
    await db.batch([
      db.prepare("UPDATE employee_onboarding_submissions SET status='rejected', reviewed_by_email=?, reviewed_at=CURRENT_TIMESTAMP, review_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(actor.email, input.note, input.id),
      db.prepare("UPDATE employees SET archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, version=version+1 WHERE employee_id=?").bind(submission.employee_id),
      db.prepare("UPDATE app_users SET employee_id=NULL, onboarding_status='required', updated_at=CURRENT_TIMESTAMP WHERE email=?").bind(submission.user_email),
      db.prepare("UPDATE workflow_requests SET status='Rejected', next_action='Resubmit corrected employment details.', resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(actor.email, input.note, input.id),
    ])
    return { id: input.id, status: "Rejected", message: "Onboarding profile rejected. The employee can submit corrected details." }
  }

  if (input.type === "leave") {
    if (!(["admin", "hr", "manager"] as string[]).includes(actor.role)) throw new PeopleError("Your role cannot approve leave.", 403)
    const employee = workflow.employee_id ? await employeeById(db, workflow.employee_id) : null
    if (actor.role === "manager") {
      const manager = await employeeByEmail(db, actor.email)
      if (!manager || !employee || employee.manager_id !== manager.employee_id) throw new PeopleError("Managers can only decide leave for direct reports.", 403)
    }
    if (!employee || employee.work_email?.toLowerCase() === actor.email.toLowerCase()) throw new PeopleError("You cannot approve your own leave request.", 403)
    if (!["approve", "reject"].includes(input.action)) throw new PeopleError("Choose approve or reject.", 422)
    if (input.action === "reject" && input.note.length < 10) throw new PeopleError("Add a brief reason before declining the leave request.", 422)
    const status = input.action === "approve" ? "Approved" : "Rejected"
    const decisionNote = input.note || `${actor.displayName} ${status.toLowerCase()} the leave request.`
    await db.batch([
      db.prepare("UPDATE leave_records SET approval_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status, input.id),
      db.prepare("UPDATE workflow_requests SET status=?, next_action='No further action.', assigned_at=CURRENT_TIMESTAMP, resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(status, actor.email, decisionNote, input.id),
      db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'leave_decision', ?, ?, ?)")
        .bind(crypto.randomUUID(), employee.employee_id, `${actor.displayName} ${status.toLowerCase()} the leave request`, JSON.stringify({ workflowId: input.id, status }), actor.email),
    ])
    return { id: input.id, status, message: `Leave request ${status.toLowerCase()}.` }
  }

  if (input.type === "hiring") {
    if (!(["admin", "hr"] as string[]).includes(actor.role)) throw new PeopleError("Only HR can approve hiring requisitions.", 403)
    if (!["approve", "reject"].includes(input.action)) throw new PeopleError("Choose approve or reject.", 422)
    if (String(workflow.status ?? "").toLowerCase() !== "requested") throw new PeopleError("This requisition decision has already been recorded.", 409)
    if (input.action === "reject" && input.note.length < 10) throw new PeopleError("Add a brief reason before declining the requisition.", 422)
    const recruitmentStatus = input.action === "approve" ? "Open" : "Closed"
    if (input.action === "approve") {
      await db.batch([
        db.prepare("UPDATE hiring_records SET recruitment_status='Open', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(input.id),
        db.prepare("UPDATE workflow_requests SET status='Open', owner_email=?, due_at=?, next_action='Record recruiting progress or confirm the requisition remains active.', assigned_at=CURRENT_TIMESTAMP, resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=NULL, completion_notes=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(actor.email, dateAfter(new Date().toISOString().slice(0, 10), 14), actor.email, input.id),
        db.prepare("INSERT INTO hiring_activity(id, entity_type, entity_id, requisition_id, action, from_status, to_status, detail, actor_email) VALUES (?, 'requisition', ?, ?, 'requisition_approved', 'Requested', 'Open', ?, ?)")
          .bind(crypto.randomUUID(), input.id, input.id, `${actor.displayName} approved and opened the hiring requisition.`, actor.email),
      ])
      return { id: input.id, status: "Open", message: "Hiring requisition approved and opened." }
    }
    await db.batch([
      db.prepare("UPDATE hiring_records SET recruitment_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(recruitmentStatus, input.id),
      db.prepare("UPDATE workflow_requests SET status='Rejected', next_action='No further action.', assigned_at=CURRENT_TIMESTAMP, resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(actor.email, `${actor.displayName} rejected the hiring requisition: ${input.note}`, input.id),
      db.prepare("INSERT INTO hiring_activity(id, entity_type, entity_id, requisition_id, action, from_status, to_status, detail, actor_email) VALUES (?, 'requisition', ?, ?, 'requisition_rejected', 'Requested', 'Closed', ?, ?)")
        .bind(crypto.randomUUID(), input.id, input.id, `${actor.displayName} rejected the hiring requisition: ${input.note}`, actor.email),
    ])
    return { id: input.id, status: "Rejected", message: "Hiring requisition rejected." }
  }

  if (input.type === "reimbursement") {
    if (!(["admin", "hr"] as string[]).includes(actor.role)) throw new PeopleError("Only HR can decide reimbursement claims.", 403)
    if (!["approve", "reject"].includes(input.action)) throw new PeopleError("Choose approve or reject.", 422)
    if (input.action === "reject" && input.note.length < 10) throw new PeopleError("Add a brief reason before rejecting the claim.", 422)
    if (workflow.requested_by_email?.toLowerCase() === actor.email.toLowerCase()) throw new PeopleError("You cannot decide your own reimbursement claim.", 403)
    const status = input.action === "approve" ? "approved" : "rejected"
    await db.batch([
      db.prepare("UPDATE expense_claims SET status=?, reviewed_by_email=?, reviewed_at=CURRENT_TIMESTAMP, decision_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(status, actor.email, input.note || null, input.id),
      db.prepare("UPDATE workflow_requests SET status=?, next_action='No further action.', resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(status, actor.email, input.note || `${actor.displayName} ${status} the reimbursement.`, input.id),
      ...(workflow.employee_id ? [db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'reimbursement_decision', ?, ?, ?)")
        .bind(crypto.randomUUID(), workflow.employee_id, `${actor.displayName} ${status} the reimbursement claim`, JSON.stringify({ workflowId: input.id, status }), actor.email)] : []),
    ])
    return { id: input.id, status, message: `Reimbursement ${status}.` }
  }

  if (input.type === "case") {
    if (input.action !== "complete") throw new PeopleError("Employee cases are closed after a resolution is recorded.", 422)
    const confidentiality = await db.prepare("SELECT confidentiality FROM employee_cases WHERE id=?").bind(input.id).first<{ confidentiality: string }>()
    const isOwner = workflow.owner_email?.toLowerCase() === actor.email.toLowerCase()
    if (!(["admin", "hr"] as string[]).includes(actor.role) && (!isOwner || confidentiality?.confidentiality === "restricted")) throw new PeopleError("Your role cannot resolve this employee case.", 403)
    const isSelfSubmitted = workflow.requested_by_email?.toLowerCase() === actor.email.toLowerCase()
    // A workspace administrator may close their own ordinary service ticket in
    // a single-admin workspace. Restricted employee-relations cases still
    // require an independent HR reviewer, as do all approval workflows.
    if (isSelfSubmitted && (actor.role !== "admin" || confidentiality?.confidentiality === "restricted")) {
      throw new PeopleError("This request requires another HR reviewer.", 403)
    }
    if (input.note.length < 10) throw new PeopleError("Record a clear resolution before closing the case.", 422)
    await db.batch([
      db.prepare("UPDATE employee_cases SET status='resolved', resolution_note=?, resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(input.note, actor.email, input.id),
      db.prepare("UPDATE workflow_requests SET status='Resolved', next_action='No further action.', resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(actor.email, input.note, input.id),
      ...(workflow.employee_id ? [db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'employee_case_resolved', 'Employee service request resolved', ?, ?)")
        .bind(crypto.randomUUID(), workflow.employee_id, JSON.stringify({ workflowId: input.id }), actor.email)] : []),
    ])
    return { id: input.id, status: "Resolved", message: "Employee request resolved." }
  }

  if (input.action !== "complete") throw new PeopleError("Training assignments can only be completed.", 422)
  const employee = workflow.employee_id ? await employeeById(db, workflow.employee_id) : null
  const canComplete = ["admin", "hr"].includes(actor.role) || employee?.work_email?.toLowerCase() === actor.email.toLowerCase()
  if (!canComplete || !employee) throw new PeopleError("Only the assigned employee or HR can complete this training.", 403)
  await db.batch([
    db.prepare("UPDATE training_records SET completion_status='Completed', completion_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(new Date().toISOString().slice(0, 10), input.id),
    db.prepare("UPDATE course_assignments SET status='Completed', completed_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(new Date().toISOString().slice(0, 10), input.id),
    db.prepare("UPDATE workflow_requests SET status='Completed', next_action='No further action.', assigned_at=CURRENT_TIMESTAMP, resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(actor.email, `${actor.displayName} recorded the training completion.`, input.id),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'training_completed', ?, ?, ?)")
      .bind(crypto.randomUUID(), employee.employee_id, `${employee.display_name} completed ${workflow.title}`, JSON.stringify({ workflowId: input.id }), actor.email),
  ])
  return { id: input.id, status: "Completed", message: "Training marked complete." }
}
