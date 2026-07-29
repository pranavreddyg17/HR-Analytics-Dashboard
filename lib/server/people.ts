import { z } from "zod"

import type { AttritionRecord, LeaveRecord, PromotionRecord, TrainingRecord } from "@/lib/hr-types"
import type { EmployeeActivity, EmployeeDirectoryResponse, EmployeeInput, EmployeeProfileResponse, InboxItem, ManagedEmployee } from "@/lib/people-types"
import type { RequestActor } from "@/lib/server/request-user"
import { ensureHrDatabase, type Database } from "@/lib/server/hr-database"
import { getActions } from "@/lib/server/actions"

export class PeopleError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

const optionalText = (maximum: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().max(maximum).nullable().optional(),
)

const optionalEmail = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().toLowerCase().email().max(160).nullable().optional(),
)

const employeeSchema = z.object({
  employee_id: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).optional(),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  preferred_name: optionalText(80),
  work_email: optionalEmail,
  phone: optionalText(40),
  department: z.string().trim().min(1).max(100),
  job_title: z.string().trim().min(1).max(120),
  location: z.string().trim().min(1).max(120),
  manager_id: optionalText(40),
  hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employment_type: z.enum(["Full-time", "Part-time", "Contract", "Intern", "Temporary"]),
  employment_status: z.enum(["Preboarding", "Active", "On leave", "Terminated"]),
  version: z.number().int().positive().optional(),
})

const employeeSelect = `
  SELECT e.*,
    TRIM(CASE WHEN COALESCE(e.preferred_name, '') <> '' THEN e.preferred_name ELSE e.first_name END || ' ' || e.last_name) AS display_name,
    UPPER(SUBSTR(COALESCE(NULLIF(e.preferred_name, ''), NULLIF(e.first_name, ''), e.employee_id), 1, 1) || SUBSTR(COALESCE(NULLIF(e.last_name, ''), e.employee_id), 1, 1)) AS initials,
    NULLIF(TRIM(COALESCE(m.preferred_name, m.first_name, '') || ' ' || COALESCE(m.last_name, '')), '') AS manager_name,
    (SELECT COUNT(*) FROM employees d WHERE d.manager_id = e.employee_id AND d.archived_at IS NULL) AS direct_reports
  FROM employees e
  LEFT JOIN employees m ON m.employee_id = e.manager_id`

async function databaseOrThrow(): Promise<Database> {
  const database = await ensureHrDatabase()
  if (!database) throw new PeopleError("Employee storage is unavailable.", 503)
  return database
}

function calculateTenure(hireDate: string): number {
  const start = new Date(`${hireDate}T00:00:00Z`).getTime()
  const now = new Date().getTime()
  if (!Number.isFinite(start) || start > now) return 0
  return Number(((now - start) / (365.25 * 86_400_000)).toFixed(1))
}

function cleanNullable(value: string | null | undefined): string | null {
  const clean = value?.trim()
  return clean ? clean : null
}

async function assertUniqueAndManager(database: Database, input: EmployeeInput, currentId?: string): Promise<{ managerName: string }> {
  if (input.work_email) {
    const duplicate = await database.prepare("SELECT employee_id FROM employees WHERE LOWER(work_email) = LOWER(?) AND employee_id <> ? AND archived_at IS NULL")
      .bind(input.work_email, currentId ?? "")
      .first<{ employee_id: string }>()
    if (duplicate) throw new PeopleError("That work email is already assigned to another employee.", 409)
  }
  if (!input.manager_id) return { managerName: "Not assigned" }
  if (input.manager_id === currentId) throw new PeopleError("An employee cannot be their own manager.")
  const manager = await database.prepare("SELECT employee_id, first_name, last_name, preferred_name, manager_id FROM employees WHERE employee_id = ? AND archived_at IS NULL")
    .bind(input.manager_id)
    .first<{ employee_id: string; first_name: string; last_name: string; preferred_name: string | null; manager_id: string | null }>()
  if (!manager) throw new PeopleError("The selected manager could not be found.")
  if (currentId) {
    let next = manager.manager_id
    for (let depth = 0; next && depth < 30; depth += 1) {
      if (next === currentId) throw new PeopleError("That manager assignment would create a reporting cycle.")
      const parent = await database.prepare("SELECT manager_id FROM employees WHERE employee_id = ?").bind(next).first<{ manager_id: string | null }>()
      next = parent?.manager_id ?? null
    }
  }
  return { managerName: `${manager.preferred_name || manager.first_name} ${manager.last_name}`.trim() }
}

export async function listPeople({
  search = "",
  department = "",
  location = "",
  status = "",
  employmentType = "",
  includeArchived = false,
  limit = 100,
  offset = 0,
}: {
  search?: string
  department?: string
  location?: string
  status?: string
  employmentType?: string
  includeArchived?: boolean
  limit?: number
  offset?: number
} = {}): Promise<EmployeeDirectoryResponse> {
  const database = await databaseOrThrow()
  const where: string[] = []
  const bindings: unknown[] = []
  if (!includeArchived) where.push("e.archived_at IS NULL")
  if (search.trim()) {
    where.push("LOWER(e.employee_id || ' ' || COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '') || ' ' || COALESCE(e.preferred_name, '') || ' ' || COALESCE(e.work_email, '') || ' ' || e.job_title) LIKE ?")
    bindings.push(`%${search.trim().toLowerCase()}%`)
  }
  if (department) { where.push("e.department = ?"); bindings.push(department) }
  if (location) { where.push("e.location = ?"); bindings.push(location) }
  if (status) { where.push("e.employment_status = ?"); bindings.push(status) }
  if (employmentType) { where.push("e.employment_type = ?"); bindings.push(employmentType) }
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : ""
  const safeLimit = Math.max(1, Math.min(250, limit))
  const safeOffset = Math.max(0, offset)
  const [itemsResult, countResult, dimensionResult] = await Promise.all([
    database.prepare(`${employeeSelect}${clause} ORDER BY CASE e.employment_status WHEN 'Preboarding' THEN 0 WHEN 'Active' THEN 1 WHEN 'On leave' THEN 2 ELSE 3 END, display_name LIMIT ? OFFSET ?`)
      .bind(...bindings, safeLimit, safeOffset).all<ManagedEmployee>(),
    database.prepare(`SELECT COUNT(*) AS count FROM employees e${clause}`).bind(...bindings).first<{ count: number }>(),
    database.prepare("SELECT department, location, employment_status, employment_type FROM employees WHERE archived_at IS NULL").all<{ department: string; location: string; employment_status: string; employment_type: string }>(),
  ])
  const dimensions = dimensionResult.results ?? []
  return {
    total: Number(countResult?.count ?? 0),
    items: itemsResult.results ?? [],
    dimensions: {
      departments: [...new Set(dimensions.map((row) => row.department))].sort(),
      locations: [...new Set(dimensions.map((row) => row.location))].sort(),
      statuses: [...new Set(dimensions.map((row) => row.employment_status))].sort(),
      employmentTypes: [...new Set(dimensions.map((row) => row.employment_type))].sort(),
    },
  }
}

export async function getPerson(employeeId: string): Promise<EmployeeProfileResponse> {
  const database = await databaseOrThrow()
  const employee = await database.prepare(`${employeeSelect} WHERE e.employee_id = ?`).bind(employeeId).first<ManagedEmployee>()
  if (!employee) throw new PeopleError("Employee not found.", 404)
  const [manager, directReports, leave, training, promotions, attrition, activity] = await Promise.all([
    employee.manager_id ? database.prepare(`${employeeSelect} WHERE e.employee_id = ?`).bind(employee.manager_id).first<ManagedEmployee>() : Promise.resolve(null),
    database.prepare(`${employeeSelect} WHERE e.manager_id = ? AND e.archived_at IS NULL ORDER BY display_name`).bind(employeeId).all<ManagedEmployee>(),
    database.prepare("SELECT * FROM leave_records WHERE employee_id = ? ORDER BY start_date DESC LIMIT 100").bind(employeeId).all<LeaveRecord>(),
    database.prepare("SELECT * FROM training_records WHERE employee_id = ? ORDER BY COALESCE(completion_date, '9999-12-31') DESC LIMIT 100").bind(employeeId).all<TrainingRecord>(),
    database.prepare("SELECT * FROM promotion_records WHERE employee_id = ? ORDER BY promotion_date DESC LIMIT 100").bind(employeeId).all<PromotionRecord>(),
    database.prepare("SELECT * FROM attrition_events WHERE employee_id = ? ORDER BY exit_date DESC LIMIT 20").bind(employeeId).all<AttritionRecord>(),
    database.prepare("SELECT * FROM employee_activity WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100").bind(employeeId).all<EmployeeActivity>(),
  ])
  return {
    employee,
    manager,
    directReports: directReports.results ?? [],
    leave: leave.results ?? [],
    training: training.results ?? [],
    promotions: promotions.results ?? [],
    attrition: attrition.results ?? [],
    activity: activity.results ?? [],
  }
}

export async function createPerson(value: unknown, actor: RequestActor): Promise<ManagedEmployee> {
  const parsed = employeeSchema.parse(value)
  const database = await databaseOrThrow()
  const employeeId = parsed.employee_id ?? `EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  const exists = await database.prepare("SELECT employee_id FROM employees WHERE employee_id = ?").bind(employeeId).first<{ employee_id: string }>()
  if (exists) throw new PeopleError("That employee ID already exists.", 409)
  const input: EmployeeInput = { ...parsed, employee_id: employeeId, preferred_name: cleanNullable(parsed.preferred_name), work_email: cleanNullable(parsed.work_email), phone: cleanNullable(parsed.phone), manager_id: cleanNullable(parsed.manager_id) }
  const { managerName } = await assertUniqueAndManager(database, input)
  const activityId = crypto.randomUUID()
  await database.batch([
    database.prepare("INSERT INTO employees(employee_id, first_name, last_name, preferred_name, work_email, phone, department, job_title, location, manager, manager_id, hire_date, employment_type, employment_status, tenure_years, data_source, archived_at, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
      .bind(employeeId, input.first_name, input.last_name, input.preferred_name, input.work_email, input.phone, input.department, input.job_title, input.location, managerName, input.manager_id, input.hire_date, input.employment_type, input.employment_status, calculateTenure(input.hire_date)),
    database.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, 'created', ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(activityId, employeeId, `${actor.displayName} created the employee profile`, JSON.stringify(input), actor.email),
  ])
  return (await getPerson(employeeId)).employee
}

export async function updatePerson(employeeId: string, value: unknown, actor: RequestActor): Promise<ManagedEmployee> {
  const parsed = employeeSchema.parse(value)
  const database = await databaseOrThrow()
  const current = await database.prepare("SELECT * FROM employees WHERE employee_id = ?").bind(employeeId).first<Record<string, unknown>>()
  if (!current) throw new PeopleError("Employee not found.", 404)
  if (!parsed.version || parsed.version !== Number(current.version)) throw new PeopleError("This profile changed since you opened it. Refresh and try again.", 409)
  const input: EmployeeInput = { ...parsed, employee_id: employeeId, preferred_name: cleanNullable(parsed.preferred_name), work_email: cleanNullable(parsed.work_email), phone: cleanNullable(parsed.phone), manager_id: cleanNullable(parsed.manager_id) }
  const { managerName } = await assertUniqueAndManager(database, input, employeeId)
  const tracked = ["first_name", "last_name", "preferred_name", "work_email", "phone", "department", "job_title", "location", "manager_id", "hire_date", "employment_type", "employment_status"] as const
  const changes = Object.fromEntries(tracked.filter((key) => (current[key] ?? null) !== (input[key] ?? null)).map((key) => [key, { from: current[key] ?? null, to: input[key] ?? null }]))
  if (!Object.keys(changes).length) return (await getPerson(employeeId)).employee
  await database.batch([
    database.prepare("UPDATE employees SET first_name=?, last_name=?, preferred_name=?, work_email=?, phone=?, department=?, job_title=?, location=?, manager=?, manager_id=?, hire_date=?, employment_type=?, employment_status=?, tenure_years=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE employee_id=? AND version=?")
      .bind(input.first_name, input.last_name, input.preferred_name, input.work_email, input.phone, input.department, input.job_title, input.location, managerName, input.manager_id, input.hire_date, input.employment_type, input.employment_status, calculateTenure(input.hire_date), employeeId, parsed.version),
    database.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, 'updated', ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), employeeId, `${actor.displayName} updated ${Object.keys(changes).length} profile field${Object.keys(changes).length === 1 ? "" : "s"}`, JSON.stringify(changes), actor.email),
  ])
  return (await getPerson(employeeId)).employee
}

export async function setPersonArchived(employeeId: string, archived: boolean, actor: RequestActor): Promise<ManagedEmployee> {
  const database = await databaseOrThrow()
  const current = await database.prepare("SELECT first_name, last_name FROM employees WHERE employee_id = ?").bind(employeeId).first<{ first_name: string; last_name: string }>()
  if (!current) throw new PeopleError("Employee not found.", 404)
  const action = archived ? "archived" : "restored"
  await database.batch([
    archived
      ? database.prepare("UPDATE employees SET archived_at=CURRENT_TIMESTAMP, employment_status='Terminated', version=version+1, updated_at=CURRENT_TIMESTAMP WHERE employee_id=?").bind(employeeId)
      : database.prepare("UPDATE employees SET archived_at=NULL, employment_status='Active', version=version+1, updated_at=CURRENT_TIMESTAMP WHERE employee_id=?").bind(employeeId),
    database.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, ?, ?, NULL, ?, CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), employeeId, action, `${actor.displayName} ${action} ${current.first_name} ${current.last_name}`, actor.email),
  ])
  return (await getPerson(employeeId)).employee
}

export async function listInboxItems(actor?: RequestActor): Promise<InboxItem[]> {
  const database = await databaseOrThrow()
  type WorkflowPerson = { first_name?: string; last_name?: string; preferred_name?: string | null; work_email?: string | null; manager_id?: string | null; requested_by_email?: string | null; details_json?: string | null }
  const [leave, hiring, training, actions, actorEmployee] = await Promise.all([
    database.prepare("SELECT l.*, e.first_name, e.last_name, e.preferred_name, e.work_email, e.manager_id, w.requested_by_email, w.details_json FROM leave_records l LEFT JOIN employees e ON e.employee_id=l.employee_id LEFT JOIN workflow_requests w ON w.id=l.id WHERE LOWER(l.approval_status)='pending' AND LOWER(l.data_source) <> 'demo' ORDER BY l.start_date LIMIT 100").all<LeaveRecord & WorkflowPerson>(),
    database.prepare("SELECT h.*, w.requested_by_email, w.details_json FROM hiring_records h LEFT JOIN workflow_requests w ON w.id=h.id WHERE LOWER(h.recruitment_status) IN ('requested','offer') AND LOWER(h.data_source) <> 'demo' ORDER BY h.application_date LIMIT 100").all<Record<string, unknown> & WorkflowPerson>(),
    database.prepare("SELECT t.*, e.first_name, e.last_name, e.preferred_name, e.work_email, e.manager_id, w.requested_by_email, w.details_json FROM training_records t LEFT JOIN employees e ON e.employee_id=t.employee_id LEFT JOIN workflow_requests w ON w.id=t.id WHERE LOWER(t.completion_status) <> 'completed' AND LOWER(t.data_source) <> 'demo' LIMIT 100").all<TrainingRecord & WorkflowPerson>(),
    getActions(),
    actor ? database.prepare("SELECT employee_id FROM employees WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL").bind(actor.email).first<{ employee_id: string }>() : Promise.resolve(null),
  ])
  const personName = (row: { first_name?: string; last_name?: string; preferred_name?: string | null; employee_id: string }) => `${row.preferred_name || row.first_name || row.employee_id} ${row.last_name || ""}`.trim()
  const isPeopleTeam = !actor || actor.role === "admin" || actor.role === "hr"
  const ownEmail = actor?.email.toLowerCase() ?? ""
  const employeeId = actorEmployee?.employee_id ?? null
  const visibleLeave = (leave.results ?? []).filter((row) => isPeopleTeam || row.work_email?.toLowerCase() === ownEmail || actor?.role === "manager" && row.manager_id === employeeId)
  const visibleHiring = (hiring.results ?? []).filter((row) => isPeopleTeam || actor?.role === "manager" && String(row.requested_by_email ?? "").toLowerCase() === ownEmail)
  const visibleTraining = (training.results ?? []).filter((row) => isPeopleTeam || row.work_email?.toLowerCase() === ownEmail || actor?.role === "manager" && row.manager_id === employeeId)
  const workflowDate = (row: WorkflowPerson): string | null => {
    try { return String(JSON.parse(row.details_json ?? "{}").dueDate ?? "") || null } catch { return null }
  }
  return [
    ...visibleLeave.map((row): InboxItem => {
      const canDecide = Boolean(row.requested_by_email && actor && row.work_email?.toLowerCase() !== ownEmail && (isPeopleTeam || actor.role === "manager" && row.manager_id === employeeId))
      return { id: row.id, type: "leave", title: `${row.leave_type} leave request`, detail: `${row.leave_days} days · ${row.start_date} to ${row.end_date}`, person: personName(row), employeeId: row.employee_id, dueDate: row.start_date, status: row.approval_status, priority: row.start_date <= new Date().toISOString().slice(0, 10) ? "high" : "medium", actionable: canDecide, actions: canDecide ? ["reject", "approve"] : [] }
    }),
    ...visibleHiring.map((row): InboxItem => {
      const canDecide = Boolean(row.requested_by_email && actor && ["admin", "hr"].includes(actor.role) && String(row.recruitment_status).toLowerCase() === "requested")
      return { id: String(row.id), type: "hiring", title: `${row.recruitment_status}: ${row.position}`, detail: `${row.department} · ${row.location} · requested by ${row.requested_by_email ?? "HR"}`, person: null, employeeId: null, dueDate: String(row.application_date), status: String(row.recruitment_status), priority: String(row.recruitment_status).toLowerCase() === "offer" ? "high" : "medium", actionable: canDecide, actions: canDecide ? ["reject", "approve"] : [] }
    }),
    ...visibleTraining.map((row): InboxItem => {
      const canComplete = Boolean(row.requested_by_email && actor && (isPeopleTeam || row.work_email?.toLowerCase() === ownEmail))
      return { id: row.id, type: "training", title: row.training_program, detail: `${row.training_hours} hours · assigned training`, person: personName(row), employeeId: row.employee_id, dueDate: workflowDate(row) ?? row.completion_date, status: row.completion_status, priority: workflowDate(row) && workflowDate(row)! < new Date().toISOString().slice(0, 10) ? "high" : "medium", actionable: canComplete, actions: canComplete ? ["complete"] : [] }
    }),
    ...(isPeopleTeam ? actions.items.filter((item) => item.status === "needs_approval").slice(0, 5) : []).map((item): InboxItem => ({ id: item.id, type: "review", title: item.title, detail: item.detail, person: null, employeeId: null, dueDate: null, status: item.status, priority: "medium", actionable: false, actions: [] })),
  ].sort((left, right) => ({ high: 0, medium: 1, low: 2 })[left.priority] - ({ high: 0, medium: 1, low: 2 })[right.priority])
}

export async function decideLeave(leaveId: string, decision: "Approved" | "Rejected", actor: RequestActor): Promise<void> {
  const database = await databaseOrThrow()
  const leave = await database.prepare("SELECT * FROM leave_records WHERE id = ?").bind(leaveId).first<LeaveRecord>()
  if (!leave) throw new PeopleError("Leave request not found.", 404)
  await database.batch([
    database.prepare("UPDATE leave_records SET approval_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(decision, leaveId),
    database.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, 'leave_decision', ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), leave.employee_id, `${actor.displayName} ${decision.toLowerCase()} a ${leave.leave_type} leave request`, JSON.stringify({ leaveId, from: leave.approval_status, to: decision }), actor.email),
  ])
}
