import { z } from "zod"

import type {
  AssetAssignment,
  AssetCondition,
  AssetDetail,
  AssetInventory,
  AssetRecord,
  AssetStatus,
  AssetType,
  EmployeeExitDetail,
  EmployeeExitRecord,
  ExitDashboard,
  OffboardingTask,
} from "@/lib/exit-asset-types"
import type { RequestActor } from "@/lib/server/request-user"
import { ensureHrDatabase, type Database } from "@/lib/server/hr-repository"

export class ExitAssetError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

const assetTypes = ["Laptop", "Monitor", "Phone", "Access badge", "Other"] as const
const assetStatuses = ["Available", "Assigned", "Returned", "Broken", "Lost", "Retired"] as const
const assetConditions = ["Good", "Degraded", "Broken"] as const

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? null : value,
  z.string().trim().max(max).nullable().optional(),
)

const assetSchema = z.object({
  assetTag: z.string().trim().min(4).max(60).regex(/^[A-Za-z0-9_-]+$/),
  assetType: z.enum(assetTypes),
  manufacturer: optionalText(100),
  model: optionalText(120),
  serialNumber: optionalText(120),
  status: z.enum(assetStatuses).default("Available"),
  condition: z.enum(assetConditions).default("Good"),
  acquiredOn: optionalText(10),
  warrantyExpiresOn: optionalText(10),
  replacementDueOn: optionalText(10),
  notes: optionalText(1000),
}).superRefine((input, context) => {
  for (const [field, value] of [["acquiredOn", input.acquiredOn], ["warrantyExpiresOn", input.warrantyExpiresOn], ["replacementDueOn", input.replacementDueOn]] as const) {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) context.addIssue({ code: "custom", path: [field], message: "Use YYYY-MM-DD." })
  }
})

const exitSchema = z.object({
  employeeId: z.string().trim().min(2).max(80),
  exitType: z.enum(["Resignation", "Termination", "Contract end", "Other"]),
  expectedExitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: optionalText(2000),
})

const assignmentSchema = z.object({
  employeeId: z.string().trim().min(2).max(80),
  assignedAt: z.string().datetime().optional(),
  notes: optionalText(1000),
})

const returnSchema = z.object({
  condition: z.enum(assetConditions),
  notes: optionalText(1000),
})

const taskSchema = z.object({
  status: z.enum(["Pending", "In Progress", "Completed"]),
  notes: optionalText(1000),
  returnCondition: z.enum(assetConditions).optional(),
})

type AssetRow = {
  id: string
  asset_tag: string
  asset_type: AssetType
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  status: AssetStatus
  condition: AssetCondition
  lifecycle: AssetRecord["lifecycle"]
  acquired_on: string | null
  warranty_expires_on: string | null
  replacement_due_on: string | null
  notes: string | null
  assignment_id: string | null
  employee_id: string | null
  employee_name: string | null
  assigned_at: string | null
  assignment_status: "Assigned" | "Returned" | null
  assignment_notes: string | null
  created_at: string
  updated_at: string
}

type ExitRow = {
  id: string
  employee_id: string
  employee_name: string
  department: string
  job_title: string
  manager: string
  employment_status: string
  exit_type: EmployeeExitRecord["exitType"]
  expected_exit_date: string
  actual_exit_date: string | null
  status: EmployeeExitRecord["status"]
  notes: string | null
  task_count: number
  completed_task_count: number
  outstanding_hr_tasks: number
  outstanding_it_tasks: number
  outstanding_assets: number
  pending_access_tasks: number
  created_at: string
  updated_at: string
}

const assetLifecycleSql = `CASE
      WHEN a.condition='Broken' OR a.status='Broken' THEN 'Broken'
      WHEN a.condition='Degraded' THEN 'Degraded'
      WHEN (a.warranty_expires_on IS NOT NULL AND a.warranty_expires_on <= CURRENT_DATE + s.warning_days)
        OR (a.replacement_due_on IS NOT NULL AND a.replacement_due_on <= CURRENT_DATE + s.warning_days)
        OR (a.acquired_on IS NOT NULL AND a.acquired_on <= CURRENT_DATE - (s.replacement_age_years || ' years')::interval)
        THEN 'Replacement Soon'
      ELSE 'Healthy'
    END`

const assetSelect = `
  SELECT a.id, a.asset_tag, a.asset_type, a.manufacturer, a.model, a.serial_number, a.status, a.condition,
    a.acquired_on::text, a.warranty_expires_on::text, a.replacement_due_on::text, a.notes,
    ${assetLifecycleSql} AS lifecycle,
    aa.id AS assignment_id, aa.employee_id,
    NULLIF(TRIM(COALESCE(NULLIF(e.preferred_name,''), e.first_name, '') || ' ' || COALESCE(e.last_name,'')), '') AS employee_name,
    aa.assigned_at::text, aa.status AS assignment_status, aa.notes AS assignment_notes,
    a.created_at::text, a.updated_at::text
  FROM assets a
  JOIN asset_lifecycle_settings s ON s.organization_id=a.organization_id
  LEFT JOIN asset_assignments aa ON aa.asset_id=a.id AND aa.status='Assigned' AND aa.returned_at IS NULL
  LEFT JOIN employees e ON e.employee_id=aa.employee_id`

const exitSelect = `
  SELECT x.id, x.employee_id,
    TRIM(COALESCE(NULLIF(e.preferred_name,''), e.first_name) || ' ' || e.last_name) AS employee_name,
    e.department, e.job_title, e.manager, e.employment_status,
    x.exit_type, x.expected_exit_date::text, x.actual_exit_date::text, x.status, x.notes,
    COUNT(t.id) AS task_count,
    COUNT(t.id) FILTER (WHERE t.status='Completed') AS completed_task_count,
    COUNT(t.id) FILTER (WHERE t.status<>'Completed' AND t.owner_team IN ('HR','Payroll')) AS outstanding_hr_tasks,
    COUNT(t.id) FILTER (WHERE t.status<>'Completed' AND t.owner_team='IT') AS outstanding_it_tasks,
    COUNT(t.id) FILTER (WHERE t.status<>'Completed' AND t.asset_assignment_id IS NOT NULL) AS outstanding_assets,
    COUNT(t.id) FILTER (WHERE t.status<>'Completed' AND t.task_type='access_revoked') AS pending_access_tasks,
    x.created_at::text, x.updated_at::text
  FROM employee_exits x
  JOIN employee_directory_view e ON e.employee_id=x.employee_id
  LEFT JOIN offboarding_tasks t ON t.employee_exit_id=x.id`

async function database(): Promise<Database> {
  const db = await ensureHrDatabase()
  if (!db) throw new ExitAssetError("Exit and asset storage is unavailable.", 503)
  return db
}

function assignmentFromRow(row: AssetRow): AssetAssignment | null {
  if (!row.assignment_id || !row.employee_id || !row.assigned_at) return null
  return {
    id: row.assignment_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || row.employee_id,
    assignedAt: row.assigned_at,
    returnedAt: null,
    status: row.assignment_status ?? "Assigned",
    returnCondition: null,
    notes: row.assignment_notes,
  }
}

function assetFromRow(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    assetTag: row.asset_tag,
    assetType: row.asset_type,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serial_number,
    status: row.status,
    condition: row.condition,
    lifecycle: row.lifecycle,
    acquiredOn: row.acquired_on,
    warrantyExpiresOn: row.warranty_expires_on,
    replacementDueOn: row.replacement_due_on,
    notes: row.notes,
    currentAssignment: assignmentFromRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function exitFromRow(row: ExitRow): EmployeeExitRecord {
  const taskCount = Number(row.task_count ?? 0)
  const completedTaskCount = Number(row.completed_task_count ?? 0)
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    department: row.department,
    jobTitle: row.job_title,
    manager: row.manager,
    employmentStatus: row.employment_status,
    exitType: row.exit_type,
    expectedExitDate: row.expected_exit_date,
    actualExitDate: row.actual_exit_date,
    status: row.status,
    notes: row.notes,
    progress: taskCount ? Math.round((completedTaskCount / taskCount) * 100) : 0,
    outstandingHrTasks: Number(row.outstanding_hr_tasks ?? 0),
    outstandingItTasks: Number(row.outstanding_it_tasks ?? 0),
    outstandingAssets: Number(row.outstanding_assets ?? 0),
    pendingAccessTasks: Number(row.pending_access_tasks ?? 0),
    taskCount,
    completedTaskCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized || null
}

export async function listAssets({ search = "", type = "", status = "", condition = "", lifecycle = "", limit = 100, offset = 0 } = {}): Promise<AssetInventory> {
  const db = await database()
  const where = ["a.organization_id='org:laidbackhr'"]
  const bindings: unknown[] = []
  if (search.trim()) { where.push("LOWER(a.asset_tag || ' ' || COALESCE(a.serial_number,'') || ' ' || COALESCE(a.manufacturer,'') || ' ' || COALESCE(a.model,'') || ' ' || COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')) LIKE ?"); bindings.push(`%${search.trim().toLowerCase()}%`) }
  if (type) { where.push("a.asset_type=?"); bindings.push(type) }
  if (status) { where.push("a.status=?"); bindings.push(status) }
  if (condition) { where.push("a.condition=?"); bindings.push(condition) }
  if (lifecycle) { where.push(`(${assetLifecycleSql})=?`); bindings.push(lifecycle) }
  const base = `${assetSelect} WHERE ${where.join(" AND ")}`
  const rows = await db.prepare(`${base} ORDER BY a.updated_at DESC, a.asset_tag LIMIT ? OFFSET ?`).bind(...bindings, Math.min(Math.max(limit, 1), 250), Math.max(offset, 0)).all<AssetRow>()
  const count = await db.prepare(`SELECT COUNT(*) AS count FROM (${base}) q`).bind(...bindings).first<{ count: number }>()
  const summary = await db.prepare(`SELECT COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status='Assigned') AS assigned,
    COUNT(*) FILTER (WHERE status='Available') AS available,
    COUNT(*) FILTER (WHERE status='Broken' OR condition='Broken') AS broken,
    COUNT(*) FILTER (WHERE status='Lost') AS lost,
    COUNT(*) FILTER (WHERE condition='Degraded') AS degraded,
    COUNT(*) FILTER (WHERE warranty_expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days') AS warranty_expiring,
    COUNT(*) FILTER (WHERE replacement_due_on <= CURRENT_DATE + INTERVAL '90 days' AND status<>'Retired') AS replacement_due
    FROM assets WHERE organization_id='org:laidbackhr'`).first<Record<string, number>>()
  const items = (rows.results ?? []).map(assetFromRow)
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: Number(summary?.total ?? 0), assigned: Number(summary?.assigned ?? 0), available: Number(summary?.available ?? 0),
      broken: Number(summary?.broken ?? 0), lost: Number(summary?.lost ?? 0), degraded: Number(summary?.degraded ?? 0),
      warrantyExpiring: Number(summary?.warranty_expiring ?? 0), replacementDue: Number(summary?.replacement_due ?? 0),
    },
    dimensions: { types: [...assetTypes], statuses: [...assetStatuses], conditions: [...assetConditions] },
    total: Number(count?.count ?? 0),
    items,
  }
}

export async function getAsset(assetIdOrTag: string): Promise<AssetDetail> {
  const db = await database()
  const row = await db.prepare(`${assetSelect} WHERE a.organization_id='org:laidbackhr' AND (a.id=? OR UPPER(a.asset_tag)=UPPER(?))`).bind(assetIdOrTag, assetIdOrTag).first<AssetRow>()
  if (!row) throw new ExitAssetError("Asset not found.", 404)
  const history = await db.prepare(`SELECT aa.id, aa.employee_id,
    TRIM(COALESCE(NULLIF(e.preferred_name,''), e.first_name) || ' ' || e.last_name) AS employee_name,
    aa.assigned_at::text, aa.returned_at::text, aa.status, aa.return_condition, aa.notes
    FROM asset_assignments aa JOIN employees e ON e.employee_id=aa.employee_id
    WHERE aa.asset_id=? ORDER BY aa.assigned_at DESC`).bind(row.id).all<{ id: string; employee_id: string; employee_name: string; assigned_at: string; returned_at: string | null; status: "Assigned" | "Returned"; return_condition: AssetCondition | null; notes: string | null }>()
  return { ...assetFromRow(row), assignmentHistory: (history.results ?? []).map((item) => ({ id: item.id, employeeId: item.employee_id, employeeName: item.employee_name, assignedAt: item.assigned_at, returnedAt: item.returned_at, status: item.status, returnCondition: item.return_condition, notes: item.notes })) }
}

export async function createAsset(value: unknown, actor: RequestActor): Promise<AssetDetail> {
  const input = assetSchema.parse(value)
  if (input.status === "Assigned") throw new ExitAssetError("Create the asset as available, then assign it to an employee.")
  const db = await database()
  const id = `ASSET-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  try {
    await db.prepare(`INSERT INTO assets(id, organization_id, asset_tag, asset_type, manufacturer, model, serial_number, status, condition,
      acquired_on, warranty_expires_on, replacement_due_on, notes, data_source)
      VALUES (?, 'org:laidbackhr', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'operational')`)
      .bind(id, input.assetTag.toUpperCase(), input.assetType, clean(input.manufacturer), clean(input.model), clean(input.serialNumber), input.status, input.condition, clean(input.acquiredOn), clean(input.warrantyExpiresOn), clean(input.replacementDueOn), clean(input.notes)).run()
  } catch (error) {
    if (/unique/i.test(String(error))) throw new ExitAssetError("Asset ID or serial number already exists.", 409)
    throw error
  }
  return getAsset(id)
}

export async function updateAsset(assetId: string, value: unknown): Promise<AssetDetail> {
  const input = assetSchema.parse(value)
  const db = await database()
  const current = await getAsset(assetId)
  if (current.currentAssignment && input.status !== "Assigned") throw new ExitAssetError("Return the active assignment before changing the asset status.", 409)
  try {
    await db.prepare(`UPDATE assets SET asset_tag=?, asset_type=?, manufacturer=?, model=?, serial_number=?, status=?, condition=?,
      acquired_on=?, warranty_expires_on=?, replacement_due_on=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(input.assetTag.toUpperCase(), input.assetType, clean(input.manufacturer), clean(input.model), clean(input.serialNumber), input.status, input.condition, clean(input.acquiredOn), clean(input.warrantyExpiresOn), clean(input.replacementDueOn), clean(input.notes), current.id).run()
  } catch (error) {
    if (/unique/i.test(String(error))) throw new ExitAssetError("Asset ID or serial number already exists.", 409)
    throw error
  }
  return getAsset(current.id)
}

export async function assignAsset(assetId: string, value: unknown, actor: RequestActor): Promise<AssetDetail> {
  const input = assignmentSchema.parse(value)
  const db = await database()
  const [asset, employee] = await Promise.all([
    getAsset(assetId),
    db.prepare("SELECT employee_id, employment_status FROM employee_directory_view WHERE employee_id=? AND archived_at IS NULL").bind(input.employeeId).first<{ employee_id: string; employment_status: string }>(),
  ])
  if (!employee) throw new ExitAssetError("Employee not found.", 404)
  if (!["active", "on leave", "on bench"].includes(employee.employment_status.toLowerCase())) throw new ExitAssetError("Assets can only be assigned to an active, on-leave, or bench employee.", 409)
  if (asset.currentAssignment || asset.status === "Assigned") throw new ExitAssetError("This asset already has an active assignment.", 409)
  if (["Broken", "Lost", "Retired"].includes(asset.status) || asset.condition === "Broken") throw new ExitAssetError("This asset is not available for assignment.", 409)
  const assignmentId = `ASSIGN-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  await db.batch([
    db.prepare("INSERT INTO asset_assignments(id, asset_id, employee_id, assigned_at, status, assigned_by_email, notes) VALUES (?, ?, ?, ?, 'Assigned', ?, ?)")
      .bind(assignmentId, asset.id, input.employeeId, input.assignedAt ?? new Date().toISOString(), actor.email, clean(input.notes)),
    db.prepare("UPDATE assets SET status='Assigned', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(asset.id),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'asset_assigned', ?, ?, ?)")
      .bind(crypto.randomUUID(), input.employeeId, `${asset.assetTag} assigned`, JSON.stringify({ assetId: asset.id, assetTag: asset.assetTag, assignmentId }), actor.email),
  ])
  return getAsset(asset.id)
}

async function activeAssignment(db: Database, assetId: string) {
  return db.prepare("SELECT id, asset_id, employee_id FROM asset_assignments WHERE asset_id=? AND status='Assigned' AND returned_at IS NULL").bind(assetId).first<{ id: string; asset_id: string; employee_id: string }>()
}

async function syncExitProgress(db: Database, employeeId: string): Promise<void> {
  const exit = await db.prepare("SELECT id FROM employee_exits WHERE employee_id=? AND status IN ('Scheduled','In Progress') ORDER BY expected_exit_date LIMIT 1").bind(employeeId).first<{ id: string }>()
  if (!exit) return
  const remaining = await db.prepare("SELECT COUNT(*) AS count FROM offboarding_tasks WHERE employee_exit_id=? AND status<>'Completed'").bind(exit.id).first<{ count: number }>()
  await db.prepare("UPDATE employee_exits SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(Number(remaining?.count ?? 0) ? "In Progress" : "Scheduled", exit.id).run()
  await db.prepare("UPDATE workflow_requests SET status=?, next_action=?, updated_at=CURRENT_TIMESTAMP WHERE source_entity_type='employee_exit' AND source_entity_id=?")
    .bind(Number(remaining?.count ?? 0) ? "In Progress" : "Ready to complete", Number(remaining?.count ?? 0) ? "Complete the employee offboarding checklist." : "Confirm the actual last working date and complete the exit.", exit.id).run()
}

export async function returnAsset(assetId: string, value: unknown, actor: RequestActor): Promise<AssetDetail> {
  const input = returnSchema.parse(value)
  const db = await database()
  const asset = await getAsset(assetId)
  const assignment = await activeAssignment(db, asset.id)
  if (!assignment) throw new ExitAssetError("This asset has no active assignment.", 409)
  const nextStatus: AssetStatus = input.condition === "Broken" ? "Broken" : "Returned"
  await db.batch([
    db.prepare("UPDATE asset_assignments SET status='Returned', returned_at=CURRENT_TIMESTAMP, return_condition=?, returned_by_email=?, notes=COALESCE(?, notes), updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(input.condition, actor.email, clean(input.notes), assignment.id),
    db.prepare("UPDATE assets SET status=?, condition=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(nextStatus, input.condition, asset.id),
    db.prepare("UPDATE offboarding_tasks SET status='Completed', completed_at=CURRENT_TIMESTAMP, completed_by_email=?, notes=COALESCE(?, notes), updated_at=CURRENT_TIMESTAMP WHERE asset_assignment_id=? AND status<>'Completed'")
      .bind(actor.email, clean(input.notes), assignment.id),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'asset_returned', ?, ?, ?)")
      .bind(crypto.randomUUID(), assignment.employee_id, `${asset.assetTag} returned`, JSON.stringify({ assetId: asset.id, assignmentId: assignment.id, condition: input.condition }), actor.email),
  ])
  await syncExitProgress(db, assignment.employee_id)
  return getAsset(asset.id)
}

export async function listEmployeeExits({ search = "", status = "", horizon = 0, limit = 100, offset = 0 } = {}): Promise<ExitDashboard> {
  const db = await database()
  const where = ["1=1"]
  const bindings: unknown[] = []
  if (search.trim()) { where.push("LOWER(x.id || ' ' || x.employee_id || ' ' || e.first_name || ' ' || e.last_name || ' ' || e.department || ' ' || e.job_title) LIKE ?"); bindings.push(`%${search.trim().toLowerCase()}%`) }
  if (status) { where.push("x.status=?"); bindings.push(status) }
  if (horizon > 0) { where.push("x.status IN ('Scheduled','In Progress') AND x.expected_exit_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (? || ' days')::interval"); bindings.push(Math.min(horizon, 365)) }
  const group = " GROUP BY x.id, e.employee_id, e.first_name, e.last_name, e.preferred_name, e.department, e.job_title, e.manager, e.employment_status"
  const base = `${exitSelect} WHERE ${where.join(" AND ")}${group}`
  const [rows, count, summary] = await Promise.all([
    db.prepare(`${base} ORDER BY CASE x.status WHEN 'In Progress' THEN 0 WHEN 'Scheduled' THEN 1 WHEN 'Completed' THEN 2 ELSE 3 END, x.expected_exit_date LIMIT ? OFFSET ?`).bind(...bindings, Math.min(Math.max(limit, 1), 250), Math.max(offset, 0)).all<ExitRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM employee_exits x JOIN employee_directory_view e ON e.employee_id=x.employee_id WHERE ${where.join(" AND ")}`).bind(...bindings).first<{ count: number }>(),
    db.prepare(`SELECT
      COUNT(*) FILTER (WHERE x.status IN ('Scheduled','In Progress') AND x.expected_exit_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') AS leaving_30,
      COUNT(*) FILTER (WHERE x.status IN ('Scheduled','In Progress') AND x.expected_exit_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days') AS leaving_60,
      COUNT(*) FILTER (WHERE x.status IN ('Scheduled','In Progress') AND x.expected_exit_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days') AS leaving_90,
      COUNT(DISTINCT x.id) FILTER (WHERE x.status IN ('Scheduled','In Progress') AND EXISTS (SELECT 1 FROM offboarding_tasks t WHERE t.employee_exit_id=x.id AND t.status<>'Completed')) AS incomplete,
      COUNT(*) FILTER (WHERE t.status<>'Completed' AND t.asset_assignment_id IS NOT NULL) AS assets,
      COUNT(*) FILTER (WHERE t.status<>'Completed' AND t.task_type='access_revoked') AS access
      FROM employee_exits x LEFT JOIN offboarding_tasks t ON t.employee_exit_id=x.id`).first<Record<string, number>>(),
  ])
  return {
    generatedAt: new Date().toISOString(),
    summary: { leaving30Days: Number(summary?.leaving_30 ?? 0), leaving60Days: Number(summary?.leaving_60 ?? 0), leaving90Days: Number(summary?.leaving_90 ?? 0), incompleteOffboarding: Number(summary?.incomplete ?? 0), outstandingAssets: Number(summary?.assets ?? 0), pendingAccessRemoval: Number(summary?.access ?? 0) },
    total: Number(count?.count ?? 0),
    items: (rows.results ?? []).map(exitFromRow),
  }
}

export async function getEmployeeExit(exitId: string): Promise<EmployeeExitDetail> {
  const db = await database()
  const group = " GROUP BY x.id, e.employee_id, e.first_name, e.last_name, e.preferred_name, e.department, e.job_title, e.manager, e.employment_status"
  const row = await db.prepare(`${exitSelect} WHERE x.id=?${group}`).bind(exitId).first<ExitRow>()
  if (!row) throw new ExitAssetError("Employee exit not found.", 404)
  const [tasks, assets] = await Promise.all([
    db.prepare(`SELECT t.id, t.task_type, t.title, t.owner_team, t.status, t.due_date::text, t.completed_at::text,
      t.completed_by_email, t.asset_assignment_id, a.asset_tag, t.notes
      FROM offboarding_tasks t
      LEFT JOIN asset_assignments aa ON aa.id=t.asset_assignment_id
      LEFT JOIN assets a ON a.id=aa.asset_id
      WHERE t.employee_exit_id=? ORDER BY CASE t.status WHEN 'In Progress' THEN 0 WHEN 'Pending' THEN 1 ELSE 2 END, t.due_date, t.owner_team, t.title`).bind(exitId).all<{ id: string; task_type: string; title: string; owner_team: OffboardingTask["ownerTeam"]; status: OffboardingTask["status"]; due_date: string | null; completed_at: string | null; completed_by_email: string | null; asset_assignment_id: string | null; asset_tag: string | null; notes: string | null }>(),
    db.prepare(`${assetSelect} WHERE aa.employee_id=?`).bind(row.employee_id).all<AssetRow>(),
  ])
  return {
    ...exitFromRow(row),
    tasks: (tasks.results ?? []).map((task) => ({ id: task.id, taskType: task.task_type, title: task.title, ownerTeam: task.owner_team, status: task.status, dueDate: task.due_date, completedAt: task.completed_at, completedByEmail: task.completed_by_email, assetAssignmentId: task.asset_assignment_id, assetTag: task.asset_tag, notes: task.notes })),
    assets: (assets.results ?? []).map(assetFromRow),
  }
}

export async function createEmployeeExit(value: unknown, actor: RequestActor): Promise<EmployeeExitDetail> {
  const input = exitSchema.parse(value)
  const db = await database()
  const employee = await db.prepare("SELECT employee_id, employment_status FROM employee_directory_view WHERE employee_id=? AND archived_at IS NULL").bind(input.employeeId).first<{ employee_id: string; employment_status: string }>()
  if (!employee) throw new ExitAssetError("Employee not found.", 404)
  if (["terminated", "resigned"].includes(employee.employment_status.toLowerCase())) throw new ExitAssetError("This employee has already left the organization.", 409)
  const existing = await db.prepare("SELECT id FROM employee_exits WHERE employee_id=? AND status IN ('Scheduled','In Progress')").bind(input.employeeId).first<{ id: string }>()
  if (existing) throw new ExitAssetError("This employee already has an open exit workflow.", 409)
  const exitId = `EXIT-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const assignments = await db.prepare("SELECT aa.id, a.asset_tag FROM asset_assignments aa JOIN assets a ON a.id=aa.asset_id WHERE aa.employee_id=? AND aa.status='Assigned' AND aa.returned_at IS NULL ORDER BY a.asset_tag").bind(input.employeeId).all<{ id: string; asset_tag: string }>()
  const expected = new Date(`${input.expectedExitDate}T00:00:00Z`)
  const due = (days: number) => new Date(expected.getTime() - days * 86_400_000).toISOString().slice(0, 10)
  const taskTemplates = [
    ["manager_notified", "Manager notified", "Manager", 21],
    ["knowledge_transfer", "Knowledge transfer completed", "Manager", 5],
    ["exit_interview", "Exit interview completed", "HR", 2],
    ["access_revoked", "System access revoked", "IT", 0],
    ["final_payroll", "Final payroll processed", "Payroll", 0],
  ] as const
  await db.batch([
    db.prepare("INSERT INTO employee_exits(id, employee_id, previous_employment_status, exit_type, expected_exit_date, status, notes, created_by_email) VALUES (?, ?, ?, ?, ?, 'Scheduled', ?, ?)")
      .bind(exitId, input.employeeId, employee.employment_status, input.exitType, input.expectedExitDate, clean(input.notes), actor.email),
    db.prepare("UPDATE employees SET employment_status=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE employee_id=?")
      .bind(input.exitType === "Resignation" ? "Notice Period" : "Scheduled Exit", input.employeeId),
    ...taskTemplates.map(([type, title, owner, days]) => db.prepare("INSERT INTO offboarding_tasks(id, employee_exit_id, task_type, title, owner_team, status, due_date) VALUES (?, ?, ?, ?, ?, 'Pending', ?)")
      .bind(`TASK-${crypto.randomUUID().slice(0, 12).toUpperCase()}`, exitId, type, title, owner, due(days))),
    ...(assignments.results ?? []).map((assignment) => db.prepare("INSERT INTO offboarding_tasks(id, employee_exit_id, task_type, title, owner_team, status, due_date, asset_assignment_id) VALUES (?, ?, 'asset_return', ?, 'IT', 'Pending', ?, ?)")
      .bind(`TASK-${crypto.randomUUID().slice(0, 12).toUpperCase()}`, exitId, `${assignment.asset_tag} returned`, input.expectedExitDate, assignment.id)),
    db.prepare(`INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, priority, owner_email, due_at, next_action, source_entity_type, source_entity_id, assigned_at, confidentiality_level)
      VALUES (?, 'offboarding', ?, 'Employee offboarding', 'Scheduled', ?, ?, 'high', 'people-ops@laidbackhr.cloud', ?, 'Complete the employee offboarding checklist.', 'employee_exit', ?, CURRENT_TIMESTAMP, 'restricted')`)
      .bind(exitId, input.employeeId, JSON.stringify({ exitType: input.exitType, expectedExitDate: input.expectedExitDate }), actor.email, input.expectedExitDate, exitId),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'exit_scheduled', 'Employee exit scheduled', ?, ?)")
      .bind(crypto.randomUUID(), input.employeeId, JSON.stringify({ exitId, exitType: input.exitType, expectedExitDate: input.expectedExitDate, assignedAssets: assignments.results?.length ?? 0 }), actor.email),
  ])
  return getEmployeeExit(exitId)
}

export async function updateOffboardingTask(exitId: string, taskId: string, value: unknown, actor: RequestActor): Promise<EmployeeExitDetail> {
  const input = taskSchema.parse(value)
  const db = await database()
  const task = await db.prepare("SELECT id, asset_assignment_id FROM offboarding_tasks WHERE id=? AND employee_exit_id=?").bind(taskId, exitId).first<{ id: string; asset_assignment_id: string | null }>()
  if (!task) throw new ExitAssetError("Offboarding task not found.", 404)
  if (task.asset_assignment_id && input.status === "Completed") {
    const assignment = await db.prepare("SELECT asset_id FROM asset_assignments WHERE id=? AND status='Assigned'").bind(task.asset_assignment_id).first<{ asset_id: string }>()
    if (assignment) await returnAsset(assignment.asset_id, { condition: input.returnCondition ?? "Good", notes: input.notes }, actor)
  }
  await db.prepare(`UPDATE offboarding_tasks SET status=?, notes=?, completed_at=CASE WHEN ?='Completed' THEN CURRENT_TIMESTAMP ELSE NULL END,
    completed_by_email=CASE WHEN ?='Completed' THEN ? ELSE NULL END, updated_at=CURRENT_TIMESTAMP WHERE id=? AND employee_exit_id=?`)
    .bind(input.status, clean(input.notes), input.status, input.status, actor.email, taskId, exitId).run()
  const exit = await getEmployeeExit(exitId)
  await syncExitProgress(db, exit.employeeId)
  return getEmployeeExit(exitId)
}

export async function completeEmployeeExit(exitId: string, actualExitDate: string, actor: RequestActor): Promise<EmployeeExitDetail> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actualExitDate)) throw new ExitAssetError("Actual exit date must use YYYY-MM-DD.")
  const db = await database()
  const exit = await getEmployeeExit(exitId)
  if (exit.status === "Completed") return exit
  if (exit.status === "Cancelled") throw new ExitAssetError("A cancelled exit cannot be completed.", 409)
  if (exit.tasks.some((task) => task.status !== "Completed")) throw new ExitAssetError("Complete every offboarding task before closing the exit.", 409)
  if (exit.assets.some((asset) => asset.currentAssignment)) throw new ExitAssetError("Return every assigned asset before closing the exit.", 409)
  const employee = await db.prepare("SELECT department, tenure_years, work_email FROM employee_directory_view WHERE employee_id=?").bind(exit.employeeId).first<{ department: string; tenure_years: number; work_email: string | null }>()
  if (!employee) throw new ExitAssetError("Employee record is unavailable.", 409)
  const finalStatus = exit.exitType === "Resignation" ? "Resigned" : "Terminated"
  const attritionId = `ATTR-${exit.id}`
  await db.batch([
    db.prepare("UPDATE employee_exits SET status='Completed', actual_exit_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(actualExitDate, exitId),
    db.prepare("UPDATE employees SET employment_status=?, archived_at=COALESCE(archived_at, CURRENT_TIMESTAMP::text), version=version+1, updated_at=CURRENT_TIMESTAMP WHERE employee_id=?").bind(finalStatus, exit.employeeId),
    db.prepare("UPDATE app_users SET role='employee', onboarding_status='complete', updated_at=CURRENT_TIMESTAMP WHERE employee_id=? OR LOWER(email)=LOWER(?)").bind(exit.employeeId, employee.work_email ?? ""),
    db.prepare(`INSERT INTO attrition_events(id, employee_id, exit_date, exit_reason, exit_type, department, tenure_years, data_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'workflow') ON CONFLICT(id) DO UPDATE SET exit_date=EXCLUDED.exit_date, exit_reason=EXCLUDED.exit_reason, exit_type=EXCLUDED.exit_type, department=EXCLUDED.department, tenure_years=EXCLUDED.tenure_years`)
      .bind(attritionId, exit.employeeId, actualExitDate, exit.exitType, exit.exitType === "Resignation" ? "Voluntary" : "Involuntary", employee.department, Number(employee.tenure_years ?? 0)),
    db.prepare("UPDATE workflow_requests SET status='Completed', completed_at=CURRENT_TIMESTAMP, resolved_at=CURRENT_TIMESTAMP, completion_notes='Offboarding checklist completed.', resolved_by_email=?, updated_at=CURRENT_TIMESTAMP WHERE source_entity_type='employee_exit' AND source_entity_id=?")
      .bind(actor.email, exitId),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'exit_completed', 'Employee exit completed', ?, ?)")
      .bind(crypto.randomUUID(), exit.employeeId, JSON.stringify({ exitId, actualExitDate, finalStatus }), actor.email),
  ])
  return getEmployeeExit(exitId)
}

export async function cancelEmployeeExit(exitId: string, actor: RequestActor): Promise<EmployeeExitDetail> {
  const db = await database()
  const exit = await getEmployeeExit(exitId)
  if (!["Scheduled", "In Progress"].includes(exit.status)) throw new ExitAssetError("Only an open exit can be cancelled.", 409)
  const prior = await db.prepare("SELECT previous_employment_status FROM employee_exits WHERE id=?").bind(exitId).first<{ previous_employment_status: string }>()
  if (!prior) throw new ExitAssetError("Employee exit not found.", 404)
  await db.batch([
    db.prepare("UPDATE employee_exits SET status='Cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(exitId),
    db.prepare("UPDATE employees SET employment_status=?, version=version+1, updated_at=CURRENT_TIMESTAMP WHERE employee_id=?").bind(prior.previous_employment_status, exit.employeeId),
    db.prepare("UPDATE workflow_requests SET status='Closed', completed_at=CURRENT_TIMESTAMP, resolved_at=CURRENT_TIMESTAMP, completion_notes='Exit workflow cancelled.', resolved_by_email=?, updated_at=CURRENT_TIMESTAMP WHERE source_entity_type='employee_exit' AND source_entity_id=?")
      .bind(actor.email, exitId),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'exit_cancelled', 'Employee exit cancelled', ?, ?)")
      .bind(crypto.randomUUID(), exit.employeeId, JSON.stringify({ exitId }), actor.email),
  ])
  return getEmployeeExit(exitId)
}
