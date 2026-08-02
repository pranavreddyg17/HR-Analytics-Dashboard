import { z } from "zod"

import type { AttritionModelProfile, AttritionRecord, LeaveRecord, PromotionRecord, TrainingRecord } from "@/lib/hr-types"
import type { EmployeeActivity, EmployeeDirectoryResponse, EmployeeInput, EmployeeProfileResponse, InboxItem, ManagedEmployee } from "@/lib/people-types"
import type { RequestActor } from "@/lib/server/request-user"
import { ensureHrDatabase, type Database } from "@/lib/server/hr-database"

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
  tenure = "",
  includeArchived = false,
  limit = 100,
  offset = 0,
}: {
  search?: string
  department?: string
  location?: string
  status?: string
  employmentType?: string
  tenure?: string
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
  if (tenure === "under1") where.push("e.tenure_years < 1")
  if (tenure === "1to2") where.push("e.tenure_years >= 1 AND e.tenure_years < 3")
  if (tenure === "3to4") where.push("e.tenure_years >= 3 AND e.tenure_years < 5")
  if (tenure === "5plus") where.push("e.tenure_years >= 5")
  if (tenure === "mobility") where.push("e.tenure_years >= 3 AND LOWER(e.employment_status) != 'terminated' AND NOT EXISTS (SELECT 1 FROM promotion_records p WHERE p.employee_id = e.employee_id)")
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
  const [manager, directReports, leave, training, promotions, attrition, attritionModel, activity] = await Promise.all([
    employee.manager_id ? database.prepare(`${employeeSelect} WHERE e.employee_id = ?`).bind(employee.manager_id).first<ManagedEmployee>() : Promise.resolve(null),
    database.prepare(`${employeeSelect} WHERE e.manager_id = ? AND e.archived_at IS NULL ORDER BY display_name`).bind(employeeId).all<ManagedEmployee>(),
    database.prepare("SELECT * FROM leave_records WHERE employee_id = ? ORDER BY start_date DESC LIMIT 100").bind(employeeId).all<LeaveRecord>(),
    database.prepare("SELECT * FROM training_records WHERE employee_id = ? ORDER BY COALESCE(completion_date, '9999-12-31') DESC LIMIT 100").bind(employeeId).all<TrainingRecord>(),
    database.prepare("SELECT * FROM promotion_records WHERE employee_id = ? ORDER BY promotion_date DESC LIMIT 100").bind(employeeId).all<PromotionRecord>(),
    database.prepare("SELECT * FROM attrition_events WHERE employee_id = ? ORDER BY exit_date DESC LIMIT 20").bind(employeeId).all<AttritionRecord>(),
    database.prepare("SELECT * FROM attrition_model_profiles WHERE employee_id = ?").bind(employeeId).first<AttritionModelProfile>(),
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
    attritionModel,
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
  type WorkflowPerson = {
    first_name?: string
    last_name?: string
    preferred_name?: string | null
    work_email?: string | null
    manager_id?: string | null
    manager_email?: string | null
    owner_name?: string | null
    requested_by_email?: string | null
    details_json?: string | null
    workflow_status?: string | null
    workflow_priority?: string | null
    owner_email?: string | null
    due_at?: string | null
    next_action?: string | null
    assigned_at?: string | null
    blocked_reason?: string | null
    completed_at?: string | null
    completion_notes?: string | null
    workflow_created_at?: string | null
    workflow_updated_at?: string | null
    updated_at?: string
  }
  const workflowColumns = `
    w.requested_by_email,
    w.details_json,
    w.status AS workflow_status,
    w.priority AS workflow_priority,
    w.owner_email,
    w.due_at,
    w.next_action,
    w.assigned_at,
    w.blocked_reason,
    w.completed_at,
    w.completion_notes,
    w.created_at AS workflow_created_at,
    w.updated_at AS workflow_updated_at,
    COALESCE(NULLIF(au.display_name, ''), NULLIF(TRIM(COALESCE(oe.preferred_name, oe.first_name, '') || ' ' || COALESCE(oe.last_name, '')), '')) AS owner_name`
  const [leave, hiring, training, actorEmployee] = await Promise.all([
    database.prepare(`SELECT l.*, e.first_name, e.last_name, e.preferred_name, e.work_email, e.manager_id, m.work_email AS manager_email, ${workflowColumns}
      FROM leave_records l
      JOIN workflow_requests w ON w.id=l.id AND w.type='leave'
      LEFT JOIN employees e ON e.employee_id=l.employee_id
      LEFT JOIN employees m ON m.employee_id=e.manager_id
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(w.owner_email)
      LEFT JOIN employees oe ON LOWER(oe.work_email)=LOWER(w.owner_email) AND oe.archived_at IS NULL
      WHERE LOWER(l.data_source) <> 'demo'
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC LIMIT 160`).all<LeaveRecord & WorkflowPerson>(),
    database.prepare(`SELECT h.*, ${workflowColumns}
      FROM hiring_records h
      JOIN workflow_requests w ON w.id=h.id AND w.type='hiring'
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(w.owner_email)
      LEFT JOIN employees oe ON LOWER(oe.work_email)=LOWER(w.owner_email) AND oe.archived_at IS NULL
      WHERE LOWER(h.data_source) <> 'demo'
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC LIMIT 160`).all<Record<string, unknown> & WorkflowPerson>(),
    database.prepare(`SELECT t.*, e.first_name, e.last_name, e.preferred_name, e.work_email, e.manager_id, m.work_email AS manager_email, ${workflowColumns}
      FROM training_records t
      JOIN workflow_requests w ON w.id=t.id AND w.type='training'
      LEFT JOIN employees e ON e.employee_id=t.employee_id
      LEFT JOIN employees m ON m.employee_id=e.manager_id
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(w.owner_email)
      LEFT JOIN employees oe ON LOWER(oe.work_email)=LOWER(w.owner_email) AND oe.archived_at IS NULL
      WHERE LOWER(t.data_source) <> 'demo'
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC LIMIT 160`).all<TrainingRecord & WorkflowPerson>(),
    actor ? database.prepare("SELECT employee_id FROM employees WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL").bind(actor.email).first<{ employee_id: string }>() : Promise.resolve(null),
  ])
  const personName = (row: { first_name?: string; last_name?: string; preferred_name?: string | null; employee_id: string }) => `${row.preferred_name || row.first_name || row.employee_id} ${row.last_name || ""}`.trim()
  const isPeopleTeam = !actor || actor.role === "admin" || actor.role === "hr"
  const ownEmail = actor?.email.toLowerCase() ?? ""
  const employeeId = actorEmployee?.employee_id ?? null
  const visibleLeave = (leave.results ?? []).filter((row) => isPeopleTeam || row.work_email?.toLowerCase() === ownEmail || actor?.role === "manager" && row.manager_id === employeeId)
  const visibleHiring = (hiring.results ?? []).filter((row) => isPeopleTeam || actor?.role === "manager" && String(row.requested_by_email ?? "").toLowerCase() === ownEmail)
  const visibleTraining = (training.results ?? []).filter((row) => isPeopleTeam || row.work_email?.toLowerCase() === ownEmail || actor?.role === "manager" && row.manager_id === employeeId)
  const detailValue = (row: WorkflowPerson, field: string): string | null => {
    try { return String((JSON.parse(row.details_json ?? "{}") as Record<string, unknown>)[field] ?? "") || null } catch { return null }
  }
  const nowIso = new Date().toISOString()
  const today = nowIso.slice(0, 10)
  const dateAfterToday = new Date()
  dateAfterToday.setUTCDate(dateAfterToday.getUTCDate() + 3)
  const dueSoonLimit = dateAfterToday.toISOString().slice(0, 10)
  const daysSince = (value: string | null | undefined): number => {
    if (!value) return 0
    const timestamp = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`).getTime()
    return Number.isFinite(timestamp) ? Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000)) : 0
  }
  const slaStatus = (dueDate: string | null, completed: boolean): InboxItem["slaStatus"] => {
    if (completed) return "complete"
    const normalized = dueDate?.slice(0, 10) ?? null
    if (!normalized) return "unscheduled"
    if (normalized < today) return "overdue"
    if (normalized === today) return "due_today"
    if (normalized <= dueSoonLimit) return "due_soon"
    return "on_track"
  }
  const ownerLabel = (row: WorkflowPerson, fallback: string): string => {
    if (row.owner_name) return row.owner_name
    const email = row.owner_email?.toLowerCase()
    if (email === "people-ops@laidbackhr.cloud") return "People Operations"
    if (email === "talent@laidbackhr.cloud") return "Talent Acquisition"
    if (email === "learning@laidbackhr.cloud") return "Learning team"
    return row.owner_email || fallback
  }
  const priority = (row: WorkflowPerson, sla: InboxItem["slaStatus"]): InboxItem["priority"] => {
    if (sla === "complete") return "low"
    if (sla === "overdue" || sla === "due_today") return "high"
    return row.workflow_priority === "high" || row.workflow_priority === "low" ? row.workflow_priority : "medium"
  }
  const reviewHref = (type: InboxItem["type"], id: string, view: "decisions" | "employees" | "my_work" | "completed"): string =>
    `/inbox?view=${view}&type=${type}&item=${encodeURIComponent(id)}`
  return [
    ...visibleLeave.map((row): InboxItem => {
      const isCompleted = Boolean(row.completed_at) || ["approved", "rejected"].includes(row.approval_status.toLowerCase())
      const dueDate = row.due_at?.slice(0, 10) || detailValue(row, "decisionDueDate") || row.start_date
      const sla = slaStatus(dueDate, isCompleted)
      const canDecide = Boolean(!isCompleted && row.requested_by_email && actor && row.work_email?.toLowerCase() !== ownEmail && (isPeopleTeam || actor.role === "manager" && row.manager_id === employeeId))
      const attentionReason = row.blocked_reason || (sla === "overdue" ? "The decision deadline has passed." : `A decision is required before leave begins on ${row.start_date}.`)
      return {
        id: row.id, type: "leave", title: `${row.leave_type} leave request`, detail: `${row.leave_days} days · ${row.start_date} to ${row.end_date}`, person: personName(row), employeeId: row.employee_id,
        dueDate, status: row.approval_status, priority: priority(row, sla), owner: ownerLabel(row, "People Operations"), ownerEmail: row.owner_email ?? null,
        nextAction: row.next_action || (isCompleted ? "No further action." : "Approve or decline the request."), attentionReason,
        completionEffect: "The decision is recorded and the employee leave schedule is updated.", assignedTo: row.manager_email && row.owner_email?.toLowerCase() === row.manager_email.toLowerCase() ? "manager" : "hr",
        requestContext: [
          { label: "Requested dates", value: `${row.start_date} to ${row.end_date}` },
          { label: "Duration", value: `${row.leave_days} day${row.leave_days === 1 ? "" : "s"}` },
          ...(detailValue(row, "note") ? [{ label: "Request note", value: detailValue(row, "note") as string }] : []),
        ],
        requiresDecision: !isCompleted, isCompleted, slaStatus: sla, timeInStatusDays: daysSince(row.assigned_at || row.workflow_updated_at || row.workflow_created_at),
        createdAt: row.workflow_created_at || row.updated_at || nowIso, completedAt: row.completed_at ?? null, completionNotes: row.completion_notes ?? null, blockedReason: row.blocked_reason ?? null,
        actionable: canDecide, actions: canDecide ? ["reject", "approve"] : [],
        reviewHref: reviewHref("leave", row.id, isCompleted ? "completed" : "decisions"),
        recordHref: `/people/${encodeURIComponent(row.employee_id)}`,
      }
    }),
    ...visibleHiring.map((row): InboxItem => {
      const status = String(row.recruitment_status)
      const isCompleted = Boolean(row.completed_at) || ["closed", "rejected", "hired"].includes(status.toLowerCase())
      const dueDate = row.due_at?.slice(0, 10) || String(row.application_date)
      const sla = slaStatus(dueDate, isCompleted)
      const requiresDecision = status.toLowerCase() === "requested"
      const canDecide = Boolean(!isCompleted && row.requested_by_email && actor && ["admin", "hr"].includes(actor.role) && requiresDecision)
      const attentionReason = row.blocked_reason || (requiresDecision
        ? sla === "overdue" ? "The approval deadline has passed, so recruiting has not started." : "HR approval is required before recruiting begins."
        : sla === "overdue" ? "No recruiting update was recorded before the follow-up deadline."
        : status.toLowerCase() === "offer" ? "The offer needs a recorded response or owner follow-up."
        : "The requisition remains open and needs a current progress update.")
      const title = status.toLowerCase() === "offer" ? `${row.position} offer` : `${row.position} requisition`
      return {
        id: String(row.id), type: "hiring", title, detail: `${row.department} · ${row.location} · Requested by ${row.requested_by_email ?? "HR"}`, person: null, employeeId: null,
        dueDate, status, priority: priority(row, sla), owner: ownerLabel(row, "Talent Acquisition"), ownerEmail: row.owner_email ?? null,
        nextAction: row.next_action || (requiresDecision ? "Approve or decline the requisition." : "Record the next recruiting update."), attentionReason,
        completionEffect: requiresDecision ? "Approval opens the requisition; rejection closes the request." : "The recruiting record and its next follow-up date are updated.",
        requestContext: [
          { label: "Employment type", value: detailValue(row, "employmentType") || "Not recorded" },
          { label: "Business justification", value: detailValue(row, "justification") || "No justification was recorded." },
          { label: "Requested by", value: row.requested_by_email || "HR" },
        ],
        assignedTo: "hr", requiresDecision, isCompleted, slaStatus: sla, timeInStatusDays: daysSince(row.assigned_at || row.workflow_updated_at || row.workflow_created_at),
        createdAt: row.workflow_created_at || String(row.updated_at || nowIso), completedAt: row.completed_at ?? null, completionNotes: row.completion_notes ?? null, blockedReason: row.blocked_reason ?? null,
        actionable: canDecide, actions: canDecide ? ["reject", "approve"] : [],
        reviewHref: reviewHref("hiring", String(row.id), isCompleted ? "completed" : requiresDecision ? "decisions" : "my_work"),
        recordHref: `/hiring?requisition=${encodeURIComponent(String(row.id))}`,
      }
    }),
    ...visibleTraining.map((row): InboxItem => {
      const isCompleted = Boolean(row.completed_at) || row.completion_status.toLowerCase() === "completed"
      const dueDate = row.due_at?.slice(0, 10) || detailValue(row, "dueDate") || row.completion_date
      const sla = slaStatus(dueDate, isCompleted)
      const canComplete = Boolean(!isCompleted && row.requested_by_email && actor && (isPeopleTeam || row.work_email?.toLowerCase() === ownEmail))
      const attentionReason = row.blocked_reason || (sla === "overdue" ? "The assignment is past its recorded due date." : "The assignment remains incomplete.")
      return {
        id: row.id, type: "training", title: row.training_program, detail: `${row.training_hours} hours · assigned training`, person: personName(row), employeeId: row.employee_id,
        dueDate, status: row.completion_status, priority: priority(row, sla), owner: ownerLabel(row, personName(row)), ownerEmail: row.owner_email ?? null,
        nextAction: row.next_action || (isCompleted ? "No further action." : "Complete the assigned course and record completion."), attentionReason,
        completionEffect: "Completion is added to the employee timeline and removed from the open compliance queue.", assignedTo: "employee", requiresDecision: false,
        requestContext: [
          { label: "Programme", value: row.training_program },
          { label: "Expected time", value: `${row.training_hours} hour${row.training_hours === 1 ? "" : "s"}` },
          ...(detailValue(row, "note") ? [{ label: "Assignment note", value: detailValue(row, "note") as string }] : []),
        ],
        isCompleted, slaStatus: sla, timeInStatusDays: daysSince(row.assigned_at || row.workflow_updated_at || row.workflow_created_at),
        createdAt: row.workflow_created_at || row.updated_at || nowIso, completedAt: row.completed_at ?? null, completionNotes: row.completion_notes ?? null, blockedReason: row.blocked_reason ?? null,
        actionable: canComplete, actions: canComplete ? ["complete"] : [],
        reviewHref: reviewHref("training", row.id, isCompleted ? "completed" : "employees"),
        recordHref: `/people/${encodeURIComponent(row.employee_id)}`,
      }
    }),
  ].sort((left, right) => Number(left.isCompleted) - Number(right.isCompleted)
    || ({ high: 0, medium: 1, low: 2 })[left.priority] - ({ high: 0, medium: 1, low: 2 })[right.priority]
    || (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31")
    || right.createdAt.localeCompare(left.createdAt))
}

export async function decideLeave(leaveId: string, decision: "Approved" | "Rejected", actor: RequestActor): Promise<void> {
  const database = await databaseOrThrow()
  const leave = await database.prepare("SELECT l.*, e.work_email, e.manager_id FROM leave_records l LEFT JOIN employees e ON e.employee_id=l.employee_id WHERE l.id = ?")
    .bind(leaveId).first<LeaveRecord & { work_email: string | null; manager_id: string | null }>()
  if (!leave) throw new PeopleError("Leave request not found.", 404)
  if (leave.data_source === "demo") throw new PeopleError("Presentation sample records are read-only.", 403)
  if (leave.approval_status.toLowerCase() !== "pending") throw new PeopleError("This leave request has already been decided.", 409)
  if (leave.work_email?.toLowerCase() === actor.email.toLowerCase()) throw new PeopleError("You cannot decide your own leave request.", 403)
  if (actor.role === "manager") {
    const manager = await database.prepare("SELECT employee_id FROM employees WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL")
      .bind(actor.email).first<{ employee_id: string }>()
    if (!manager || leave.manager_id !== manager.employee_id) throw new PeopleError("Managers can only decide leave for their direct reports.", 403)
  }
  await database.batch([
    database.prepare("UPDATE leave_records SET approval_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(decision, leaveId),
    database.prepare("UPDATE workflow_requests SET status=?, next_action='No further action.', assigned_at=CURRENT_TIMESTAMP, resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND type='leave'")
      .bind(decision, actor.email, `${actor.displayName} ${decision.toLowerCase()} the leave request.`, leaveId),
    database.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, 'leave_decision', ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), leave.employee_id, `${actor.displayName} ${decision.toLowerCase()} a ${leave.leave_type} leave request`, JSON.stringify({ leaveId, from: leave.approval_status, to: decision }), actor.email),
  ])
}
