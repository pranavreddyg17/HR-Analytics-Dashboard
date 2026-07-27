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
  "CREATE TABLE IF NOT EXISTS employees (employee_id TEXT PRIMARY KEY, department TEXT NOT NULL, job_title TEXT NOT NULL, location TEXT NOT NULL, manager TEXT NOT NULL, hire_date TEXT NOT NULL, employment_status TEXT NOT NULL, tenure_years REAL NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS hiring_records (id TEXT PRIMARY KEY, position TEXT NOT NULL, department TEXT NOT NULL, application_date TEXT NOT NULL, hiring_date TEXT, hiring_source TEXT NOT NULL, time_to_hire_days INTEGER, recruitment_status TEXT NOT NULL, location TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS attrition_events (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, exit_date TEXT NOT NULL, exit_reason TEXT NOT NULL, exit_type TEXT NOT NULL, department TEXT NOT NULL, tenure_years REAL NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS leave_records (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, leave_type TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, leave_days REAL NOT NULL, approval_status TEXT NOT NULL, department TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS training_records (id TEXT PRIMARY KEY, training_program TEXT NOT NULL, employee_id TEXT NOT NULL, completion_status TEXT NOT NULL, completion_date TEXT, training_hours REAL NOT NULL, assessment_score REAL, department TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS promotion_records (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, previous_title TEXT NOT NULL, new_title TEXT NOT NULL, promotion_date TEXT NOT NULL, department TEXT NOT NULL, months_since_previous_promotion INTEGER NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS data_imports (id TEXT PRIMARY KEY, domain TEXT NOT NULL, filename TEXT NOT NULL, row_count INTEGER NOT NULL, status TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
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
  const sources = ["Employee referral", "LinkedIn", "Careers site", "Agency", "University"]
  const leaveTypes = ["Annual", "Sick", "Parental", "Personal", "Caregiver"]
  const programs = ["Security & privacy", "Manager essentials", "Inclusive leadership", "Data literacy", "Safety"]
  const exitReasons = ["Career growth", "Compensation", "Manager relationship", "Relocation", "Performance"]

  const employees = sourceEmployees.slice(0, 180).map((employee, index) => {
    const tenure = numericTenure(employee.tenure)
    return {
      employee_id: employee.id,
      department: employee.department,
      job_title: employee.role,
      location: locations[index % locations.length],
      manager: `${employee.department} Manager ${1 + (index % 4)}`,
      hire_date: dateShift(-Math.max(2, Math.round(tenure * 12)), -(index % 19)),
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
  employees: "INSERT INTO employees(employee_id, department, job_title, location, manager, hire_date, employment_status, tenure_years, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(employee_id) DO UPDATE SET department=excluded.department, job_title=excluded.job_title, location=excluded.location, manager=excluded.manager, hire_date=excluded.hire_date, employment_status=excluded.employment_status, tenure_years=excluded.tenure_years, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP",
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
    await seedEmptyDomains(database)
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

const nullableFields = new Set(["hiring_date", "time_to_hire_days", "completion_date", "assessment_score"])
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
  const result = await database.prepare(`SELECT * FROM ${tableByDomain[domain]} ORDER BY updated_at DESC LIMIT 10000`).all<Record<string, unknown>>()
  return result.results ?? []
}

export function getDomainTable(domain: HrDomain): string {
  return tableByDomain[domain]
}
