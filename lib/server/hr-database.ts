import { env } from "cloudflare:workers"

import { getEmployees } from "@/lib/server/runtime"
import { hrDomains, importFields, type HrDomain } from "@/lib/hr-types"

export type Statement = {
  bind(...values: unknown[]): Statement
  run(): Promise<{ success?: boolean }>
  all<T>(): Promise<{ results?: T[] }>
  first<T>(): Promise<T | null>
}

export type Database = {
  prepare(sql: string): Statement
  batch(statements: Statement[]): Promise<unknown>
}

type Dataset = Record<HrDomain, Array<Record<string, string | number | null>>>

const tableByDomain: Record<HrDomain, string> = {
  employees: "employees",
  hiring: "hiring_records",
  attrition: "attrition_events",
  leave: "leave_records",
  training: "training_records",
  promotions: "promotion_records",
}

const createStatements = [
  "CREATE TABLE IF NOT EXISTS employees (employee_id TEXT PRIMARY KEY, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '', preferred_name TEXT, work_email TEXT, phone TEXT, department TEXT NOT NULL, job_title TEXT NOT NULL, location TEXT NOT NULL, manager TEXT NOT NULL, manager_id TEXT, hire_date TEXT NOT NULL, employment_type TEXT NOT NULL DEFAULT 'Full-time', employment_status TEXT NOT NULL, tenure_years REAL NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', archived_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS employee_activity (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, event_type TEXT NOT NULL, summary TEXT NOT NULL, changes_json TEXT, actor_email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS workspace_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS hiring_records (id TEXT PRIMARY KEY, position TEXT NOT NULL, department TEXT NOT NULL, application_date TEXT NOT NULL, hiring_date TEXT, hiring_source TEXT NOT NULL, time_to_hire_days INTEGER, recruitment_status TEXT NOT NULL, location TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS attrition_events (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, exit_date TEXT NOT NULL, exit_reason TEXT NOT NULL, exit_type TEXT NOT NULL, department TEXT NOT NULL, tenure_years REAL NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS leave_records (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, leave_type TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, leave_days REAL NOT NULL, approval_status TEXT NOT NULL, department TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS training_records (id TEXT PRIMARY KEY, training_program TEXT NOT NULL, employee_id TEXT NOT NULL, completion_status TEXT NOT NULL, completion_date TEXT, training_hours REAL NOT NULL, assessment_score REAL, department TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS promotion_records (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, previous_title TEXT NOT NULL, new_title TEXT NOT NULL, promotion_date TEXT NOT NULL, department TEXT NOT NULL, months_since_previous_promotion INTEGER NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS data_imports (id TEXT PRIMARY KEY, domain TEXT NOT NULL, filename TEXT NOT NULL, row_count INTEGER NOT NULL, status TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS workflow_requests (id TEXT PRIMARY KEY, type TEXT NOT NULL, employee_id TEXT, title TEXT NOT NULL, status TEXT NOT NULL, details_json TEXT NOT NULL DEFAULT '{}', requested_by_email TEXT NOT NULL, resolved_by_email TEXT, resolved_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS workflow_type_status_idx ON workflow_requests(type, status)",
  "CREATE INDEX IF NOT EXISTS workflow_employee_idx ON workflow_requests(employee_id)",
  "CREATE INDEX IF NOT EXISTS workflow_requester_idx ON workflow_requests(requested_by_email)",
  "CREATE TABLE IF NOT EXISTS app_users (email TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'viewer', status TEXT NOT NULL DEFAULT 'active', invited_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT)",
  "CREATE TABLE IF NOT EXISTS access_audit (id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, action TEXT NOT NULL, target_email TEXT NOT NULL, details_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
]

let readyDatabase: Database | null = null
let setupPromise: Promise<void> | null = null

export function getHrDatabase(): Database | null {
  return (env as unknown as { DB?: Database }).DB ?? null
}

function dateShift(months: number, days = 0): string {
  const date = new Date(Date.UTC(2026, 5, 30))
  date.setUTCMonth(date.getUTCMonth() + months)
  date.setUTCDate(Math.min(28, date.getUTCDate() + days))
  return date.toISOString().slice(0, 10)
}

function numericTenure(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function generateDemoDataset(): Dataset {
  const sourceEmployees = getEmployees({ limit: 240 }).items
  const locations = ["Austin", "London", "New York", "Remote", "San Francisco", "Singapore"]
  const firstNames = ["Avery", "Maya", "Noah", "Elena", "Miles", "Priya", "Theo", "Naomi", "Liam", "Sofia", "Jordan", "Amara", "Kai", "Leila", "Owen", "Nina", "Elliot", "Zara"]
  const lastNames = ["Chen", "Patel", "Williams", "Garcia", "Kim", "Okafor", "Martin", "Singh", "Rivera", "Brown", "Davis", "Wilson", "Nguyen", "Taylor", "Johnson"]
  const sources = ["Employee referral", "LinkedIn", "Careers site", "Agency", "University"]
  const leaveTypes = ["Annual", "Sick", "Parental", "Personal", "Caregiver"]
  const programs = ["Security & privacy", "Manager essentials", "Inclusive leadership", "Data literacy", "Safety"]
  const exitReasons = ["Career growth", "Compensation", "Manager relationship", "Relocation", "Performance"]

  const employees = sourceEmployees.slice(0, 180).map((employee, index) => {
    const tenure = numericTenure(employee.tenure)
    const firstName = firstNames[index % firstNames.length]
    const lastName = lastNames[(index * 7) % lastNames.length]
    return {
      employee_id: employee.id,
      first_name: firstName,
      last_name: lastName,
      preferred_name: index % 9 === 0 ? firstName.slice(0, Math.max(3, firstName.length - 1)) : null,
      work_email: `${firstName}.${lastName}.${String(index + 1).padStart(3, "0")}@demo.laidbackhr.ai`.toLowerCase(),
      phone: `+1 555 ${String(100 + (index % 900)).padStart(3, "0")} ${String(1000 + index).slice(-4)}`,
      department: employee.department,
      job_title: employee.role,
      location: locations[index % locations.length],
      manager: `${employee.department} Manager ${1 + (index % 4)}`,
      manager_id: index < 8 ? null : sourceEmployees[Math.max(0, Math.floor(index / 8) * 8 - 8)]?.id ?? null,
      hire_date: dateShift(-Math.max(2, Math.round(tenure * 12)), -(index % 19)),
      employment_type: index % 12 === 0 ? "Contract" : index % 9 === 0 ? "Part-time" : "Full-time",
      employment_status: employee.observedAttrition === "Yes" ? "Terminated" : index % 17 === 0 ? "On leave" : "Active",
      tenure_years: tenure,
      data_source: "demo",
    }
  })

  const hiring = Array.from({ length: 72 }, (_, index) => {
    const employee = employees[index % employees.length]
    const status = index % 9 === 0 ? "Open" : index % 11 === 0 ? "Offer" : "Hired"
    const applicationDate = dateShift(-17 + (index % 18), -(index % 17))
    const timeToHire = 18 + ((index * 7) % 43)
    const hiringDate = status === "Hired"
      ? new Date(new Date(`${applicationDate}T00:00:00Z`).getTime() + timeToHire * 86_400_000).toISOString().slice(0, 10)
      : null
    return {
      id: `HIR-${String(index + 1).padStart(4, "0")}`,
      position: employee.job_title,
      department: employee.department,
      application_date: applicationDate,
      hiring_date: hiringDate,
      hiring_source: sources[index % sources.length],
      time_to_hire_days: status === "Hired" ? timeToHire : null,
      recruitment_status: status,
      location: employee.location,
      data_source: "demo",
    }
  })

  const demoEmployeeIds = new Set(employees.map((employee) => employee.employee_id))
  const attrition = sourceEmployees
    .filter((employee) => employee.observedAttrition === "Yes" && demoEmployeeIds.has(employee.id))
    .slice(0, 34)
    .map((employee, index) => ({
      id: `EXT-${String(index + 1).padStart(4, "0")}`,
      employee_id: employee.id,
      exit_date: dateShift(-16 + (index % 17), -(index % 13)),
      exit_reason: exitReasons[index % exitReasons.length],
      exit_type: index % 5 === 4 ? "Involuntary" : "Voluntary",
      department: employee.department,
      tenure_years: numericTenure(employee.tenure),
      data_source: "demo",
    }))

  const leave = Array.from({ length: 110 }, (_, index) => {
    const employee = employees[(index * 7) % employees.length]
    const start = dateShift(-17 + (index % 18), -(index % 21))
    const leaveDays = 1 + ((index * 3) % 9)
    const end = new Date(new Date(`${start}T00:00:00Z`).getTime() + (leaveDays - 1) * 86_400_000).toISOString().slice(0, 10)
    return {
      id: `LEV-${String(index + 1).padStart(4, "0")}`,
      employee_id: employee.employee_id,
      leave_type: leaveTypes[index % leaveTypes.length],
      start_date: start,
      end_date: end,
      leave_days: leaveDays,
      approval_status: index % 8 === 0 ? "Pending" : index % 13 === 0 ? "Rejected" : "Approved",
      department: employee.department,
      data_source: "demo",
    }
  })

  const training = Array.from({ length: 120 }, (_, index) => {
    const employee = employees[(index * 11) % employees.length]
    const incomplete = index % 7 === 0
    return {
      id: `TRN-${String(index + 1).padStart(4, "0")}`,
      training_program: programs[index % programs.length],
      employee_id: employee.employee_id,
      completion_status: incomplete ? "Incomplete" : "Completed",
      completion_date: incomplete ? null : dateShift(-11 + (index % 12), -(index % 14)),
      training_hours: 2 + ((index * 2) % 14),
      assessment_score: incomplete ? null : 68 + ((index * 5) % 31),
      department: employee.department,
      data_source: "demo",
    }
  })

  const promotions = Array.from({ length: 44 }, (_, index) => {
    const employee = employees[(index * 13) % employees.length]
    return {
      id: `PRO-${String(index + 1).padStart(4, "0")}`,
      employee_id: employee.employee_id,
      previous_title: employee.job_title,
      new_title: index % 3 === 0 ? `Senior ${employee.job_title}` : `${employee.job_title} II`,
      promotion_date: dateShift(-17 + (index % 18), -(index % 15)),
      department: employee.department,
      months_since_previous_promotion: 18 + ((index * 5) % 43),
      data_source: "demo",
    }
  })

  return { employees, hiring, attrition, leave, training, promotions }
}

const insertSql: Record<HrDomain, string> = {
  employees: "INSERT INTO employees(employee_id, first_name, last_name, preferred_name, work_email, phone, department, job_title, location, manager, manager_id, hire_date, employment_type, employment_status, tenure_years, data_source, archived_at, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(employee_id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, preferred_name=excluded.preferred_name, work_email=excluded.work_email, phone=excluded.phone, department=excluded.department, job_title=excluded.job_title, location=excluded.location, manager=excluded.manager, manager_id=excluded.manager_id, hire_date=excluded.hire_date, employment_type=excluded.employment_type, employment_status=excluded.employment_status, tenure_years=excluded.tenure_years, data_source=excluded.data_source, archived_at=NULL, version=employees.version+1, updated_at=CURRENT_TIMESTAMP",
  hiring: "INSERT INTO hiring_records(id, position, department, application_date, hiring_date, hiring_source, time_to_hire_days, recruitment_status, location, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET position=excluded.position, department=excluded.department, application_date=excluded.application_date, hiring_date=excluded.hiring_date, hiring_source=excluded.hiring_source, time_to_hire_days=excluded.time_to_hire_days, recruitment_status=excluded.recruitment_status, location=excluded.location, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP",
  attrition: "INSERT INTO attrition_events(id, employee_id, exit_date, exit_reason, exit_type, department, tenure_years, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id, exit_date=excluded.exit_date, exit_reason=excluded.exit_reason, exit_type=excluded.exit_type, department=excluded.department, tenure_years=excluded.tenure_years, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP",
  leave: "INSERT INTO leave_records(id, employee_id, leave_type, start_date, end_date, leave_days, approval_status, department, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id, leave_type=excluded.leave_type, start_date=excluded.start_date, end_date=excluded.end_date, leave_days=excluded.leave_days, approval_status=excluded.approval_status, department=excluded.department, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP",
  training: "INSERT INTO training_records(id, training_program, employee_id, completion_status, completion_date, training_hours, assessment_score, department, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET training_program=excluded.training_program, employee_id=excluded.employee_id, completion_status=excluded.completion_status, completion_date=excluded.completion_date, training_hours=excluded.training_hours, assessment_score=excluded.assessment_score, department=excluded.department, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP",
  promotions: "INSERT INTO promotion_records(id, employee_id, previous_title, new_title, promotion_date, department, months_since_previous_promotion, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id, previous_title=excluded.previous_title, new_title=excluded.new_title, promotion_date=excluded.promotion_date, department=excluded.department, months_since_previous_promotion=excluded.months_since_previous_promotion, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP",
}

function valuesFor(domain: HrDomain, row: Record<string, string | number | null>): unknown[] {
  return [...importFields[domain].map((field) => row[field] ?? null), row.data_source ?? "imported"]
}

async function seedEmptyDomains(database: Database): Promise<void> {
  const demo = generateDemoDataset()
  for (const domain of hrDomains) {
    const table = tableByDomain[domain]
    const count = await database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>()
    if (Number(count?.count ?? 0) > 0) continue
    const statements = demo[domain].map((row) => database.prepare(insertSql[domain]).bind(...valuesFor(domain, row)))
    for (let index = 0; index < statements.length; index += 80) {
      await database.batch(statements.slice(index, index + 80))
    }
  }
}

async function seedDemoOnce(database: Database): Promise<void> {
  const initialized = await database.prepare("SELECT value FROM workspace_settings WHERE key = 'demo_seed_initialized'").first<{ value: string }>()
  if (initialized) return
  await seedEmptyDomains(database)
  await database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES ('demo_seed_initialized', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP").run()
}

const profileColumnDefinitions: Record<string, string> = {
  first_name: "TEXT NOT NULL DEFAULT ''",
  last_name: "TEXT NOT NULL DEFAULT ''",
  preferred_name: "TEXT",
  work_email: "TEXT",
  phone: "TEXT",
  manager_id: "TEXT",
  employment_type: "TEXT NOT NULL DEFAULT 'Full-time'",
  archived_at: "TEXT",
  version: "INTEGER NOT NULL DEFAULT 1",
  created_at: "TEXT",
}

async function ensureEmployeeProfileColumns(database: Database): Promise<void> {
  const result = await database.prepare("PRAGMA table_info(employees)").all<{ name: string }>()
  const present = new Set((result.results ?? []).map((column) => column.name))
  for (const [name, definition] of Object.entries(profileColumnDefinitions)) {
    if (!present.has(name)) await database.prepare(`ALTER TABLE employees ADD COLUMN ${name} ${definition}`).run()
  }
}

async function backfillDemoProfiles(database: Database): Promise<void> {
  const blanks = await database.prepare("SELECT employee_id FROM employees WHERE data_source = 'demo' AND COALESCE(first_name, '') = ''").all<{ employee_id: string }>()
  if (!(blanks.results ?? []).length) return
  const demoById = new Map(generateDemoDataset().employees.map((row) => [String(row.employee_id), row]))
  const statements = (blanks.results ?? []).flatMap(({ employee_id }) => {
    const row = demoById.get(employee_id)
    if (!row) return []
    return [database.prepare("UPDATE employees SET first_name=?, last_name=?, preferred_name=?, work_email=?, phone=?, manager_id=?, employment_type=?, updated_at=CURRENT_TIMESTAMP WHERE employee_id=?")
      .bind(row.first_name, row.last_name, row.preferred_name, row.work_email, row.phone, row.manager_id, row.employment_type, employee_id)]
  })
  for (let index = 0; index < statements.length; index += 80) await database.batch(statements.slice(index, index + 80))
}

type LeaveExampleEmployee = { employee_id: string; department: string }

function dateFromToday(offsetDays: number): string {
  const date = new Date()
  date.setUTCHours(12, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

async function seedLeaveWorkflowExamplesOnce(database: Database): Promise<void> {
  const initialized = await database.prepare("SELECT value FROM workspace_settings WHERE key = 'leave_workflow_examples_v1'").first<{ value: string }>()
  if (initialized) return

  const result = await database.prepare("SELECT employee_id, department FROM employees WHERE archived_at IS NULL AND LOWER(employment_status) <> 'terminated' ORDER BY CASE WHEN LOWER(data_source) = 'demo' THEN 1 ELSE 0 END, employee_id LIMIT 18").all<LeaveExampleEmployee>()
  const employees = result.results ?? []
  if (!employees.length) return

  const examples = [
    { type: "Annual", start: -150, days: 3, status: "Approved" },
    { type: "Sick", start: -120, days: 2, status: "Approved" },
    { type: "Personal", start: -90, days: 1, status: "Approved" },
    { type: "Annual", start: -60, days: 5, status: "Approved" },
    { type: "Caregiver", start: -30, days: 3, status: "Approved" },
    { type: "Sick", start: -14, days: 2, status: "Approved" },
    { type: "Annual", start: -1, days: 4, status: "Approved" },
    { type: "Personal", start: 0, days: 1, status: "Approved" },
    { type: "Annual", start: 7, days: 5, status: "Approved" },
    { type: "Caregiver", start: 15, days: 3, status: "Pending" },
    { type: "Annual", start: 24, days: 4, status: "Pending" },
    { type: "Sick", start: 35, days: 2, status: "Pending" },
    { type: "Parental", start: 45, days: 10, status: "Approved" },
    { type: "Annual", start: 60, days: 5, status: "Pending" },
  ] as const
  const statements: Statement[] = []

  examples.forEach((example, index) => {
    const employee = employees[index % employees.length]
    const id = `LEV-WORKFLOW-EXAMPLE-${String(index + 1).padStart(3, "0")}`
    const startDate = dateFromToday(example.start)
    const endDate = dateFromToday(example.start + example.days - 1)
    const title = `${example.type} leave request`
    const details = JSON.stringify({ leaveType: example.type, startDate, endDate, days: example.days, note: "", origin: "workspace_example" })
    const resolved = example.status === "Approved"

    statements.push(
      database.prepare("INSERT OR IGNORE INTO leave_records(id, employee_id, leave_type, start_date, end_date, leave_days, approval_status, department, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'workflow', CURRENT_TIMESTAMP)")
        .bind(id, employee.employee_id, example.type, startDate, endDate, example.days, example.status, employee.department),
      database.prepare("INSERT OR IGNORE INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, resolved_by_email, resolved_at, created_at, updated_at) VALUES (?, 'leave', ?, ?, ?, ?, 'people-ops@laidbackhr.cloud', ?, ?, ?, CURRENT_TIMESTAMP)")
        .bind(id, employee.employee_id, title, example.status, details, resolved ? "people-ops@laidbackhr.cloud" : null, resolved ? dateFromToday(Math.min(0, example.start - 3)) : null, dateFromToday(example.start - 7)),
      database.prepare("INSERT OR IGNORE INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, ?, ?, ?, 'people-ops@laidbackhr.cloud', ?)")
        .bind(`ACT-${id}`, employee.employee_id, resolved ? "leave_decision" : "leave_requested", resolved ? `People Ops approved a ${example.type.toLowerCase()} leave request` : `People Ops submitted a ${example.type.toLowerCase()} leave request`, details, dateFromToday(resolved ? Math.min(0, example.start - 3) : example.start - 7)),
    )
  })

  for (let index = 0; index < statements.length; index += 80) await database.batch(statements.slice(index, index + 80))
  await database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES ('leave_workflow_examples_v1', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP").run()
}

async function seedTrainingWorkflowExamplesOnce(database: Database): Promise<void> {
  const initialized = await database.prepare("SELECT value FROM workspace_settings WHERE key = 'training_workflow_examples_v1'").first<{ value: string }>()
  if (initialized) return

  const result = await database.prepare("SELECT employee_id, department FROM employees WHERE archived_at IS NULL AND LOWER(employment_status) <> 'terminated' ORDER BY CASE WHEN LOWER(data_source) = 'demo' THEN 1 ELSE 0 END, employee_id LIMIT 18").all<LeaveExampleEmployee>()
  const employees = result.results ?? []
  if (!employees.length) return

  const examples = [
    { program: "Security awareness", due: -150, hours: 2, status: "Completed", completed: -146, score: 92 },
    { program: "Data privacy essentials", due: -120, hours: 2, status: "Completed", completed: -122, score: 88 },
    { program: "Inclusive leadership", due: -90, hours: 4, status: "Completed", completed: -92, score: 95 },
    { program: "Manager essentials", due: -60, hours: 6, status: "Completed", completed: -64, score: 84 },
    { program: "Workplace safety", due: -30, hours: 3, status: "Completed", completed: -31, score: 90 },
    { program: "Data literacy", due: -14, hours: 5, status: "Completed", completed: -16, score: 87 },
    { program: "Security & privacy essentials", due: -5, hours: 2, status: "Incomplete", completed: null, score: null },
    { program: "Workplace safety refresher", due: 2, hours: 2, status: "Incomplete", completed: null, score: null },
    { program: "Manager essentials", due: 10, hours: 5, status: "Incomplete", completed: null, score: null },
    { program: "Inclusive leadership", due: 0, hours: 4, status: "Completed", completed: 0, score: 94 },
    { program: "Data literacy", due: 21, hours: 6, status: "Incomplete", completed: null, score: null },
    { program: "Phishing awareness", due: 7, hours: 1, status: "Incomplete", completed: null, score: null },
  ] as const
  const statements: Statement[] = []

  examples.forEach((example, index) => {
    const employee = employees[index % employees.length]
    const id = `TRN-WORKFLOW-EXAMPLE-${String(index + 1).padStart(3, "0")}`
    const dueDate = dateFromToday(example.due)
    const completionDate = example.completed === null ? null : dateFromToday(example.completed)
    const details = JSON.stringify({ program: example.program, dueDate, hours: example.hours, note: "", origin: "workspace_example" })
    const completed = example.status === "Completed"

    statements.push(
      database.prepare("INSERT OR IGNORE INTO training_records(id, training_program, employee_id, completion_status, completion_date, training_hours, assessment_score, department, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'workflow', CURRENT_TIMESTAMP)")
        .bind(id, example.program, employee.employee_id, example.status, completionDate, example.hours, example.score, employee.department),
      database.prepare("INSERT OR IGNORE INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, resolved_by_email, resolved_at, created_at, updated_at) VALUES (?, 'training', ?, ?, ?, ?, 'people-ops@laidbackhr.cloud', ?, ?, ?, CURRENT_TIMESTAMP)")
        .bind(id, employee.employee_id, `${example.program} assignment`, completed ? "Completed" : "Assigned", details, completed ? "people-ops@laidbackhr.cloud" : null, completionDate, dateFromToday(example.due - 21)),
      database.prepare("INSERT OR IGNORE INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, ?, ?, ?, 'people-ops@laidbackhr.cloud', ?)")
        .bind(`ACT-${id}`, employee.employee_id, completed ? "training_completed" : "training_assigned", completed ? `Completed ${example.program}` : `Assigned ${example.program}`, details, completionDate ?? dateFromToday(example.due - 21)),
    )
  })

  for (let index = 0; index < statements.length; index += 80) await database.batch(statements.slice(index, index + 80))
  await database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES ('training_workflow_examples_v1', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP").run()
}

export async function ensureHrDatabase(): Promise<Database | null> {
  const database = getHrDatabase()
  if (!database) return null
  if (readyDatabase === database && setupPromise) {
    await setupPromise
    return database
  }
  readyDatabase = database
  setupPromise = (async () => {
    for (const statement of createStatements) await database.prepare(statement).run()
    await ensureEmployeeProfileColumns(database)
    await seedDemoOnce(database)
    await backfillDemoProfiles(database)
    await seedLeaveWorkflowExamplesOnce(database)
    await seedTrainingWorkflowExamplesOnce(database)
    await database.prepare("INSERT OR IGNORE INTO app_users(email, display_name, role, status, invited_by) VALUES ('pranavreddyg17@gmail.com', 'Pranav Reddy', 'admin', 'active', 'system')").run()
  })()
  try {
    await setupPromise
  } catch (error) {
    setupPromise = null
    throw error
  }
  return database
}

function normalizeRow(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Each row must be an object.")
  return Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [
    key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    typeof value === "string" ? value.trim() : value,
  ]))
}

const nullableFields = new Set(["preferred_name", "work_email", "phone", "manager_id", "hiring_date", "time_to_hire_days", "completion_date", "assessment_score"])
const numberFields = new Set(["tenure_years", "time_to_hire_days", "leave_days", "training_hours", "assessment_score", "months_since_previous_promotion"])
const dateFields = new Set(["hire_date", "application_date", "hiring_date", "exit_date", "start_date", "end_date", "completion_date", "promotion_date"])

function validatedRows(domain: HrDomain, rows: unknown[]): Array<Record<string, string | number | null>> {
  const errors: string[] = []
  const normalized = rows.map((source, index) => {
    try {
      const row = normalizeRow(source)
      const result: Record<string, string | number | null> = {}
      for (const field of importFields[domain]) {
        let value = row[field]
        if (field === "id" && (value === undefined || value === "")) value = `${domain.slice(0, 3).toUpperCase()}-${crypto.randomUUID()}`
        if (domain === "employees" && field === "first_name" && (value === undefined || value === "")) value = "Employee"
        if (domain === "employees" && field === "last_name" && (value === undefined || value === "")) value = String(row.employee_id ?? "")
        if (domain === "employees" && field === "employment_type" && (value === undefined || value === "")) value = "Full-time"
        if ((value === undefined || value === "") && nullableFields.has(field)) {
          result[field] = null
          continue
        }
        if (value === undefined || value === null || value === "") throw new Error(`missing ${field}`)
        if (numberFields.has(field)) {
          const number = typeof value === "number" ? value : Number(value)
          if (!Number.isFinite(number) || number < 0) throw new Error(`${field} must be a non-negative number`)
          result[field] = number
        } else {
          const text = String(value)
          if (dateFields.has(field) && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${field} must use YYYY-MM-DD`)
          result[field] = text
        }
      }
      result.data_source = "imported"
      return result
    } catch (error) {
      errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : "invalid data"}`)
      return null
    }
  }).filter((row): row is Record<string, string | number | null> => row !== null)
  if (errors.length) throw new Error(errors.slice(0, 20).join("\n"))
  return normalized
}

export async function importHrData({
  domain,
  rows,
  filename,
  replace = false,
}: {
  domain: HrDomain
  rows: unknown[]
  filename: string
  replace?: boolean
}): Promise<{ domain: HrDomain; imported: number; filename: string }> {
  if (!hrDomains.includes(domain)) throw new Error("Unsupported HR data domain.")
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 5000) throw new Error("Import must contain between 1 and 5,000 rows.")
  const database = await ensureHrDatabase()
  if (!database) throw new Error("Persistent HR database is unavailable.")
  const clean = validatedRows(domain, rows)
  const table = tableByDomain[domain]
  if (replace) await database.prepare(`DELETE FROM ${table}`).run()
  else await database.prepare(`DELETE FROM ${table} WHERE data_source = 'demo'`).run()
  const statements = clean.map((row) => database.prepare(insertSql[domain]).bind(...valuesFor(domain, row)))
  for (let index = 0; index < statements.length; index += 80) await database.batch(statements.slice(index, index + 80))
  await database.prepare("INSERT INTO data_imports(id, domain, filename, row_count, status, imported_at) VALUES (?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP)")
    .bind(crypto.randomUUID(), domain, filename.slice(0, 240) || `${domain}.csv`, clean.length)
    .run()
  return { domain, imported: clean.length, filename }
}

export async function readDomainRows(domain: HrDomain): Promise<Array<Record<string, unknown>>> {
  const database = await ensureHrDatabase()
  if (!database) return generateDemoDataset()[domain]
  if (domain === "training") {
    const result = await database.prepare("SELECT t.*, json_extract(w.details_json, '$.dueDate') AS due_date, w.requested_by_email, w.created_at AS assigned_at FROM training_records t LEFT JOIN workflow_requests w ON w.id=t.id AND w.type='training' ORDER BY t.updated_at DESC LIMIT 10000").all<Record<string, unknown>>()
    return result.results ?? []
  }
  const result = await database.prepare(`SELECT * FROM ${tableByDomain[domain]} ORDER BY updated_at DESC LIMIT 10000`).all<Record<string, unknown>>()
  return result.results ?? []
}

export function getDomainTable(domain: HrDomain): string {
  return tableByDomain[domain]
}
