import { z } from "zod"

import type { AttritionModelProfile, AttritionRecord, LeaveRecord, PromotionRecord, TrainingRecord } from "@/lib/hr-types"
import type { EmployeeActivity, EmployeeDirectoryResponse, EmployeeInput, EmployeeProfileResponse, InboxItem, ManagedEmployee } from "@/lib/people-types"
import type { RequestActor } from "@/lib/server/request-user"
import { ensureHrDatabase, inferJobLevel, type Database } from "@/lib/server/hr-repository"
import { getAsset, listEmployeeExits } from "@/lib/server/exit-assets"

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
  employment_status: z.enum(["Preboarding", "Active", "On Bench", "Notice Period", "Scheduled Exit", "On leave", "Terminated", "Resigned"]),
  version: z.number().int().positive().optional(),
})

const employeeSelect = `
  SELECT e.*,
    TRIM(CASE WHEN COALESCE(e.preferred_name, '') <> '' THEN e.preferred_name ELSE e.first_name END || ' ' || e.last_name) AS display_name,
    UPPER(SUBSTR(COALESCE(NULLIF(e.preferred_name, ''), NULLIF(e.first_name, ''), e.employee_id), 1, 1) || SUBSTR(COALESCE(NULLIF(e.last_name, ''), e.employee_id), 1, 1)) AS initials,
    NULLIF(TRIM(COALESCE(m.preferred_name, m.first_name, '') || ' ' || COALESCE(m.last_name, '')), '') AS manager_name,
    (SELECT COUNT(*) FROM employee_directory_view d WHERE d.manager_id = e.employee_id AND d.archived_at IS NULL) AS direct_reports
  FROM employee_directory_view e
  LEFT JOIN employee_directory_view m ON m.employee_id = e.manager_id`

async function databaseOrThrow(): Promise<Database> {
  const database = await ensureHrDatabase()
  if (!database) throw new PeopleError("Employee storage is unavailable.", 503)
  return database
}

function cleanNullable(value: string | null | undefined): string | null {
  const clean = value?.trim()
  return clean ? clean : null
}

async function assertUniqueAndManager(database: Database, input: EmployeeInput, currentId?: string): Promise<void> {
  if (input.work_email) {
    const duplicate = await database.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email) = LOWER(?) AND employee_id <> ? AND archived_at IS NULL")
      .bind(input.work_email, currentId ?? "")
      .first<{ employee_id: string }>()
    if (duplicate) throw new PeopleError("That work email is already assigned to another employee.", 409)
  }
  if (!input.manager_id) return
  if (input.manager_id === currentId) throw new PeopleError("An employee cannot be their own manager.")
  const manager = await database.prepare("SELECT employee_id, first_name, last_name, preferred_name, manager_id FROM employee_directory_view WHERE employee_id = ? AND archived_at IS NULL")
    .bind(input.manager_id)
    .first<{ employee_id: string; first_name: string; last_name: string; preferred_name: string | null; manager_id: string | null }>()
  if (!manager) throw new PeopleError("The selected manager could not be found.")
  if (currentId) {
    let next = manager.manager_id
    for (let depth = 0; next && depth < 30; depth += 1) {
      if (next === currentId) throw new PeopleError("That manager assignment would create a reporting cycle.")
      const parent = await database.prepare("SELECT manager_id FROM employee_directory_view WHERE employee_id = ?").bind(next).first<{ manager_id: string | null }>()
      next = parent?.manager_id ?? null
    }
  }
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
  if (tenure === "mobility") where.push("e.tenure_years >= 3 AND LOWER(e.employment_status) != 'terminated' AND NOT EXISTS (SELECT 1 FROM promotion_events_view p WHERE p.employee_id = e.employee_id)")
  const clause = where.length ? ` WHERE ${where.join(" AND ")}` : ""
  const safeLimit = Math.max(1, Math.min(250, limit))
  const safeOffset = Math.max(0, offset)
  const [itemsResult, countResult, dimensionResult, compositionResult] = await Promise.all([
    database.prepare(`${employeeSelect}${clause} ORDER BY CASE e.employment_status WHEN 'Preboarding' THEN 0 WHEN 'Active' THEN 1 WHEN 'On Bench' THEN 2 WHEN 'On leave' THEN 3 WHEN 'Notice Period' THEN 4 WHEN 'Scheduled Exit' THEN 5 ELSE 6 END, display_name LIMIT ? OFFSET ?`)
      .bind(...bindings, safeLimit, safeOffset).all<ManagedEmployee>(),
    database.prepare(`SELECT COUNT(*) AS count FROM employee_directory_view e${clause}`).bind(...bindings).first<{ count: number }>(),
    database.prepare("SELECT department, location, employment_status, employment_type FROM employee_directory_view WHERE archived_at IS NULL").all<{ department: string; location: string; employment_status: string; employment_type: string }>(),
    database.prepare("SELECT department AS name, COUNT(*) AS count FROM employee_directory_view WHERE archived_at IS NULL GROUP BY department ORDER BY count DESC, department LIMIT 12")
      .all<{ name: string; count: number }>(),
  ])
  const dimensions = dimensionResult.results ?? []
  return {
    total: Number(countResult?.count ?? 0),
    items: itemsResult.results ?? [],
    composition: {
      departments: (compositionResult.results ?? []).map((row) => ({ name: row.name, count: Number(row.count) })),
    },
    dimensions: {
      departments: [...new Set(dimensions.map((row) => row.department))].sort(),
      locations: [...new Set(dimensions.map((row) => row.location))].sort(),
      statuses: [...new Set(dimensions.map((row) => row.employment_status))].sort(),
      employmentTypes: [...new Set(dimensions.map((row) => row.employment_type))].sort(),
    },
  }
}

export async function getPerson(employeeId: string, actor?: RequestActor): Promise<EmployeeProfileResponse> {
  const database = await databaseOrThrow()
  const employee = await database.prepare(`${employeeSelect} WHERE e.employee_id = ?`).bind(employeeId).first<ManagedEmployee>()
  if (!employee) throw new PeopleError("Employee not found.", 404)
  const canViewSensitiveHrData = !actor || ["admin", "hr"].includes(actor.role)
  const actorEmployee = actor?.role === "manager"
    ? await database.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL").bind(actor.email).first<{ employee_id: string }>()
    : null
  const canManageMeetings = canViewSensitiveHrData || Boolean(actorEmployee?.employee_id && employee.manager_id === actorEmployee.employee_id)
  const canManageReviews = canManageMeetings
  const [manager, directReports, leave, training, promotions, attrition, attritionModel, activity, projects, compensation, documents, reimbursements, cases, reviews, meetings, assignedAssets, exits] = await Promise.all([
    employee.manager_id ? database.prepare(`${employeeSelect} WHERE e.employee_id = ?`).bind(employee.manager_id).first<ManagedEmployee>() : Promise.resolve(null),
    database.prepare(`${employeeSelect} WHERE e.manager_id = ? AND e.archived_at IS NULL ORDER BY display_name`).bind(employeeId).all<ManagedEmployee>(),
    database.prepare("SELECT * FROM leave_requests_view WHERE employee_id = ? ORDER BY start_date DESC LIMIT 100").bind(employeeId).all<LeaveRecord>(),
    database.prepare("SELECT * FROM learning_assignments_view WHERE employee_id = ? ORDER BY COALESCE(completion_date, '9999-12-31') DESC LIMIT 100").bind(employeeId).all<TrainingRecord>(),
    database.prepare("SELECT * FROM promotion_events_view WHERE employee_id = ? ORDER BY promotion_date DESC LIMIT 100").bind(employeeId).all<PromotionRecord>(),
    database.prepare("SELECT * FROM attrition_events_view WHERE employee_id = ? ORDER BY exit_date DESC LIMIT 20").bind(employeeId).all<AttritionRecord>(),
    database.prepare("SELECT * FROM attrition_model_profiles_view WHERE employee_id = ?").bind(employeeId).first<AttritionModelProfile>(),
    database.prepare("SELECT * FROM employee_activity WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100").bind(employeeId).all<EmployeeActivity>(),
    database.prepare(`SELECT p.id, p.code, p.name, p.client_name, p.status, a.role_title, a.allocation_percent, a.starts_on, a.ends_on, a.is_primary
      FROM employee_project_assignments a JOIN projects p ON p.id=a.project_id
      WHERE a.employee_id=? ORDER BY a.is_primary DESC, a.starts_on DESC LIMIT 30`).bind(employeeId).all<Record<string, unknown>>(),
    canViewSensitiveHrData ? database.prepare("SELECT annual_salary, currency, pay_frequency, effective_from, effective_to FROM employee_compensation WHERE employee_id=? ORDER BY effective_from DESC LIMIT 20").bind(employeeId).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    canViewSensitiveHrData ? database.prepare("SELECT id, document_type, file_name, content_type, size_bytes, visibility, uploaded_by_email, created_at FROM employee_documents WHERE employee_id=? ORDER BY created_at DESC LIMIT 50").bind(employeeId).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    canViewSensitiveHrData ? database.prepare("SELECT id, category, expense_date, amount, currency, description, status, receipt_document_id, submitted_at, reviewed_at, decision_note FROM expense_claims WHERE employee_id=? ORDER BY created_at DESC LIMIT 50").bind(employeeId).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    canViewSensitiveHrData ? database.prepare("SELECT id, category, subject, description, confidentiality, status, assigned_to_email, submitted_at, resolved_at, resolution_note, resolved_by_email FROM employee_cases WHERE employee_id=? ORDER BY submitted_at DESC LIMIT 50").bind(employeeId).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    canManageReviews ? database.prepare(`SELECT r.id, r.status, r.self_review, r.manager_review, r.employee_rating, r.manager_rating, r.submitted_at, r.completed_at, c.name AS cycle_name, c.starts_on, c.ends_on
      FROM performance_reviews r JOIN review_cycles c ON c.id=r.cycle_id WHERE r.employee_id=? ORDER BY c.ends_on DESC LIMIT 20`).bind(employeeId).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    canManageMeetings ? database.prepare("SELECT id, scheduled_at, held_at, status, employee_notes, manager_notes, ai_summary, summary_approved_at, follow_up_sent_at FROM one_on_one_meetings WHERE employee_id=? ORDER BY scheduled_at DESC LIMIT 30").bind(employeeId).all<Record<string, unknown>>() : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    database.prepare("SELECT a.id FROM assets a JOIN asset_assignments aa ON aa.asset_id=a.id WHERE aa.employee_id=? AND aa.status='Assigned' AND aa.returned_at IS NULL ORDER BY a.asset_tag").bind(employeeId).all<{ id: string }>(),
    listEmployeeExits({ search: employeeId, limit: 20 }).then((result) => result.items.filter((item) => item.employeeId === employeeId)),
  ])
  const assets = await Promise.all((assignedAssets.results ?? []).map((asset) => getAsset(asset.id)))
  return {
    permissions: { canManageEmployment: canViewSensitiveHrData, canManageMeetings, canManageReviews },
    employee,
    manager,
    directReports: directReports.results ?? [],
    leave: leave.results ?? [],
    training: training.results ?? [],
    promotions: promotions.results ?? [],
    attrition: attrition.results ?? [],
    attritionModel,
    activity: activity.results ?? [],
    projects: projects.results ?? [],
    compensation: (compensation.results ?? [])[0] ?? null,
    documents: documents.results ?? [],
    assets,
    exits,
    reimbursements: reimbursements.results ?? [],
    cases: cases.results ?? [],
    reviews: reviews.results ?? [],
    meetings: meetings.results ?? [],
  }
}

export async function createPerson(value: unknown, actor: RequestActor): Promise<ManagedEmployee> {
  const parsed = employeeSchema.parse(value)
  const database = await databaseOrThrow()
  const employeeId = parsed.employee_id ?? `EMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  const exists = await database.prepare("SELECT employee_id FROM employee_directory_view WHERE employee_id = ?").bind(employeeId).first<{ employee_id: string }>()
  if (exists) throw new PeopleError("That employee ID already exists.", 409)
  const input: EmployeeInput = { ...parsed, employee_id: employeeId, preferred_name: cleanNullable(parsed.preferred_name), work_email: cleanNullable(parsed.work_email), phone: cleanNullable(parsed.phone), manager_id: cleanNullable(parsed.manager_id) }
  await assertUniqueAndManager(database, input)
  const activityId = crypto.randomUUID()
  const jobProfileId = `JOB-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const jobLevel = inferJobLevel(input.job_title)
  await database.batch([
    database.prepare(`INSERT INTO job_profiles(id, organization_id, department_name, title, job_level)
      VALUES (?, 'org:laidbackhr', ?, ?, ?)
      ON CONFLICT(organization_id, department_name, title, job_level) DO NOTHING`)
      .bind(jobProfileId, input.department, input.job_title, jobLevel),
    database.prepare(`INSERT INTO employees(employee_id, first_name, last_name, preferred_name, work_email, phone,
      location, manager_id, hire_date, employment_type, employment_status,
      data_source, organization_id, job_profile_id, archived_at, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', 'org:laidbackhr',
        (SELECT id FROM job_profiles WHERE organization_id='org:laidbackhr' AND department_name=? AND title=? AND job_level=? LIMIT 1),
        NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .bind(employeeId, input.first_name, input.last_name, input.preferred_name, input.work_email, input.phone, input.location, input.manager_id, input.hire_date, input.employment_type, input.employment_status, input.department, input.job_title, jobLevel),
    database.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, 'created', ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(activityId, employeeId, `${actor.displayName} created the employee profile`, JSON.stringify(input), actor.email),
  ])
  return (await getPerson(employeeId)).employee
}

export async function updatePerson(employeeId: string, value: unknown, actor: RequestActor): Promise<ManagedEmployee> {
  const parsed = employeeSchema.parse(value)
  const database = await databaseOrThrow()
  const current = await database.prepare("SELECT * FROM employee_directory_view WHERE employee_id = ?").bind(employeeId).first<Record<string, unknown>>()
  if (!current) throw new PeopleError("Employee not found.", 404)
  if (!parsed.version || parsed.version !== Number(current.version)) throw new PeopleError("This profile changed since you opened it. Refresh and try again.", 409)
  const input: EmployeeInput = { ...parsed, employee_id: employeeId, preferred_name: cleanNullable(parsed.preferred_name), work_email: cleanNullable(parsed.work_email), phone: cleanNullable(parsed.phone), manager_id: cleanNullable(parsed.manager_id) }
  await assertUniqueAndManager(database, input, employeeId)
  const tracked = ["first_name", "last_name", "preferred_name", "work_email", "phone", "department", "job_title", "location", "manager_id", "hire_date", "employment_type", "employment_status"] as const
  const changes = Object.fromEntries(tracked.filter((key) => (current[key] ?? null) !== (input[key] ?? null)).map((key) => [key, { from: current[key] ?? null, to: input[key] ?? null }]))
  if (!Object.keys(changes).length) return (await getPerson(employeeId)).employee
  const jobProfileId = `JOB-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  await database.batch([
    database.prepare(`INSERT INTO job_profiles(id, organization_id, department_name, title, job_level)
      VALUES (?, 'org:laidbackhr', ?, ?, COALESCE((SELECT job_level FROM job_profiles WHERE id=?), 'Not specified'))
      ON CONFLICT(organization_id, department_name, title, job_level) DO NOTHING`)
      .bind(jobProfileId, input.department, input.job_title, current.job_profile_id ?? null),
    database.prepare(`UPDATE employees SET first_name=?, last_name=?, preferred_name=?, work_email=?, phone=?,
      location=?, manager_id=?, hire_date=?, employment_type=?, employment_status=?,
      job_profile_id=(SELECT id FROM job_profiles WHERE organization_id='org:laidbackhr' AND department_name=? AND title=?
        AND job_level=COALESCE((SELECT job_level FROM job_profiles WHERE id=employees.job_profile_id), 'Not specified') LIMIT 1),
      version=version+1, updated_at=CURRENT_TIMESTAMP WHERE employee_id=? AND version=?`)
      .bind(input.first_name, input.last_name, input.preferred_name, input.work_email, input.phone, input.location, input.manager_id, input.hire_date, input.employment_type, input.employment_status, input.department, input.job_title, employeeId, parsed.version),
    database.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, 'updated', ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), employeeId, `${actor.displayName} updated ${Object.keys(changes).length} profile field${Object.keys(changes).length === 1 ? "" : "s"}`, JSON.stringify(changes), actor.email),
  ])
  return (await getPerson(employeeId)).employee
}

export async function setPersonArchived(employeeId: string, archived: boolean, actor: RequestActor): Promise<ManagedEmployee> {
  const database = await databaseOrThrow()
  const current = await database.prepare("SELECT first_name, last_name FROM employee_directory_view WHERE employee_id = ?").bind(employeeId).first<{ first_name: string; last_name: string }>()
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
  type InsightWorkflow = WorkflowPerson & { id: string; title: string; source_entity_id: string | null }
  type ServiceWorkflow = WorkflowPerson & { id: string; type: "reimbursement" | "employee_case"; title: string; employee_id: string; first_name?: string; last_name?: string; preferred_name?: string | null; work_email?: string | null; manager_id?: string | null; manager_email?: string | null; service_description?: string | null; receipt_document_id?: string | null }
  type OnboardingWorkflow = WorkflowPerson & { id: string; title: string; employee_id: string; first_name: string; last_name: string; preferred_name: string | null; organization_name: string; department: string; job_title: string; job_level: string; location: string; manager_name: string | null; requested_annual_salary: number; salary_currency: string }
  type OffboardingWorkflow = WorkflowPerson & { id: string; title: string; employee_id: string; first_name: string; last_name: string; preferred_name: string | null; department: string; job_title: string; expected_exit_date: string; exit_type: string; exit_status: string; open_tasks: number; open_assets: number }
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
  const [leave, hiring, training, insight, services, onboarding, offboarding, actorEmployee] = await Promise.all([
    database.prepare(`SELECT l.*, e.first_name, e.last_name, e.preferred_name, e.work_email, e.manager_id, m.work_email AS manager_email, ${workflowColumns}
      FROM leave_requests_view l
      JOIN workflow_requests w ON w.id=l.id AND w.type='leave'
      LEFT JOIN employee_directory_view e ON e.employee_id=l.employee_id
      LEFT JOIN employee_directory_view m ON m.employee_id=e.manager_id
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(w.owner_email)
      LEFT JOIN employee_directory_view oe ON LOWER(oe.work_email)=LOWER(w.owner_email) AND oe.archived_at IS NULL
      WHERE LOWER(l.data_source) <> 'demo'
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC LIMIT 160`).all<LeaveRecord & WorkflowPerson>(),
    database.prepare(`SELECT h.*, ${workflowColumns}
      FROM hiring_requisitions_view h
      JOIN workflow_requests w ON w.id=h.id AND w.type='hiring'
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(w.owner_email)
      LEFT JOIN employee_directory_view oe ON LOWER(oe.work_email)=LOWER(w.owner_email) AND oe.archived_at IS NULL
      WHERE LOWER(h.data_source) <> 'demo'
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC LIMIT 160`).all<Record<string, unknown> & WorkflowPerson>(),
    database.prepare(`SELECT t.*, e.first_name, e.last_name, e.preferred_name, e.work_email, e.manager_id, m.work_email AS manager_email, ${workflowColumns}
      FROM learning_assignments_view t
      JOIN workflow_requests w ON w.id=t.id AND w.type='training'
      LEFT JOIN employee_directory_view e ON e.employee_id=t.employee_id
      LEFT JOIN employee_directory_view m ON m.employee_id=e.manager_id
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(w.owner_email)
      LEFT JOIN employee_directory_view oe ON LOWER(oe.work_email)=LOWER(w.owner_email) AND oe.archived_at IS NULL
      WHERE LOWER(t.data_source) <> 'demo'
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC LIMIT 160`).all<TrainingRecord & WorkflowPerson>(),
    database.prepare(`SELECT w.id, w.title, w.source_entity_id, ${workflowColumns}
      FROM workflow_requests w
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(w.owner_email)
      LEFT JOIN employee_directory_view oe ON LOWER(oe.work_email)=LOWER(w.owner_email) AND oe.archived_at IS NULL
      WHERE w.type='insight'
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC LIMIT 160`).all<InsightWorkflow>(),
    database.prepare(`SELECT w.id, w.type, w.title, w.employee_id, e.first_name, e.last_name, e.preferred_name, e.work_email, e.manager_id, m.work_email AS manager_email,
        COALESCE(ec.description, ex.description) AS service_description, ex.receipt_document_id, ${workflowColumns}
      FROM workflow_requests w
      JOIN employee_directory_view e ON e.employee_id=w.employee_id
      LEFT JOIN employee_directory_view m ON m.employee_id=e.manager_id
      LEFT JOIN employee_cases ec ON w.type='employee_case' AND ec.id=w.source_entity_id
      LEFT JOIN expense_claims ex ON w.type='reimbursement' AND ex.id=w.source_entity_id
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(w.owner_email)
      LEFT JOIN employee_directory_view oe ON LOWER(oe.work_email)=LOWER(w.owner_email) AND oe.archived_at IS NULL
      WHERE w.type IN ('reimbursement', 'employee_case')
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC LIMIT 160`).all<ServiceWorkflow>(),
    database.prepare(`SELECT w.id, w.title, w.employee_id, s.first_name, s.last_name, s.preferred_name,
        s.organization_name, s.department, s.job_title, s.job_level, s.location, s.manager_name,
        s.requested_annual_salary, s.salary_currency, ${workflowColumns}
      FROM workflow_requests w
      JOIN employee_onboarding_submissions s ON s.id=w.source_entity_id
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(w.owner_email)
      LEFT JOIN employee_directory_view oe ON LOWER(oe.work_email)=LOWER(w.owner_email) AND oe.archived_at IS NULL
      WHERE w.type='employee_onboarding'
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC LIMIT 160`).all<OnboardingWorkflow>(),
    database.prepare(`SELECT w.id, w.title, w.employee_id, e.first_name, e.last_name, e.preferred_name,
        e.department, e.job_title, x.expected_exit_date::text, x.exit_type, x.status AS exit_status,
        COUNT(t.id) FILTER (WHERE t.status<>'Completed') AS open_tasks,
        COUNT(t.id) FILTER (WHERE t.status<>'Completed' AND t.asset_assignment_id IS NOT NULL) AS open_assets,
        ${workflowColumns}
      FROM workflow_requests w
      JOIN employee_exits x ON x.id=w.source_entity_id
      JOIN employee_directory_view e ON e.employee_id=w.employee_id
      LEFT JOIN offboarding_tasks t ON t.employee_exit_id=x.id
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(w.owner_email)
      LEFT JOIN employee_directory_view oe ON LOWER(oe.work_email)=LOWER(w.owner_email) AND oe.archived_at IS NULL
      WHERE w.type='offboarding'
      GROUP BY w.id, e.employee_id, e.first_name, e.last_name, e.preferred_name, e.department, e.job_title, x.id, au.display_name, oe.preferred_name, oe.first_name, oe.last_name
      ORDER BY COALESCE(w.completed_at, w.updated_at) DESC LIMIT 160`).all<OffboardingWorkflow>(),
    actor ? database.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL").bind(actor.email).first<{ employee_id: string }>() : Promise.resolve(null),
  ])
  const personName = (row: { first_name?: string; last_name?: string; preferred_name?: string | null; employee_id: string }) => `${row.preferred_name || row.first_name || row.employee_id} ${row.last_name || ""}`.trim()
  const isPeopleTeam = !actor || actor.role === "admin" || actor.role === "hr"
  const ownEmail = actor?.email.toLowerCase() ?? ""
  const employeeId = actorEmployee?.employee_id ?? null
  const visibleLeave = (leave.results ?? []).filter((row) => isPeopleTeam || row.work_email?.toLowerCase() === ownEmail || actor?.role === "manager" && row.manager_id === employeeId)
  const visibleHiring = (hiring.results ?? []).filter((row) => isPeopleTeam || actor?.role === "manager" && String(row.requested_by_email ?? "").toLowerCase() === ownEmail)
  const visibleTraining = (training.results ?? []).filter((row) => isPeopleTeam || row.work_email?.toLowerCase() === ownEmail || actor?.role === "manager" && row.manager_id === employeeId)
  const visibleInsight = (insight.results ?? []).filter((row) => isPeopleTeam || row.owner_email?.toLowerCase() === ownEmail || row.requested_by_email?.toLowerCase() === ownEmail)
  const visibleServices = (services.results ?? []).filter((row) => isPeopleTeam || row.work_email?.toLowerCase() === ownEmail || row.owner_email?.toLowerCase() === ownEmail)
  const visibleOnboarding = isPeopleTeam ? onboarding.results ?? [] : []
  const visibleOffboarding = isPeopleTeam ? offboarding.results ?? [] : []
  const detailValue = (row: WorkflowPerson, field: string): string | null => {
    try { return String((JSON.parse(row.details_json ?? "{}") as Record<string, unknown>)[field] ?? "") || null } catch { return null }
  }
  const insightRecordHref = (row: WorkflowPerson & { id: string }): string => {
    const params = new URLSearchParams({ item: row.id })
    try {
      const details = JSON.parse(row.details_json ?? "{}") as { filters?: Record<string, unknown> }
      const filters = details.filters ?? {}
      for (const key of ["from", "to", "department", "location", "period", "recruitingCostPerHire", "vacancyProductivityPercent", "onboardingDays", "onboardingProductivityPercent", "courseFeePerLearner", "courseHoursPerLearner"]) {
        const value = filters[key]
        if ((typeof value === "string" && value.trim()) || (typeof value === "number" && Number.isFinite(value))) params.set(key, String(value))
      }
    } catch {
      // Older insight workflows may not have a stored reporting scope.
    }
    return `/insights?${params.toString()}`
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
        recordHref: `/leaves?request=${encodeURIComponent(row.id)}`,
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
        recordHref: `/onboarding?view=talent&requisition=${encodeURIComponent(String(row.id))}`,
      }
    }),
    ...visibleTraining.map((row): InboxItem => {
      const isCompleted = Boolean(row.completed_at) || row.completion_status.toLowerCase() === "completed"
      const dueDate = row.due_at?.slice(0, 10) || detailValue(row, "dueDate") || row.completion_date
      const sla = slaStatus(dueDate, isCompleted)
      const canComplete = Boolean(!isCompleted && row.requested_by_email && actor && row.work_email?.toLowerCase() === ownEmail)
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
        recordHref: `/courses?assignment=${encodeURIComponent(row.id)}`,
      }
    }),
    ...visibleInsight.map((row): InboxItem => {
      const isCompleted = Boolean(row.completed_at) || row.workflow_status?.toLowerCase() === "completed"
      const dueDate = row.due_at?.slice(0, 10) ?? null
      const sla = slaStatus(dueDate, isCompleted)
      const department = detailValue(row, "department") || "Workforce"
      const evidence = detailValue(row, "evidence") || "Evidence snapshot unavailable"
      const recommendedAction = detailValue(row, "recommendedAction") || row.next_action || "Review the evidence and record an accountable action."
      return {
        id: row.id, type: "insight", title: row.title, detail: `${department} · calculated workforce exception`, person: null, employeeId: null,
        dueDate, status: row.workflow_status || "Pending", priority: priority(row, sla), owner: ownerLabel(row, "People Operations"), ownerEmail: row.owner_email ?? null,
        nextAction: row.next_action || recommendedAction, attentionReason: row.blocked_reason || (sla === "overdue" ? "The follow-up deadline has passed." : "A calculated workforce exception has an assigned follow-up."),
        completionEffect: "The work plan, owner, outcome, and evidence snapshot remain in the workflow audit record.", assignedTo: "hr", requiresDecision: false,
        requestContext: [
          { label: "Department", value: department },
          { label: "Evidence", value: evidence },
          { label: "Recommended action", value: recommendedAction },
          ...(detailValue(row, "reportingScope") ? [{ label: "Reporting scope", value: detailValue(row, "reportingScope") as string }] : []),
        ],
        isCompleted, slaStatus: sla, timeInStatusDays: daysSince(row.assigned_at || row.workflow_updated_at || row.workflow_created_at),
        createdAt: row.workflow_created_at || row.updated_at || nowIso, completedAt: row.completed_at ?? null, completionNotes: row.completion_notes ?? null, blockedReason: row.blocked_reason ?? null,
        actionable: false, actions: [],
        reviewHref: reviewHref("insight", row.id, isCompleted ? "completed" : "my_work"),
        recordHref: insightRecordHref(row),
      }
    }),
    ...visibleServices.map((row): InboxItem => {
      const type = row.type === "reimbursement" ? "reimbursement" : "case"
      const status = row.workflow_status || "Open"
      const isCompleted = Boolean(row.completed_at) || ["approved", "rejected", "paid", "resolved", "closed"].includes(status.toLowerCase())
      const dueDate = row.due_at?.slice(0, 10) ?? null
      const sla = slaStatus(dueDate, isCompleted)
      const restricted = detailValue(row, "confidentiality") === "restricted"
      const selfSubmitted = row.requested_by_email?.toLowerCase() === ownEmail
      const roleCanAct = type === "reimbursement"
        ? isPeopleTeam && !selfSubmitted
        : (isPeopleTeam || !restricted && row.owner_email?.toLowerCase() === ownEmail)
          && (!selfSubmitted || actor?.role === "admin" && !restricted)
      const canAct = Boolean(!isCompleted && actor && roleCanAct)
      const amount = detailValue(row, "amount")
      const currency = detailValue(row, "currency")
      return {
        id: row.id, type, title: row.title, detail: type === "reimbursement" && amount ? `${currency || "USD"} ${amount} · ${detailValue(row, "category") || "expense"}` : detailValue(row, "category") || "Employee request",
        person: personName(row), employeeId: row.employee_id, dueDate, status, priority: priority(row, sla), owner: ownerLabel(row, type === "reimbursement" ? "Finance" : "People Operations"), ownerEmail: row.owner_email ?? null,
        nextAction: row.next_action || (type === "reimbursement" ? "Review the claim and receipt." : "Review the request and record a resolution."),
        attentionReason: row.blocked_reason || (sla === "overdue" ? "The response target has passed." : "An employee service request is awaiting review."),
        completionEffect: type === "reimbursement" ? "The claim decision is recorded and returned to the employee." : "The resolution is recorded in the employee's request history.",
        requestContext: [
          { label: "Category", value: detailValue(row, "category") || "Other" },
          ...(amount ? [{ label: "Amount", value: `${currency || "USD"} ${amount}` }] : []),
          ...((row.service_description || detailValue(row, "description")) ? [{ label: type === "case" ? "Employee request" : "Description", value: row.service_description || detailValue(row, "description") as string }] : []),
          ...(row.receipt_document_id ? [{ label: "Receipt", value: `Document ${row.receipt_document_id} is attached to the employee profile` }] : []),
          { label: "Submitted by", value: row.requested_by_email || row.work_email || "Employee" },
        ],
        assignedTo: row.manager_email && row.owner_email?.toLowerCase() === row.manager_email.toLowerCase() ? "manager" : "hr",
        requiresDecision: type === "reimbursement" && !isCompleted, isCompleted, slaStatus: sla,
        timeInStatusDays: daysSince(row.assigned_at || row.workflow_updated_at || row.workflow_created_at), createdAt: row.workflow_created_at || row.updated_at || nowIso,
        completedAt: row.completed_at ?? null, completionNotes: row.completion_notes ?? null, blockedReason: row.blocked_reason ?? null,
        actionable: canAct, actions: canAct ? type === "reimbursement" ? ["reject", "approve"] : ["complete"] : [],
        reviewHref: reviewHref(type, row.id, isCompleted ? "completed" : type === "reimbursement" ? "decisions" : "my_work"),
        recordHref: reviewHref(type, row.id, isCompleted ? "completed" : type === "reimbursement" ? "decisions" : "my_work"),
      }
    }),
    ...visibleOnboarding.map((row): InboxItem => {
      const status = row.workflow_status || "Submitted"
      const isCompleted = Boolean(row.completed_at) || ["approved", "rejected"].includes(status.toLowerCase())
      const dueDate = row.due_at?.slice(0, 10) ?? null
      const sla = slaStatus(dueDate, isCompleted)
      const displayName = `${row.preferred_name || row.first_name} ${row.last_name}`.trim()
      const canDecide = Boolean(!isCompleted && actor && row.requested_by_email?.toLowerCase() !== ownEmail)
      return {
        id: row.id, type: "onboarding", title: row.title, detail: `${row.job_title} · ${row.department} · ${row.location}`,
        person: displayName, employeeId: row.employee_id, dueDate, status, priority: priority(row, sla),
        owner: ownerLabel(row, "People Operations"), ownerEmail: row.owner_email ?? null,
        nextAction: row.next_action || "Verify organization, reporting line, job profile, and compensation.",
        attentionReason: row.blocked_reason || (sla === "overdue" ? "The onboarding verification target has passed." : "Self-reported employment details require HR verification."),
        completionEffect: "Approval activates the employee profile; rejection returns it for correction.",
        requestContext: [
          { label: "Organization", value: row.organization_name },
          { label: "Role", value: `${row.job_title} · ${row.job_level}` },
          { label: "Department and location", value: `${row.department} · ${row.location}` },
          { label: "Manager", value: row.manager_name || "Not provided" },
          { label: "Compensation submitted", value: `${row.salary_currency} ${Number(row.requested_annual_salary).toLocaleString()}` },
        ],
        assignedTo: "hr", requiresDecision: !isCompleted, isCompleted, slaStatus: sla,
        timeInStatusDays: daysSince(row.assigned_at || row.workflow_updated_at || row.workflow_created_at),
        createdAt: row.workflow_created_at || nowIso, completedAt: row.completed_at ?? null,
        completionNotes: row.completion_notes ?? null, blockedReason: row.blocked_reason ?? null,
        actionable: canDecide, actions: canDecide ? ["reject", "approve"] : [],
        reviewHref: reviewHref("onboarding", row.id, isCompleted ? "completed" : "decisions"),
        recordHref: `/people/${encodeURIComponent(row.employee_id)}`,
      }
    }),
    ...visibleOffboarding.map((row): InboxItem => {
      const isCompleted = Boolean(row.completed_at) || ["completed", "cancelled", "closed"].includes((row.exit_status || row.workflow_status || "").toLowerCase())
      const dueDate = row.due_at?.slice(0, 10) || row.expected_exit_date
      const sla = slaStatus(dueDate, isCompleted)
      return {
        id: row.id, type: "offboarding", title: `${personName(row)} offboarding`, detail: `${row.exit_type} · ${row.job_title} · last day ${row.expected_exit_date}`,
        person: personName(row), employeeId: row.employee_id, dueDate, status: row.exit_status || row.workflow_status || "Scheduled",
        priority: priority(row, sla), owner: ownerLabel(row, "People Operations"), ownerEmail: row.owner_email ?? null,
        nextAction: row.next_action || "Complete the employee offboarding checklist.",
        attentionReason: row.blocked_reason || `${Number(row.open_tasks)} checklist item${Number(row.open_tasks) === 1 ? "" : "s"} remain open.`,
        completionEffect: "The completed exit updates employee status, asset custody, access tasks, and attrition history.",
        requestContext: [
          { label: "Exit", value: `${row.exit_type} · ${row.expected_exit_date}` },
          { label: "Open checklist", value: `${Number(row.open_tasks)} tasks · ${Number(row.open_assets)} assets` },
          { label: "Department", value: row.department },
        ],
        assignedTo: "hr", requiresDecision: false, isCompleted, slaStatus: sla,
        timeInStatusDays: daysSince(row.assigned_at || row.workflow_updated_at || row.workflow_created_at),
        createdAt: row.workflow_created_at || nowIso, completedAt: row.completed_at ?? null,
        completionNotes: row.completion_notes ?? null, blockedReason: row.blocked_reason ?? null,
        actionable: false, actions: [],
        reviewHref: reviewHref("offboarding", row.id, isCompleted ? "completed" : "my_work"),
        recordHref: `/exits?exit=${encodeURIComponent(row.id)}`,
      }
    }),
  ].sort((left, right) => Number(left.isCompleted) - Number(right.isCompleted)
    || ({ high: 0, medium: 1, low: 2 })[left.priority] - ({ high: 0, medium: 1, low: 2 })[right.priority]
    || (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31")
    || right.createdAt.localeCompare(left.createdAt))
}

export async function decideLeave(leaveId: string, decision: "Approved" | "Rejected", actor: RequestActor, note = ""): Promise<void> {
  const database = await databaseOrThrow()
  const leave = await database.prepare("SELECT l.*, e.work_email, e.manager_id FROM leave_requests_view l LEFT JOIN employee_directory_view e ON e.employee_id=l.employee_id WHERE l.id = ?")
    .bind(leaveId).first<LeaveRecord & { work_email: string | null; manager_id: string | null }>()
  if (!leave) throw new PeopleError("Leave request not found.", 404)
  if (leave.data_source === "demo") throw new PeopleError("Presentation sample records are read-only.", 403)
  if (leave.approval_status.toLowerCase() !== "pending") throw new PeopleError("This leave request has already been decided.", 409)
  if (leave.work_email?.toLowerCase() === actor.email.toLowerCase()) throw new PeopleError("You cannot decide your own leave request.", 403)
  if (actor.role === "manager") {
    const manager = await database.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL")
      .bind(actor.email).first<{ employee_id: string }>()
    if (!manager || leave.manager_id !== manager.employee_id) throw new PeopleError("Managers can only decide leave for their direct reports.", 403)
  }
  const decisionNote = note.trim()
  if (decision === "Rejected" && decisionNote.length < 10) throw new PeopleError("Record a clear reason for declining the request.", 422)
  const completionNote = decisionNote || `${actor.displayName} approved the leave request.`
  await database.batch([
    database.prepare("UPDATE leave_records SET approval_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(decision, leaveId),
    database.prepare("UPDATE workflow_requests SET status=?, next_action='No further action.', assigned_at=CURRENT_TIMESTAMP, resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND type='leave'")
      .bind(decision, actor.email, completionNote, leaveId),
    database.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, 'leave_decision', ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), leave.employee_id, `${actor.displayName} ${decision.toLowerCase()} a ${leave.leave_type} leave request`, JSON.stringify({ leaveId, from: leave.approval_status, to: decision, note: decisionNote || null }), actor.email),
  ])
}
