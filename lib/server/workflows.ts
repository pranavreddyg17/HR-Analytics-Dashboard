import { z } from "zod"

import type { ManagedEmployee, WorkflowActorContext } from "@/lib/people-types"
import { ensureHrDatabase, type Database } from "@/lib/server/hr-database"
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
  z.object({
    type: z.literal("training"),
    employeeId: z.string().trim().min(2).max(40),
    program: z.string().trim().min(2).max(160),
    dueDate: date,
    hours: z.number().positive().max(500),
    note: z.string().trim().max(600).optional().default(""),
  }),
])

const actionSchema = z.object({
  id: z.string().trim().min(2).max(100),
  type: z.enum(["leave", "hiring", "training"]),
  action: z.enum(["approve", "reject", "complete"]),
})

async function database(): Promise<Database> {
  const db = await ensureHrDatabase()
  if (!db) throw new PeopleError("Workflow storage is unavailable.", 503)
  return db
}

async function employeeByEmail(db: Database, email: string): Promise<ManagedEmployee | null> {
  return db.prepare("SELECT e.*, TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS display_name, '' AS initials, NULL AS manager_name, 0 AS direct_reports FROM employees e WHERE LOWER(e.work_email)=LOWER(?) AND e.archived_at IS NULL")
    .bind(email).first<ManagedEmployee>()
}

async function employeeById(db: Database, employeeId: string): Promise<ManagedEmployee | null> {
  return db.prepare("SELECT e.*, TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS display_name, '' AS initials, NULL AS manager_name, 0 AS direct_reports FROM employees e WHERE e.employee_id=? AND e.archived_at IS NULL")
    .bind(employeeId).first<ManagedEmployee>()
}

function inclusiveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime()
  const end = new Date(`${endDate}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new PeopleError("End date must be on or after the start date.", 422)
  return Math.floor((end - start) / 86_400_000) + 1
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
    const overlap = await db.prepare("SELECT id FROM leave_records WHERE employee_id=? AND LOWER(approval_status) IN ('pending','approved') AND start_date <= ? AND end_date >= ?")
      .bind(employee.employee_id, input.endDate, input.startDate).first<{ id: string }>()
    if (overlap) throw new PeopleError("This employee already has a pending or approved leave request for those dates.", 409)
    const title = `${input.leaveType} leave request`
    const details = JSON.stringify({ leaveType: input.leaveType, startDate: input.startDate, endDate: input.endDate, days, note: input.note })
    await db.batch([
      db.prepare("INSERT INTO leave_records(id, employee_id, leave_type, start_date, end_date, leave_days, approval_status, department, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, 'workflow', CURRENT_TIMESTAMP)")
        .bind(id, employee.employee_id, input.leaveType, input.startDate, input.endDate, days, employee.department),
      db.prepare("INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email) VALUES (?, 'leave', ?, ?, 'Pending', ?, ?)")
        .bind(id, employee.employee_id, title, details, actor.email),
      db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'leave_requested', ?, ?, ?)")
        .bind(crypto.randomUUID(), employee.employee_id, `${actor.displayName} requested ${days} day${days === 1 ? "" : "s"} of ${input.leaveType.toLowerCase()} leave`, details, actor.email),
    ])
    return { id, type: input.type, status: "Pending", message: "Leave request submitted for approval." }
  }

  if (input.type === "hiring") {
    if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Only managers and HR can request a new position.", 403)
    const title = `New ${input.position} requisition`
    const details = JSON.stringify({ employmentType: input.employmentType, justification: input.justification })
    await db.batch([
      db.prepare("INSERT INTO hiring_records(id, position, department, application_date, hiring_date, hiring_source, time_to_hire_days, recruitment_status, location, data_source, updated_at) VALUES (?, ?, ?, ?, NULL, 'Manager request', NULL, 'Requested', ?, 'workflow', CURRENT_TIMESTAMP)")
        .bind(id, input.position, input.department, now, input.location),
      db.prepare("INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email) VALUES (?, 'hiring', NULL, ?, 'Requested', ?, ?)")
        .bind(id, title, details, actor.email),
    ])
    return { id, type: input.type, status: "Requested", message: "Hiring requisition sent to HR for approval." }
  }

  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Only managers and HR can assign training.", 403)
  const employee = await employeeById(db, input.employeeId)
  if (!employee) throw new PeopleError("Choose an active employee record.", 404)
  if (actor.role === "manager") {
    const manager = await employeeByEmail(db, actor.email)
    if (!manager || employee.manager_id !== manager.employee_id) throw new PeopleError("Managers can only assign training to their direct reports.", 403)
  }
  const title = `${input.program} assignment`
  const details = JSON.stringify({ program: input.program, dueDate: input.dueDate, hours: input.hours, note: input.note })
  await db.batch([
    db.prepare("INSERT INTO training_records(id, training_program, employee_id, completion_status, completion_date, training_hours, assessment_score, department, data_source, updated_at) VALUES (?, ?, ?, 'Incomplete', NULL, ?, NULL, ?, 'workflow', CURRENT_TIMESTAMP)")
      .bind(id, input.program, employee.employee_id, input.hours, employee.department),
    db.prepare("INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email) VALUES (?, 'training', ?, ?, 'Assigned', ?, ?)")
      .bind(id, employee.employee_id, title, details, actor.email),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'training_assigned', ?, ?, ?)")
      .bind(crypto.randomUUID(), employee.employee_id, `${actor.displayName} assigned ${input.program}`, details, actor.email),
  ])
  return { id, type: input.type, status: "Assigned", message: "Training assigned to the employee." }
}

export async function actOnWorkflow(value: unknown, actor: RequestActor) {
  const input = actionSchema.parse(value)
  const db = await database()
  const workflow = await db.prepare("SELECT * FROM workflow_requests WHERE id=? AND type=?").bind(input.id, input.type).first<Record<string, string | null>>()
  if (!workflow) throw new PeopleError("Workflow request not found.", 404)

  if (input.type === "leave") {
    if (!(["admin", "hr", "manager"] as string[]).includes(actor.role)) throw new PeopleError("Your role cannot approve leave.", 403)
    const employee = workflow.employee_id ? await employeeById(db, workflow.employee_id) : null
    if (actor.role === "manager") {
      const manager = await employeeByEmail(db, actor.email)
      if (!manager || !employee || employee.manager_id !== manager.employee_id) throw new PeopleError("Managers can only decide leave for direct reports.", 403)
    }
    if (!employee || employee.work_email?.toLowerCase() === actor.email.toLowerCase()) throw new PeopleError("You cannot approve your own leave request.", 403)
    if (!["approve", "reject"].includes(input.action)) throw new PeopleError("Choose approve or reject.", 422)
    const status = input.action === "approve" ? "Approved" : "Rejected"
    await db.batch([
      db.prepare("UPDATE leave_records SET approval_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status, input.id),
      db.prepare("UPDATE workflow_requests SET status=?, resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status, actor.email, input.id),
      db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'leave_decision', ?, ?, ?)")
        .bind(crypto.randomUUID(), employee.employee_id, `${actor.displayName} ${status.toLowerCase()} the leave request`, JSON.stringify({ workflowId: input.id, status }), actor.email),
    ])
    return { id: input.id, status, message: `Leave request ${status.toLowerCase()}.` }
  }

  if (input.type === "hiring") {
    if (!(["admin", "hr"] as string[]).includes(actor.role)) throw new PeopleError("Only HR can approve hiring requisitions.", 403)
    if (!["approve", "reject"].includes(input.action)) throw new PeopleError("Choose approve or reject.", 422)
    const workflowStatus = input.action === "approve" ? "Approved" : "Rejected"
    const recruitmentStatus = input.action === "approve" ? "Open" : "Closed"
    await db.batch([
      db.prepare("UPDATE hiring_records SET recruitment_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(recruitmentStatus, input.id),
      db.prepare("UPDATE workflow_requests SET status=?, resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(workflowStatus, actor.email, input.id),
    ])
    return { id: input.id, status: workflowStatus, message: `Hiring requisition ${workflowStatus.toLowerCase()}.` }
  }

  if (input.action !== "complete") throw new PeopleError("Training assignments can only be completed.", 422)
  const employee = workflow.employee_id ? await employeeById(db, workflow.employee_id) : null
  const canComplete = ["admin", "hr"].includes(actor.role) || employee?.work_email?.toLowerCase() === actor.email.toLowerCase()
  if (!canComplete || !employee) throw new PeopleError("Only the assigned employee or HR can complete this training.", 403)
  await db.batch([
    db.prepare("UPDATE training_records SET completion_status='Completed', completion_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(new Date().toISOString().slice(0, 10), input.id),
    db.prepare("UPDATE workflow_requests SET status='Completed', resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(actor.email, input.id),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'training_completed', ?, ?, ?)")
      .bind(crypto.randomUUID(), employee.employee_id, `${employee.display_name} completed ${workflow.title}`, JSON.stringify({ workflowId: input.id }), actor.email),
  ])
  return { id: input.id, status: "Completed", message: "Training marked complete." }
}
