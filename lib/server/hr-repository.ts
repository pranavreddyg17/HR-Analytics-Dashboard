import type { ImportIssue, ImportJob, ImportMode, ImportPreview } from "@/lib/data-import-types"
import { hrDomains, importFields, type HrDomain } from "@/lib/hr-types"
import { runtimeEnv } from "@/lib/server/runtime-env"
import { cachedAnalyticsRead } from "@/lib/server/analytics-cache"

export type Statement = {
  bind(...values: unknown[]): Statement
  run(): Promise<{ success?: boolean }>
  all<T>(): Promise<{ results?: T[] }>
  first<T>(): Promise<T | null>
}

export type Database = {
  readonly dialect: "postgres"
  prepare(sql: string): Statement
  batch(statements: Statement[]): Promise<unknown>
}

const tableByDomain: Record<HrDomain, string> = {
  employees: "employees",
  hiring: "hiring_records",
  attrition: "attrition_events",
  leave: "leave_records",
  training: "training_records",
  promotions: "promotion_records",
}

const readViewByDomain: Record<HrDomain, string> = {
  employees: "employee_directory_view",
  hiring: "hiring_requisitions_view",
  attrition: "attrition_events_view",
  leave: "leave_requests_view",
  training: "learning_assignments_view",
  promotions: "promotion_events_view",
}

const primaryKeyByDomain: Record<HrDomain, string> = {
  employees: "employee_id",
  hiring: "id",
  attrition: "id",
  leave: "id",
  training: "id",
  promotions: "id",
}

let repositoryPromise: Promise<Database> | null = null
let bootstrapPromise: Promise<void> | null = null

export async function ensureHrDatabase(): Promise<Database> {
  if (!repositoryPromise) {
    repositoryPromise = import("@/lib/server/postgres-database").then(({ getPostgresDatabase }) => getPostgresDatabase())
  }
  const database = await repositoryPromise
  const bootstrapEmail = runtimeEnv.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  if (bootstrapEmail && !bootstrapPromise) {
    bootstrapPromise = database.prepare(`
      INSERT INTO app_users(email, display_name, role, status, invited_by, onboarding_status)
      VALUES (?, ?, 'admin', 'active', 'deployment-bootstrap', 'not_required')
      ON CONFLICT(email) DO NOTHING
    `).bind(bootstrapEmail, runtimeEnv.BOOTSTRAP_ADMIN_NAME?.trim() || bootstrapEmail.split("@")[0]).run().then(() => undefined)
  }
  await bootstrapPromise
  return database
}

function normalizeRow(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Each row must be an object.")
  return Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [
    key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    typeof value === "string" ? value.trim() : value,
  ]))
}

const nullableFields = new Set(["preferred_name", "work_email", "phone", "manager_id", "hiring_date", "completion_date", "assessment_score"])
const numberFields = new Set(["tenure_years", "leave_days", "training_hours", "assessment_score", "months_since_previous_promotion"])
const dateFields = new Set(["hire_date", "application_date", "hiring_date", "exit_date", "start_date", "end_date", "completion_date", "promotion_date"])
const enumValues: Partial<Record<HrDomain, Record<string, string[]>>> = {
  employees: { employment_status: ["Active", "On Leave", "Preboarding", "Terminated"] },
  hiring: { recruitment_status: ["Requested", "Approved", "Open", "Applied", "Screening", "Interview", "Offer", "Hired", "Rejected", "Closed", "Cancelled"] },
  attrition: { exit_type: ["Voluntary", "Involuntary"] },
  leave: { approval_status: ["Pending", "Approved", "Rejected", "Cancelled"] },
  training: { completion_status: ["Assigned", "In progress", "Completed", "Incomplete", "Cancelled"] },
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function canonicalEnum(domain: HrDomain, field: string, value: string): string | null {
  const allowed = enumValues[domain]?.[field]
  return allowed ? allowed.find((item) => item.toLowerCase() === value.toLowerCase()) ?? null : value
}

function addIssue(issues: ImportIssue[], issue: ImportIssue): void {
  if (issues.length < 100) issues.push(issue)
}

async function selectExistingValues(database: Database, table: string, column: string, values: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  for (let index = 0; index < values.length; index += 250) {
    const chunk = values.slice(index, index + 250)
    if (!chunk.length) continue
    const rows = await database.prepare(`SELECT ${column} AS value FROM ${table} WHERE ${column} IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all<{ value: string }>()
    for (const row of rows.results ?? []) found.add(String(row.value))
  }
  return found
}

type ValidatedImport = { preview: ImportPreview; rows: Array<Record<string, string | number | null>> }

async function validateImportRows(database: Database, domain: HrDomain, rows: unknown[], filename: string, mode: ImportMode): Promise<ValidatedImport> {
  const issues: ImportIssue[] = []
  const invalidRows = new Set<number>()
  const normalized = rows.map((row, index) => {
    try { return normalizeRow(row) }
    catch (error) {
      invalidRows.add(index)
      addIssue(issues, { severity: "error", code: "invalid_row", message: error instanceof Error ? error.message : "Invalid row.", row: index + 2 })
      return {}
    }
  })
  const columns = new Set(Object.keys(normalized[0] ?? {}))
  for (const field of importFields[domain]) if (!columns.has(field)) addIssue(issues, { severity: "error", code: "missing_column", field, message: `Required column “${field}” is missing.` })

  const clean = normalized.map((row, index) => {
    const result: Record<string, string | number | null> = {}
    for (const field of importFields[domain]) {
      const value = row[field]
      if ((value === undefined || value === null || value === "") && nullableFields.has(field)) { result[field] = null; continue }
      if (value === undefined || value === null || value === "") {
        invalidRows.add(index); addIssue(issues, { severity: "error", code: "required_value", field, row: index + 2, message: `${field} is required.` }); continue
      }
      if (numberFields.has(field)) {
        const numeric = Number(value)
        if (!Number.isFinite(numeric) || numeric < 0) { invalidRows.add(index); addIssue(issues, { severity: "error", code: "invalid_number", field, row: index + 2, message: `${field} must be a non-negative number.` }) }
        else result[field] = numeric
        continue
      }
      const text = String(value).trim()
      if (dateFields.has(field) && !isIsoDate(text)) { invalidRows.add(index); addIssue(issues, { severity: "error", code: "invalid_date", field, row: index + 2, message: `${field} must use YYYY-MM-DD.` }); continue }
      const canonical = canonicalEnum(domain, field, text)
      if (canonical === null) { invalidRows.add(index); addIssue(issues, { severity: "error", code: "invalid_value", field, row: index + 2, message: `${field} has an unsupported value.` }) }
      else result[field] = canonical
    }
    if (result.work_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(result.work_email))) {
      invalidRows.add(index); addIssue(issues, { severity: "error", code: "invalid_email", field: "work_email", row: index + 2, message: "work_email is invalid." })
    }
    if (domain === "hiring" && result.hiring_date && String(result.hiring_date) < String(result.application_date)) {
      invalidRows.add(index); addIssue(issues, { severity: "error", code: "date_order", field: "hiring_date", row: index + 2, message: "hiring_date cannot precede application_date." })
    }
    if (domain === "leave" && String(result.end_date) < String(result.start_date)) {
      invalidRows.add(index); addIssue(issues, { severity: "error", code: "date_order", field: "end_date", row: index + 2, message: "end_date cannot precede start_date." })
    }
    result.data_source = "imported"
    return result
  })

  const primaryKey = primaryKeyByDomain[domain]
  const seen = new Map<string, number>()
  clean.forEach((row, index) => {
    const key = String(row[primaryKey] ?? "")
    if (!key) return
    if (seen.has(key)) { invalidRows.add(index); invalidRows.add(seen.get(key)!); addIssue(issues, { severity: "error", code: "duplicate_id", field: primaryKey, row: index + 2, message: `${primaryKey} is duplicated.` }) }
    else seen.set(key, index)
  })

  if (domain !== "employees") {
    const employeeIds = [...new Set(clean.map((row) => String(row.employee_id ?? "")).filter(Boolean))]
    const employees = await selectExistingValues(database, "employees", "employee_id", employeeIds)
    clean.forEach((row, index) => {
      const employeeId = String(row.employee_id ?? "")
      if (employeeId && !employees.has(employeeId)) { invalidRows.add(index); addIssue(issues, { severity: "error", code: "unknown_employee", field: "employee_id", row: index + 2, message: `Employee ${employeeId} is not in the directory.` }) }
    })
  }

  const validRows = clean.filter((_, index) => !invalidRows.has(index))
  const keys = validRows.map((row) => String(row[primaryKey]))
  const existing = await selectExistingValues(database, tableByDomain[domain], primaryKey, keys)
  const replaced = mode === "replace_imported" ? await database.prepare(`SELECT COUNT(*) AS count FROM ${tableByDomain[domain]} WHERE data_source='imported'`).first<{ count: number }>() : null
  return {
    rows: validRows,
    preview: {
      domain, filename: filename.slice(0, 240) || `${domain}.csv`, mode, totalRows: rows.length,
      validRows: validRows.length, invalidRows: invalidRows.size,
      inserts: keys.filter((key) => !existing.has(key)).length,
      updates: keys.filter((key) => existing.has(key)).length,
      replacedRows: Number(replaced?.count ?? 0),
      canApply: !issues.some((issue) => issue.severity === "error") && invalidRows.size === 0,
      issues,
    },
  }
}

export async function validateHrImport({ domain, rows, filename, mode = "merge" }: { domain: HrDomain; rows: unknown[]; filename: string; mode?: ImportMode }): Promise<ImportPreview> {
  if (!hrDomains.includes(domain)) throw new Error("Unsupported HR data domain.")
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 5000) throw new Error("Import must contain between 1 and 5,000 rows.")
  const database = await ensureHrDatabase()
  return (await validateImportRows(database, domain, rows, filename, mode)).preview
}

function upsertStatement(database: Database, domain: HrDomain, row: Record<string, string | number | null>): Statement {
  const fields = importFields[domain]
  const primaryKey = primaryKeyByDomain[domain]
  const updates = fields.filter((field) => field !== primaryKey).map((field) => `${field}=EXCLUDED.${field}`)
  updates.push("data_source='imported'", "updated_at=CURRENT_TIMESTAMP")
  if (domain === "employees") updates.push("archived_at=NULL", "version=employees.version+1")
  return database.prepare(`INSERT INTO ${tableByDomain[domain]}(${fields.join(",")}, data_source) VALUES (${fields.map(() => "?").join(",")}, 'imported') ON CONFLICT(${primaryKey}) DO UPDATE SET ${updates.join(",")}`)
    .bind(...fields.map((field) => row[field] ?? null))
}

export function inferJobLevel(titleValue: string | number | null): string {
  const title = String(titleValue ?? "").toLowerCase()
  if (/chief|vice president|\bvp\b/.test(title)) return "Executive"
  if (/director|head of/.test(title)) return "Director"
  if (/manager|lead/.test(title)) return "Manager"
  if (/principal|staff/.test(title)) return "IC5"
  if (/senior/.test(title)) return "IC4"
  if (/junior|associate|coordinator|representative/.test(title)) return "IC2"
  return "IC3"
}

function employeeUpsertStatements(database: Database, row: Record<string, string | number | null>): Statement[] {
  const jobProfileId = `JOB-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const department = String(row.department)
  const jobTitle = String(row.job_title)
  const jobLevel = inferJobLevel(row.job_title)
  return [
    database.prepare(`INSERT INTO job_profiles(id, organization_id, department_name, title, job_level)
      VALUES (?, 'org:laidbackhr', ?, ?, ?)
      ON CONFLICT(organization_id, department_name, title, job_level) DO NOTHING`)
      .bind(jobProfileId, department, jobTitle, jobLevel),
    database.prepare(`INSERT INTO employees(employee_id, first_name, last_name, preferred_name, work_email, phone,
      location, manager_id, hire_date, employment_type, employment_status, data_source, organization_id, job_profile_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported', 'org:laidbackhr',
        (SELECT id FROM job_profiles WHERE organization_id='org:laidbackhr' AND department_name=? AND title=? AND job_level=? LIMIT 1))
      ON CONFLICT(employee_id) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
        preferred_name=EXCLUDED.preferred_name, work_email=EXCLUDED.work_email, phone=EXCLUDED.phone,
        location=EXCLUDED.location, manager_id=EXCLUDED.manager_id, hire_date=EXCLUDED.hire_date,
        employment_type=EXCLUDED.employment_type, employment_status=EXCLUDED.employment_status,
        data_source='imported', organization_id=EXCLUDED.organization_id, job_profile_id=EXCLUDED.job_profile_id,
        archived_at=NULL, version=employees.version+1, updated_at=CURRENT_TIMESTAMP`)
      .bind(row.employee_id, row.first_name, row.last_name, row.preferred_name, row.work_email, row.phone,
        row.location, row.manager_id, row.hire_date, row.employment_type, row.employment_status,
        department, jobTitle, jobLevel),
  ]
}

async function reconcileImportedDomain(database: Database, domain: HrDomain): Promise<void> {
  if (domain === "employees") {
    await database.prepare(`UPDATE app_users u SET employee_id=e.employee_id, onboarding_status='complete', updated_at=CURRENT_TIMESTAMP FROM employees e WHERE u.employee_id IS NULL AND LOWER(u.email)=LOWER(e.work_email) AND e.archived_at IS NULL`).run()
  }
  if (domain === "training") {
    await database.batch([
      database.prepare(`INSERT INTO learning_courses(id, title, default_duration_hours, is_mandatory, status)
        SELECT 'course:' || LOWER(TRIM(training_program)), training_program, MAX(training_hours),
          CASE WHEN training_program ~* '(security|privacy|safety|compliance|phishing)' THEN 1 ELSE 0 END, 'active'
        FROM training_records GROUP BY LOWER(TRIM(training_program)), training_program
        ON CONFLICT(title) DO UPDATE SET default_duration_hours=EXCLUDED.default_duration_hours, is_mandatory=EXCLUDED.is_mandatory, updated_at=CURRENT_TIMESTAMP`),
      database.prepare(`INSERT INTO course_assignments(id, course_id, employee_id, assigned_at, status, completed_at, assessment_score, assigned_hours, data_source, updated_at)
        SELECT t.id, 'course:' || LOWER(TRIM(t.training_program)), t.employee_id, t.updated_at, t.completion_status, t.completion_date, t.assessment_score, t.training_hours, t.data_source, t.updated_at FROM training_records t
        ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status, completed_at=EXCLUDED.completed_at, assessment_score=EXCLUDED.assessment_score, assigned_hours=EXCLUDED.assigned_hours, updated_at=CURRENT_TIMESTAMP`),
    ])
  }

  if (domain === "leave") await database.prepare(`INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, priority, owner_email, due_at, next_action, source_entity_type, source_entity_id, assigned_at, confidentiality_level)
    SELECT l.id, 'leave', l.employee_id, l.leave_type || ' leave request', l.approval_status, json_build_object('leaveType', l.leave_type, 'startDate', l.start_date, 'endDate', l.end_date, 'days', l.leave_days)::text,
      'data-import@laidbackhr.cloud', 'medium', COALESCE(m.work_email, 'people-ops@laidbackhr.cloud'), LEAST(CURRENT_DATE + INTERVAL '3 days', l.start_date::date - INTERVAL '1 day')::date::text,
      'Approve or decline the request.', 'leave_record', l.id, CURRENT_TIMESTAMP, 'restricted'
    FROM leave_records l LEFT JOIN employees e ON e.employee_id=l.employee_id LEFT JOIN employees m ON m.employee_id=e.manager_id
    WHERE LOWER(l.approval_status)='pending' ON CONFLICT(id) DO NOTHING`).run()
  if (domain === "hiring") await database.prepare(`INSERT INTO workflow_requests(id, type, title, status, details_json, requested_by_email, priority, owner_email, due_at, next_action, source_entity_type, source_entity_id, assigned_at, confidentiality_level)
    SELECT h.id, 'hiring', h.position || ' requisition', h.recruitment_status, json_build_object('source', h.hiring_source)::text,
      'data-import@laidbackhr.cloud', 'medium', 'talent@laidbackhr.cloud', (h.application_date::date + INTERVAL '7 days')::date::text,
      CASE WHEN LOWER(h.recruitment_status)='requested' THEN 'Approve or decline the requisition.' ELSE 'Record recruiting progress.' END,
      'hiring_record', h.id, CURRENT_TIMESTAMP, 'internal' FROM hiring_records h
    WHERE LOWER(h.recruitment_status) IN ('requested','approved','open','offer') ON CONFLICT(id) DO NOTHING`).run()
  if (domain === "training") await database.prepare(`INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, priority, owner_email, next_action, source_entity_type, source_entity_id, assigned_at, confidentiality_level)
    SELECT t.id, 'training', t.employee_id, t.training_program || ' assignment', t.completion_status, json_build_object('program', t.training_program, 'hours', t.training_hours)::text,
      'data-import@laidbackhr.cloud', 'medium', COALESCE(e.work_email, 'learning@laidbackhr.cloud'), 'Complete the assigned course and record completion.',
      'training_record', t.id, CURRENT_TIMESTAMP, 'internal' FROM training_records t LEFT JOIN employees e ON e.employee_id=t.employee_id
    WHERE LOWER(t.completion_status)<>'completed' ON CONFLICT(id) DO NOTHING`).run()
}

export async function importHrData({ domain, rows, filename, mode = "merge", actorEmail }: { domain: HrDomain; rows: unknown[]; filename: string; mode?: ImportMode; actorEmail?: string }): Promise<{ domain: HrDomain; imported: number; filename: string; jobId: string; preview: ImportPreview }> {
  const database = await ensureHrDatabase()
  const validation = await validateImportRows(database, domain, rows, filename, mode)
  if (!validation.preview.canApply) throw Object.assign(new Error("Import validation failed."), { preview: validation.preview })
  const jobId = crypto.randomUUID()
  const safeFilename = filename.slice(0, 240) || `${domain}.csv`
  await database.prepare("INSERT INTO data_imports(id, domain, filename, mode, total_rows, row_count, inserted_rows, updated_rows, deleted_rows, error_count, imported_by_email, status) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, 'processing')")
    .bind(jobId, domain, safeFilename, mode, validation.preview.totalRows, actorEmail ?? null).run()
  try {
    const statements: Statement[] = []
    if (mode === "replace_imported") statements.push(database.prepare(`DELETE FROM ${tableByDomain[domain]} WHERE data_source='imported'`))
    statements.push(...validation.rows.flatMap((row) => domain === "employees" ? employeeUpsertStatements(database, row) : [upsertStatement(database, domain, row)]))
    statements.push(database.prepare("UPDATE data_imports SET row_count=?, inserted_rows=?, updated_rows=?, deleted_rows=?, status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(validation.preview.validRows, validation.preview.inserts, validation.preview.updates, validation.preview.replacedRows, jobId))
    await database.batch(statements)
    await reconcileImportedDomain(database, domain)
    return { domain, imported: validation.preview.validRows, filename: safeFilename, jobId, preview: validation.preview }
  } catch (error) {
    await database.prepare("UPDATE data_imports SET status='failed', error_count=1, error_summary=?, completed_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(error instanceof Error ? error.message.slice(0, 1000) : "Import failed.", jobId).run()
    throw error
  }
}

export async function getDataImportJobs(limit = 20): Promise<ImportJob[]> {
  const database = await ensureHrDatabase()
  const result = await database.prepare(`SELECT id, domain, filename, mode, status, total_rows AS "totalRows", row_count AS "rowCount", inserted_rows AS "insertedRows", updated_rows AS "updatedRows", deleted_rows AS "deletedRows", error_count AS "errorCount", error_summary AS "errorSummary", imported_by_email AS "importedByEmail", imported_at AS "startedAt", completed_at AS "completedAt" FROM data_imports ORDER BY imported_at DESC LIMIT ?`)
    .bind(Math.min(Math.max(limit, 1), 100)).all<ImportJob>()
  return result.results ?? []
}

export async function getDataImportSummary(): Promise<{ completedImports: number; failedImports: number; lastCompletedAt: string | null }> {
  const database = await ensureHrDatabase()
  const row = await database.prepare(`SELECT COUNT(*) FILTER (WHERE status='completed') AS "completedImports", COUNT(*) FILTER (WHERE status='failed') AS "failedImports", MAX(completed_at) FILTER (WHERE status='completed') AS "lastCompletedAt" FROM data_imports`)
    .first<{ completedImports: number; failedImports: number; lastCompletedAt: string | null }>()
  return { completedImports: Number(row?.completedImports ?? 0), failedImports: Number(row?.failedImports ?? 0), lastCompletedAt: row?.lastCompletedAt ?? null }
}

export async function readDomainRows(domain: HrDomain): Promise<Array<Record<string, unknown>>> {
  return cachedAnalyticsRead(`domain:${domain}`, async () => {
    const database = await ensureHrDatabase()
    const result = await database.prepare(`SELECT * FROM ${readViewByDomain[domain]} ORDER BY updated_at DESC LIMIT 10000`).all<Record<string, unknown>>()
    return result.results ?? []
  })
}

export async function readAttritionModelProfiles(): Promise<Array<Record<string, unknown>>> {
  return cachedAnalyticsRead("domain:attrition-model", async () => {
    const database = await ensureHrDatabase()
    const result = await database.prepare("SELECT * FROM attrition_model_profiles_view ORDER BY risk_score DESC LIMIT 10000").all<Record<string, unknown>>()
    return result.results ?? []
  })
}
