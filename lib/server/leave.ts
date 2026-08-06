import type { LeaveOperationRecord, LeaveOperations } from "@/lib/leave-types"
import { ensureHrDatabase, type Database } from "@/lib/server/hr-database"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

type LeaveRow = {
  id: string
  employee_id: string
  employee_name: string
  employee_email: string | null
  manager_id: string | null
  leave_type: string
  start_date: string
  end_date: string
  leave_days: number
  approval_status: string
  department: string
  location: string
  requested_at: string
  requested_by_email: string | null
  completion_notes: string | null
  department_headcount: number
  approved_away: number
  pending_requests: number
}

async function database(): Promise<Database> {
  const db = await ensureHrDatabase()
  if (!db) throw new PeopleError("Leave storage is unavailable.", 503)
  return db
}

async function actorEmployeeId(db: Database, actor: RequestActor): Promise<string | null> {
  const employee = await db.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL")
    .bind(actor.email).first<{ employee_id: string }>()
  return employee?.employee_id ?? null
}

export async function listLeaveOperations(actor: RequestActor, filters: { id?: string; from?: string; to?: string; department?: string; location?: string; leaveType?: string; status?: string } = {}): Promise<LeaveOperations> {
  const db = await database()
  const employeeId = await actorEmployeeId(db, actor)
  const scopeBindings: unknown[] = []
  let scopeSql = "1=0"
  if (["admin", "hr"].includes(actor.role)) {
    scopeSql = "1=1"
  } else if (actor.role === "manager" && employeeId) {
    scopeSql = "(e.manager_id=? OR e.employee_id=?)"
    scopeBindings.push(employeeId, employeeId)
  } else if (employeeId) {
    scopeSql = "e.employee_id=?"
    scopeBindings.push(employeeId)
  }
  const where = ["LOWER(l.data_source) <> 'demo'", "e.archived_at IS NULL", scopeSql]
  const bindings: unknown[] = [...scopeBindings]
  if (filters.id) { where.push("l.id=?"); bindings.push(filters.id) }
  if (filters.from) { where.push("l.end_date>=?"); bindings.push(filters.from) }
  if (filters.to) { where.push("l.start_date<=?"); bindings.push(filters.to) }
  if (filters.department) { where.push("e.department=?"); bindings.push(filters.department) }
  if (filters.location) { where.push("e.location=?"); bindings.push(filters.location) }
  if (filters.leaveType) { where.push("l.leave_type=?"); bindings.push(filters.leaveType) }
  if (filters.status) { where.push("l.approval_status=?"); bindings.push(filters.status) }
  const [result, dimensionResult] = await Promise.all([
    db.prepare(`SELECT l.id, l.employee_id,
      TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS employee_name,
      e.work_email AS employee_email, e.manager_id, l.leave_type, l.start_date, l.end_date, l.leave_days,
      l.approval_status, e.department, e.location, COALESCE(w.created_at, l.updated_at) AS requested_at,
      w.requested_by_email, w.completion_notes,
      (SELECT COUNT(*) FROM employee_directory_view team WHERE team.department=e.department AND team.archived_at IS NULL AND LOWER(team.employment_status) IN ('active','on leave')) AS department_headcount,
      (SELECT COUNT(DISTINCT other.employee_id) FROM leave_requests_view other
        JOIN employee_directory_view other_employee ON other_employee.employee_id=other.employee_id
        WHERE other_employee.department=e.department AND other.employee_id<>l.employee_id
          AND LOWER(other.approval_status)='approved' AND other.start_date<=l.end_date AND other.end_date>=l.start_date) AS approved_away,
      (SELECT COUNT(DISTINCT pending.employee_id) FROM leave_requests_view pending
        JOIN employee_directory_view pending_employee ON pending_employee.employee_id=pending.employee_id
        WHERE pending_employee.department=e.department AND pending.employee_id<>l.employee_id
          AND LOWER(pending.approval_status)='pending' AND pending.start_date<=l.end_date AND pending.end_date>=l.start_date) AS pending_requests
    FROM leave_requests_view l
    JOIN employee_directory_view e ON e.employee_id=l.employee_id
    LEFT JOIN workflow_requests w ON w.id=l.id AND w.type='leave'
    WHERE ${where.join(" AND ")}
    ORDER BY CASE LOWER(l.approval_status) WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      CASE WHEN l.start_date>=date('now') THEN l.start_date ELSE '9999-12-31' END, l.start_date DESC
    LIMIT 5000`).bind(...bindings).all<LeaveRow>(),
    db.prepare(`SELECT e.department, e.location, l.leave_type, l.approval_status
      FROM leave_requests_view l JOIN employee_directory_view e ON e.employee_id=l.employee_id
      WHERE LOWER(l.data_source) <> 'demo' AND e.archived_at IS NULL AND ${scopeSql}
      GROUP BY e.department, e.location, l.leave_type, l.approval_status`)
      .bind(...scopeBindings).all<{ department: string; location: string; leave_type: string; approval_status: string }>(),
  ])
  const rows: LeaveOperationRecord[] = (result.results ?? []).map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email,
    managerId: row.manager_id,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    leaveDays: Number(row.leave_days),
    status: row.approval_status,
    department: row.department,
    location: row.location,
    requestedAt: row.requested_at,
    requestedByEmail: row.requested_by_email,
    decisionNote: row.completion_notes,
    canDecide: row.approval_status.toLowerCase() === "pending" && row.employee_email?.toLowerCase() !== actor.email.toLowerCase()
      && (["admin", "hr"].includes(actor.role) || actor.role === "manager" && row.manager_id === employeeId),
    coverage: { departmentHeadcount: Number(row.department_headcount), approvedAway: Number(row.approved_away), pendingRequests: Number(row.pending_requests) },
  }))
  const today = new Date().toISOString().slice(0, 10)
  const awayToday = rows.filter((row) => row.status.toLowerCase() === "approved" && row.startDate <= today && row.endDate >= today)
  const upcoming = rows.filter((row) => ["approved", "pending"].includes(row.status.toLowerCase()) && row.startDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 12)
  const reviewable = rows.filter((row) => row.canDecide).length
  const dimensions = dimensionResult.results ?? []
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      requests: rows.length,
      pending: rows.filter((row) => row.status.toLowerCase() === "pending").length,
      reviewable,
      awayToday: new Set(awayToday.map((row) => row.employeeId)).size,
      approvedDays: rows.filter((row) => row.status.toLowerCase() === "approved").reduce((sum, row) => sum + row.leaveDays, 0),
    },
    dimensions: {
      departments: [...new Set(dimensions.map((row) => row.department))].sort(),
      locations: [...new Set(dimensions.map((row) => row.location))].sort(),
      leaveTypes: [...new Set(dimensions.map((row) => row.leave_type))].sort(),
      statuses: [...new Set(dimensions.map((row) => row.approval_status))].sort(),
    },
    requests: rows,
    awayToday,
    upcoming,
  }
}
