import normalizedHrMigration from "@/drizzle/0011_cold_blindfold.sql?raw"
import { generateCorrelatedDemoData, type CorrelatedDemoData } from "@/lib/server/correlated-demo"
import { getEmployees, getModelMetadata } from "@/lib/server/runtime"
import { hrDomains, importFields, type HrDomain } from "@/lib/hr-types"
import type { ImportIssue, ImportJob, ImportMode, ImportPreview } from "@/lib/data-import-types"
import { runtimeEnv } from "@/lib/server/runtime-env"

export type Statement = {
  bind(...values: unknown[]): Statement
  run(): Promise<{ success?: boolean }>
  all<T>(): Promise<{ results?: T[] }>
  first<T>(): Promise<T | null>
}

export type Database = {
  dialect?: "d1" | "postgres"
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

const readViewByDomain: Record<HrDomain, string> = {
  employees: "employee_directory_view",
  hiring: "hiring_requisitions_view",
  attrition: "attrition_events_view",
  leave: "leave_requests_view",
  training: "learning_assignments_view",
  promotions: "promotion_events_view",
}

const createStatements = [
  "CREATE TABLE IF NOT EXISTS employees (employee_id TEXT PRIMARY KEY, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '', preferred_name TEXT, work_email TEXT, phone TEXT, department TEXT NOT NULL, job_title TEXT NOT NULL, location TEXT NOT NULL, manager TEXT NOT NULL, manager_id TEXT, hire_date TEXT NOT NULL, employment_type TEXT NOT NULL DEFAULT 'Full-time', employment_status TEXT NOT NULL, tenure_years REAL NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', archived_at TEXT, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS employee_activity (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, event_type TEXT NOT NULL, summary TEXT NOT NULL, changes_json TEXT, actor_email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS workspace_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS hiring_records (id TEXT PRIMARY KEY, position TEXT NOT NULL, department TEXT NOT NULL, application_date TEXT NOT NULL, hiring_date TEXT, hiring_source TEXT NOT NULL, time_to_hire_days INTEGER, recruitment_status TEXT NOT NULL, location TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS hiring_candidates (id TEXT PRIMARY KEY, requisition_id TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'Applied', source TEXT NOT NULL, applied_at TEXT NOT NULL, owner_email TEXT NOT NULL, next_step TEXT NOT NULL, next_step_due_at TEXT, notes TEXT, rejected_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS hiring_candidates_requisition_stage_idx ON hiring_candidates(requisition_id, stage)",
  "CREATE INDEX IF NOT EXISTS hiring_candidates_due_stage_idx ON hiring_candidates(next_step_due_at, stage)",
  "CREATE UNIQUE INDEX IF NOT EXISTS hiring_candidates_requisition_email_idx ON hiring_candidates(requisition_id, email)",
  "CREATE TABLE IF NOT EXISTS hiring_activity (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, requisition_id TEXT NOT NULL, action TEXT NOT NULL, from_status TEXT, to_status TEXT, detail TEXT NOT NULL, actor_email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS hiring_activity_requisition_created_idx ON hiring_activity(requisition_id, created_at)",
  "CREATE INDEX IF NOT EXISTS hiring_activity_entity_created_idx ON hiring_activity(entity_type, entity_id, created_at)",
  "CREATE TABLE IF NOT EXISTS attrition_events (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, exit_date TEXT NOT NULL, exit_reason TEXT NOT NULL, exit_type TEXT NOT NULL, department TEXT NOT NULL, tenure_years REAL NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS attrition_model_profiles (employee_id TEXT PRIMARY KEY, observed_attrition TEXT NOT NULL, risk_score REAL NOT NULL, risk_level TEXT NOT NULL, top_driver TEXT NOT NULL, monthly_income REAL NOT NULL, distance_from_home INTEGER NOT NULL, education_level INTEGER NOT NULL, education_field TEXT NOT NULL, environment_satisfaction INTEGER NOT NULL, job_satisfaction INTEGER NOT NULL, prior_companies INTEGER NOT NULL, work_life_balance INTEGER NOT NULL, years_at_company REAL NOT NULL, model_version TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'demo', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS attrition_model_risk_idx ON attrition_model_profiles(risk_level, risk_score)",
  "CREATE INDEX IF NOT EXISTS attrition_model_observed_idx ON attrition_model_profiles(observed_attrition)",
  "CREATE TABLE IF NOT EXISTS leave_records (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, leave_type TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, leave_days REAL NOT NULL, approval_status TEXT NOT NULL, department TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS training_records (id TEXT PRIMARY KEY, training_program TEXT NOT NULL, employee_id TEXT NOT NULL, completion_status TEXT NOT NULL, completion_date TEXT, training_hours REAL NOT NULL, assessment_score REAL, department TEXT NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS promotion_records (id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, previous_title TEXT NOT NULL, new_title TEXT NOT NULL, promotion_date TEXT NOT NULL, department TEXT NOT NULL, months_since_previous_promotion INTEGER NOT NULL, data_source TEXT NOT NULL DEFAULT 'imported', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS data_imports (id TEXT PRIMARY KEY, domain TEXT NOT NULL, filename TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'merge', total_rows INTEGER NOT NULL DEFAULT 0, row_count INTEGER NOT NULL, inserted_rows INTEGER NOT NULL DEFAULT 0, updated_rows INTEGER NOT NULL DEFAULT 0, deleted_rows INTEGER NOT NULL DEFAULT 0, error_count INTEGER NOT NULL DEFAULT 0, error_summary TEXT, imported_by_email TEXT, status TEXT NOT NULL, completed_at TEXT, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS data_imports_domain_date_idx ON data_imports(domain, imported_at)",
  "CREATE INDEX IF NOT EXISTS data_imports_status_date_idx ON data_imports(status, imported_at)",
  "CREATE TABLE IF NOT EXISTS data_import_rows (job_id TEXT NOT NULL, row_key TEXT NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(job_id, row_key))",
  "CREATE TABLE IF NOT EXISTS workflow_requests (id TEXT PRIMARY KEY, type TEXT NOT NULL, employee_id TEXT, title TEXT NOT NULL, status TEXT NOT NULL, details_json TEXT NOT NULL DEFAULT '{}', requested_by_email TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium', owner_email TEXT, due_at TEXT, next_action TEXT, source_entity_type TEXT, source_entity_id TEXT, assigned_at TEXT, blocked_reason TEXT, confidentiality_level TEXT NOT NULL DEFAULT 'internal', resolved_by_email TEXT, resolved_at TEXT, completed_at TEXT, completion_notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS workflow_type_status_idx ON workflow_requests(type, status)",
  "CREATE INDEX IF NOT EXISTS workflow_employee_idx ON workflow_requests(employee_id)",
  "CREATE INDEX IF NOT EXISTS workflow_requester_idx ON workflow_requests(requested_by_email)",
  "CREATE TABLE IF NOT EXISTS ai_workflow_drafts (id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ready', employee_ids_json TEXT NOT NULL DEFAULT '[]', details_json TEXT NOT NULL DEFAULT '{}', created_by_email TEXT NOT NULL, opened_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS ai_workflow_creator_idx ON ai_workflow_drafts(created_by_email)",
  "CREATE TABLE IF NOT EXISTS ai_conversations (id TEXT PRIMARY KEY, user_email TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS ai_conversations_user_updated_idx ON ai_conversations(user_email, updated_at)",
  "CREATE TABLE IF NOT EXISTS ai_conversation_messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, position INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, tools_json TEXT, context_json TEXT, data_mode TEXT, provider TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS ai_conversation_messages_conversation_position_idx ON ai_conversation_messages(conversation_id, position)",
  "CREATE TABLE IF NOT EXISTS app_users (email TEXT PRIMARY KEY, display_name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'viewer', status TEXT NOT NULL DEFAULT 'active', invited_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT)",
  "CREATE TABLE IF NOT EXISTS access_audit (id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, action TEXT NOT NULL, target_email TEXT NOT NULL, details_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS access_audit_created_idx ON access_audit(created_at)",
  "CREATE INDEX IF NOT EXISTS access_audit_target_idx ON access_audit(target_email)",
  "PRAGMA optimize",
]

const normalizedHrStatements = normalizedHrMigration
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean)

const reconciliationStart = normalizedHrStatements.findIndex((statement) => statement.startsWith("INSERT OR IGNORE INTO departments"))
const reconciliationEnd = normalizedHrStatements.findIndex((statement) => statement.startsWith("CREATE VIEW IF NOT EXISTS employee_directory_view"))
if (reconciliationStart < 0 || reconciliationEnd <= reconciliationStart) throw new Error("Normalized HR reconciliation statements are missing.")
const normalizedHrReconciliationStatements = normalizedHrStatements.slice(reconciliationStart, reconciliationEnd)

async function applyNormalizedHrSchema(database: Database): Promise<void> {
  const applied = await database.prepare("SELECT value FROM workspace_settings WHERE key = 'normalized_hr_schema_v1'").first<{ value: string }>()
  if (applied) return
  for (const [index, statement] of normalizedHrStatements.entries()) {
    try {
      await database.prepare(statement).run()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`NORMALIZED_SCHEMA_STATEMENT_${index + 1}: ${detail}; ${statement.slice(0, 120)}`, { cause: error })
    }
  }
  await database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES ('normalized_hr_schema_v1', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP").run()
}

async function refreshNormalizedReportingLines(database: Database): Promise<void> {
  await database.prepare(`
    UPDATE employment_assignments
    SET manager_employee_id = (
      SELECT e.manager_id FROM employees e
      WHERE e.employee_id = employment_assignments.employee_id
        AND EXISTS (SELECT 1 FROM employees m WHERE m.employee_id = e.manager_id)
    ), updated_at = CURRENT_TIMESTAMP
    WHERE is_primary = 1
  `).run()
}

let readyDatabase: Database | null = null
let setupPromise: Promise<void> | null = null

export function getHrDatabase(): Database | null {
  return (runtimeEnv as unknown as { DB?: Database }).DB ?? null
}

async function configuredDatabase(): Promise<Database | null> {
  const boundDatabase = getHrDatabase()
  if (boundDatabase) return boundDatabase
  if (!runtimeEnv.DATABASE_URL) return null
  const { getPostgresDatabase } = await import("@/lib/server/postgres-database")
  return getPostgresDatabase()
}

let cachedDemo: CorrelatedDemoData | null = null

function correlatedDemo(): CorrelatedDemoData {
  if (!cachedDemo) {
    cachedDemo = generateCorrelatedDemoData(getEmployees({ limit: 2000 }).items, getModelMetadata().model_version)
  }
  return cachedDemo
}

function generateDemoDataset(): Dataset {
  return correlatedDemo().dataset
}

function generateDemoModelProfiles() {
  return correlatedDemo().modelProfiles
}

async function syncModelRuntime(database: Database): Promise<void> {
  const metadata = getModelMetadata()
  await database.prepare(`
    INSERT INTO model_versions(
      id, model_name, algorithm, review_threshold, evaluation_window_days,
      metrics_json, intended_use, prohibited_use, trained_at, status
    ) VALUES (?, ?, ?, ?, 365, ?, ?, ?, ?, 'active')
    ON CONFLICT(id) DO UPDATE SET
      model_name=excluded.model_name,
      algorithm=excluded.algorithm,
      review_threshold=excluded.review_threshold,
      metrics_json=excluded.metrics_json,
      intended_use=excluded.intended_use,
      prohibited_use=excluded.prohibited_use,
      trained_at=excluded.trained_at,
      status='active'
  `).bind(
    metadata.model_version,
    metadata.model_name,
    metadata.model_family,
    metadata.threshold,
    JSON.stringify({
      evaluation: metadata.evaluation,
      thresholdPolicy: metadata.threshold_policy,
      explanationMethod: metadata.explanation_method,
      metrics: metadata.metrics,
    }),
    "Aggregate workforce analysis and qualified review of historical demonstration profiles.",
    "Automated employment decisions, resignation timing, causal claims, or use as the sole basis for employee action.",
    metadata.trained_at,
  ).run()

  const current = await database.prepare("SELECT COUNT(*) AS count FROM attrition_model_profiles WHERE data_source='demo' AND model_version=?")
    .bind(metadata.model_version).first<{ count: number }>()
  if (Number(current?.count ?? 0) === generateDemoModelProfiles().length) return

  await database.prepare("DELETE FROM attrition_model_profiles WHERE data_source='demo'").run()
  const statements = generateDemoModelProfiles().map((profile) => database.prepare(modelProfileInsertSql).bind(
    profile.employee_id,
    profile.observed_attrition,
    profile.risk_score,
    profile.risk_level,
    profile.top_driver,
    profile.monthly_income,
    profile.distance_from_home,
    profile.education_level,
    profile.education_field,
    profile.environment_satisfaction,
    profile.job_satisfaction,
    profile.prior_companies,
    profile.work_life_balance,
    profile.years_at_company,
    profile.model_version,
    profile.data_source,
  ))
  for (let index = 0; index < statements.length; index += 80) await database.batch(statements.slice(index, index + 80))
}

const insertSql: Record<HrDomain, string> = {
  employees: "INSERT INTO employees(employee_id, first_name, last_name, preferred_name, work_email, phone, department, job_title, location, manager, manager_id, hire_date, employment_type, employment_status, tenure_years, data_source, archived_at, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(employee_id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, preferred_name=excluded.preferred_name, work_email=excluded.work_email, phone=excluded.phone, department=excluded.department, job_title=excluded.job_title, location=excluded.location, manager=excluded.manager, manager_id=excluded.manager_id, hire_date=excluded.hire_date, employment_type=excluded.employment_type, employment_status=excluded.employment_status, tenure_years=excluded.tenure_years, data_source=excluded.data_source, archived_at=NULL, version=employees.version+1, updated_at=CURRENT_TIMESTAMP",
  hiring: "INSERT INTO hiring_records(id, position, department, application_date, hiring_date, hiring_source, time_to_hire_days, recruitment_status, location, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET position=excluded.position, department=excluded.department, application_date=excluded.application_date, hiring_date=excluded.hiring_date, hiring_source=excluded.hiring_source, time_to_hire_days=excluded.time_to_hire_days, recruitment_status=excluded.recruitment_status, location=excluded.location, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP",
  attrition: "INSERT INTO attrition_events(id, employee_id, exit_date, exit_reason, exit_type, department, tenure_years, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id, exit_date=excluded.exit_date, exit_reason=excluded.exit_reason, exit_type=excluded.exit_type, department=excluded.department, tenure_years=excluded.tenure_years, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP",
  leave: "INSERT INTO leave_records(id, employee_id, leave_type, start_date, end_date, leave_days, approval_status, department, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id, leave_type=excluded.leave_type, start_date=excluded.start_date, end_date=excluded.end_date, leave_days=excluded.leave_days, approval_status=excluded.approval_status, department=excluded.department, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP",
  training: "INSERT INTO training_records(id, training_program, employee_id, completion_status, completion_date, training_hours, assessment_score, department, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET training_program=excluded.training_program, employee_id=excluded.employee_id, completion_status=excluded.completion_status, completion_date=excluded.completion_date, training_hours=excluded.training_hours, assessment_score=excluded.assessment_score, department=excluded.department, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP",
  promotions: "INSERT INTO promotion_records(id, employee_id, previous_title, new_title, promotion_date, department, months_since_previous_promotion, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id, previous_title=excluded.previous_title, new_title=excluded.new_title, promotion_date=excluded.promotion_date, department=excluded.department, months_since_previous_promotion=excluded.months_since_previous_promotion, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP",
}

const modelProfileInsertSql = "INSERT INTO attrition_model_profiles(employee_id, observed_attrition, risk_score, risk_level, top_driver, monthly_income, distance_from_home, education_level, education_field, environment_satisfaction, job_satisfaction, prior_companies, work_life_balance, years_at_company, model_version, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(employee_id) DO UPDATE SET observed_attrition=excluded.observed_attrition, risk_score=excluded.risk_score, risk_level=excluded.risk_level, top_driver=excluded.top_driver, monthly_income=excluded.monthly_income, distance_from_home=excluded.distance_from_home, education_level=excluded.education_level, education_field=excluded.education_field, environment_satisfaction=excluded.environment_satisfaction, job_satisfaction=excluded.job_satisfaction, prior_companies=excluded.prior_companies, work_life_balance=excluded.work_life_balance, years_at_company=excluded.years_at_company, model_version=excluded.model_version, data_source=excluded.data_source, updated_at=CURRENT_TIMESTAMP"

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
  const profileCount = await database.prepare("SELECT COUNT(*) AS count FROM attrition_model_profiles_view").first<{ count: number }>()
  if (Number(profileCount?.count ?? 0) === 0) {
    const profileStatements = generateDemoModelProfiles().map((profile) => database.prepare(modelProfileInsertSql).bind(
      profile.employee_id,
      profile.observed_attrition,
      profile.risk_score,
      profile.risk_level,
      profile.top_driver,
      profile.monthly_income,
      profile.distance_from_home,
      profile.education_level,
      profile.education_field,
      profile.environment_satisfaction,
      profile.job_satisfaction,
      profile.prior_companies,
      profile.work_life_balance,
      profile.years_at_company,
      profile.model_version,
      profile.data_source,
    ))
    for (let index = 0; index < profileStatements.length; index += 80) {
      await database.batch(profileStatements.slice(index, index + 80))
    }
  }
}

async function seedDemoOnce(database: Database): Promise<void> {
  const initialized = await database.prepare("SELECT value FROM workspace_settings WHERE key = 'demo_seed_initialized'").first<{ value: string }>()
  if (initialized) return
  await seedEmptyDomains(database)
  await database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES ('demo_seed_initialized', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP").run()
}

async function seedCorrelatedDemoOnce(database: Database): Promise<void> {
  const initialized = await database.prepare("SELECT value FROM workspace_settings WHERE key = 'correlated_demo_seed_v2'").first<{ value: string }>()
  if (initialized) return

  const demo = correlatedDemo()
  await database.batch([
    database.prepare("DELETE FROM attrition_model_profiles WHERE data_source = 'demo'"),
    ...hrDomains.map((domain) => database.prepare(`DELETE FROM ${tableByDomain[domain]} WHERE data_source = 'demo'`)),
  ])

  for (const domain of hrDomains) {
    const statements = demo.dataset[domain].map((row) => database.prepare(insertSql[domain]).bind(...valuesFor(domain, row)))
    for (let index = 0; index < statements.length; index += 80) {
      await database.batch(statements.slice(index, index + 80))
    }
  }
  const profileStatements = demo.modelProfiles.map((profile) => database.prepare(modelProfileInsertSql).bind(
    profile.employee_id,
    profile.observed_attrition,
    profile.risk_score,
    profile.risk_level,
    profile.top_driver,
    profile.monthly_income,
    profile.distance_from_home,
    profile.education_level,
    profile.education_field,
    profile.environment_satisfaction,
    profile.job_satisfaction,
    profile.prior_companies,
    profile.work_life_balance,
    profile.years_at_company,
    profile.model_version,
    profile.data_source,
  ))
  for (let index = 0; index < profileStatements.length; index += 80) {
    await database.batch(profileStatements.slice(index, index + 80))
  }
  await database.batch([
    database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES ('correlated_demo_seed_v2', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP"),
    database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES ('leave_workflow_examples_v1', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP"),
    database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES ('training_workflow_examples_v1', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP"),
  ])
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

const workflowColumnDefinitions: Record<string, string> = {
  priority: "TEXT NOT NULL DEFAULT 'medium'",
  owner_email: "TEXT",
  due_at: "TEXT",
  next_action: "TEXT",
  source_entity_type: "TEXT",
  source_entity_id: "TEXT",
  assigned_at: "TEXT",
  blocked_reason: "TEXT",
  confidentiality_level: "TEXT NOT NULL DEFAULT 'internal'",
  completed_at: "TEXT",
  completion_notes: "TEXT",
}

const modelVersionColumnDefinitions: Record<string, string> = {
  algorithm: "TEXT",
  review_threshold: "REAL",
  evaluation_window_days: "INTEGER",
  metrics_json: "TEXT",
  intended_use: "TEXT",
  prohibited_use: "TEXT",
  trained_at: "TEXT",
  status: "TEXT NOT NULL DEFAULT 'active'",
  created_at: "TEXT",
}

const dataImportColumnDefinitions: Record<string, string> = {
  mode: "TEXT NOT NULL DEFAULT 'merge'",
  total_rows: "INTEGER NOT NULL DEFAULT 0",
  inserted_rows: "INTEGER NOT NULL DEFAULT 0",
  updated_rows: "INTEGER NOT NULL DEFAULT 0",
  deleted_rows: "INTEGER NOT NULL DEFAULT 0",
  error_count: "INTEGER NOT NULL DEFAULT 0",
  error_summary: "TEXT",
  imported_by_email: "TEXT",
  completed_at: "TEXT",
}

const assessmentFeatureColumnDefinitions: Record<string, string> = {
  contribution: "REAL",
  contribution_rank: "INTEGER",
  explanation: "TEXT",
}

async function ensureEmployeeProfileColumns(database: Database): Promise<void> {
  const result = await database.prepare("PRAGMA table_info(employees)").all<{ name: string }>()
  const present = new Set((result.results ?? []).map((column) => column.name))
  for (const [name, definition] of Object.entries(profileColumnDefinitions)) {
    if (!present.has(name)) await database.prepare(`ALTER TABLE employees ADD COLUMN ${name} ${definition}`).run()
  }
}

async function ensureWorkflowAccountabilityColumns(database: Database): Promise<void> {
  const result = await database.prepare("PRAGMA table_info(workflow_requests)").all<{ name: string }>()
  const present = new Set((result.results ?? []).map((column) => column.name))
  for (const [name, definition] of Object.entries(workflowColumnDefinitions)) {
    if (!present.has(name)) await database.prepare(`ALTER TABLE workflow_requests ADD COLUMN ${name} ${definition}`).run()
  }
  await database.batch([
    database.prepare("CREATE INDEX IF NOT EXISTS workflow_owner_status_idx ON workflow_requests(owner_email, status)"),
    database.prepare("CREATE INDEX IF NOT EXISTS workflow_due_status_idx ON workflow_requests(due_at, status)"),
  ])
  await database.prepare("PRAGMA optimize").run()
}

async function ensureModelVersionColumns(database: Database): Promise<void> {
  const result = await database.prepare("PRAGMA table_info(model_versions)").all<{ name: string }>()
  const present = new Set((result.results ?? []).map((column) => column.name))
  for (const [name, definition] of Object.entries(modelVersionColumnDefinitions)) {
    if (!present.has(name)) await database.prepare(`ALTER TABLE model_versions ADD COLUMN ${name} ${definition}`).run()
  }
}

async function ensureDataImportColumns(database: Database): Promise<void> {
  const result = await database.prepare("PRAGMA table_info(data_imports)").all<{ name: string }>()
  const present = new Set((result.results ?? []).map((column) => column.name))
  for (const [name, definition] of Object.entries(dataImportColumnDefinitions)) {
    if (!present.has(name)) await database.prepare(`ALTER TABLE data_imports ADD COLUMN ${name} ${definition}`).run()
  }
  await database.batch([
    database.prepare("DROP INDEX IF EXISTS data_imports_domain_idx"),
    database.prepare("CREATE INDEX IF NOT EXISTS data_imports_domain_date_idx ON data_imports(domain, imported_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS data_imports_status_date_idx ON data_imports(status, imported_at)"),
  ])
}

async function ensureAssessmentFeatureColumns(database: Database): Promise<void> {
  const result = await database.prepare("PRAGMA table_info(attrition_assessment_features)").all<{ name: string }>()
  if (!(result.results ?? []).length) return
  const present = new Set((result.results ?? []).map((column) => column.name))
  for (const [name, definition] of Object.entries(assessmentFeatureColumnDefinitions)) {
    if (!present.has(name)) await database.prepare(`ALTER TABLE attrition_assessment_features ADD COLUMN ${name} ${definition}`).run()
  }
}

async function backfillWorkflowAccountabilityOnce(database: Database): Promise<void> {
  const settingKey = "workflow_accountability_v1"
  const initialized = await database.prepare("SELECT value FROM workspace_settings WHERE key = ?").bind(settingKey).first<{ value: string }>()
  if (initialized) return

  await database.batch([
    database.prepare(`
      UPDATE workflow_requests
      SET owner_email = COALESCE(NULLIF(owner_email, ''), (
            SELECT NULLIF(m.work_email, '')
            FROM employee_directory_view e
            LEFT JOIN employee_directory_view m ON m.employee_id = e.manager_id
            WHERE e.employee_id = workflow_requests.employee_id
          ), 'people-ops@laidbackhr.cloud'),
          due_at = COALESCE(due_at, MIN(date(created_at, '+3 days'), date(json_extract(details_json, '$.startDate'), '-1 day'))),
          priority = CASE
            WHEN LOWER(status) IN ('approved', 'rejected') THEN 'low'
            WHEN COALESCE(due_at, MIN(date(created_at, '+3 days'), date(json_extract(details_json, '$.startDate'), '-1 day'))) <= date('now', '+1 day') THEN 'high'
            ELSE 'medium'
          END,
          next_action = COALESCE(NULLIF(next_action, ''), CASE WHEN LOWER(status) = 'pending' THEN 'Approve or decline the request.' ELSE 'No further action.' END),
          source_entity_type = COALESCE(source_entity_type, 'leave_record'),
          source_entity_id = COALESCE(source_entity_id, id),
          assigned_at = COALESCE(assigned_at, created_at),
          confidentiality_level = 'restricted',
          completed_at = CASE WHEN LOWER(status) IN ('approved', 'rejected') THEN COALESCE(completed_at, resolved_at, updated_at) ELSE completed_at END,
          completion_notes = CASE WHEN LOWER(status) IN ('approved', 'rejected') THEN COALESCE(completion_notes, 'Leave request ' || LOWER(status) || '.') ELSE completion_notes END
      WHERE type = 'leave'
    `),
    database.prepare(`
      UPDATE workflow_requests
      SET owner_email = COALESCE(NULLIF(owner_email, ''), 'talent@laidbackhr.cloud'),
          due_at = COALESCE(due_at, CASE
            WHEN LOWER(status) = 'requested' THEN date(created_at, '+3 days')
            WHEN LOWER(status) = 'offer' THEN date(created_at, '+5 days')
            ELSE date(created_at, '+14 days')
          END),
          priority = CASE
            WHEN LOWER(status) IN ('rejected', 'closed', 'hired') THEN 'low'
            WHEN COALESCE(due_at, date(created_at, CASE WHEN LOWER(status) = 'requested' THEN '+3 days' ELSE '+14 days' END)) <= date('now') THEN 'high'
            ELSE 'medium'
          END,
          next_action = COALESCE(NULLIF(next_action, ''), CASE
            WHEN LOWER(status) = 'requested' THEN 'Approve or decline the requisition.'
            WHEN LOWER(status) = 'offer' THEN 'Confirm the offer response and next step.'
            WHEN LOWER(status) IN ('open', 'approved') THEN 'Record recruiting progress or confirm the requisition remains active.'
            ELSE 'No further action.'
          END),
          source_entity_type = COALESCE(source_entity_type, 'hiring_record'),
          source_entity_id = COALESCE(source_entity_id, id),
          assigned_at = COALESCE(assigned_at, created_at),
          confidentiality_level = COALESCE(NULLIF(confidentiality_level, ''), 'internal'),
          completed_at = CASE WHEN LOWER(status) IN ('rejected', 'closed', 'hired') THEN COALESCE(completed_at, resolved_at, updated_at) ELSE completed_at END,
          completion_notes = CASE WHEN LOWER(status) IN ('rejected', 'closed', 'hired') THEN COALESCE(completion_notes, 'Hiring workflow ' || LOWER(status) || '.') ELSE completion_notes END
      WHERE type = 'hiring'
    `),
    database.prepare(`
      UPDATE workflow_requests
      SET owner_email = COALESCE(NULLIF(owner_email, ''), (SELECT NULLIF(work_email, '') FROM employee_directory_view WHERE employee_id = workflow_requests.employee_id), requested_by_email),
          due_at = COALESCE(due_at, json_extract(details_json, '$.dueDate')),
          priority = CASE
            WHEN LOWER(status) = 'completed' THEN 'low'
            WHEN COALESCE(due_at, json_extract(details_json, '$.dueDate')) < date('now') THEN 'high'
            ELSE 'medium'
          END,
          next_action = COALESCE(NULLIF(next_action, ''), CASE WHEN LOWER(status) = 'completed' THEN 'No further action.' ELSE 'Complete the assigned course and record completion.' END),
          source_entity_type = COALESCE(source_entity_type, 'training_record'),
          source_entity_id = COALESCE(source_entity_id, id),
          assigned_at = COALESCE(assigned_at, created_at),
          confidentiality_level = COALESCE(NULLIF(confidentiality_level, ''), 'internal'),
          completed_at = CASE WHEN LOWER(status) = 'completed' THEN COALESCE(completed_at, resolved_at, updated_at) ELSE completed_at END,
          completion_notes = CASE WHEN LOWER(status) = 'completed' THEN COALESCE(completion_notes, 'Training completion recorded.') ELSE completion_notes END
      WHERE type = 'training'
    `),
    database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES (?, 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP").bind(settingKey),
  ])
}

function operationalWorkStatements(database: Database): Statement[] {
  return [
    database.prepare(`
      INSERT OR IGNORE INTO workflow_requests(
        id, type, employee_id, title, status, details_json, requested_by_email,
        priority, owner_email, due_at, next_action, source_entity_type, source_entity_id,
        assigned_at, confidentiality_level, created_at, updated_at
      )
      SELECT l.id, 'leave', l.employee_id, l.leave_type || ' leave request', l.approval_status,
        json_object('leaveType', l.leave_type, 'startDate', l.start_date, 'endDate', l.end_date, 'days', l.leave_days),
        'data-import@laidbackhr.cloud',
        CASE WHEN MIN(date('now', '+3 days'), date(l.start_date, '-1 day')) <= date('now', '+1 day') THEN 'high' ELSE 'medium' END,
        COALESCE(NULLIF(m.work_email, ''), 'people-ops@laidbackhr.cloud'),
        MIN(date('now', '+3 days'), date(l.start_date, '-1 day')),
        'Approve or decline the request.', 'leave_record', l.id, CURRENT_TIMESTAMP, 'restricted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM leave_requests_view l
      LEFT JOIN employee_directory_view e ON e.employee_id = l.employee_id
      LEFT JOIN employee_directory_view m ON m.employee_id = e.manager_id
      WHERE LOWER(l.data_source) <> 'demo' AND LOWER(l.approval_status) = 'pending'
    `),
    database.prepare(`
      INSERT OR IGNORE INTO workflow_requests(
        id, type, employee_id, title, status, details_json, requested_by_email,
        priority, owner_email, due_at, next_action, source_entity_type, source_entity_id,
        assigned_at, confidentiality_level, created_at, updated_at
      )
      SELECT h.id, 'hiring', NULL, 'New ' || h.position || ' requisition', h.recruitment_status,
        json_object('employmentType', 'Full-time', 'justification', 'Imported hiring record.'),
        'data-import@laidbackhr.cloud',
        CASE WHEN date(h.application_date, CASE WHEN LOWER(h.recruitment_status) = 'requested' THEN '+3 days' ELSE '+14 days' END) <= date('now') THEN 'high' ELSE 'medium' END,
        'talent@laidbackhr.cloud',
        date(h.application_date, CASE WHEN LOWER(h.recruitment_status) = 'requested' THEN '+3 days' ELSE '+14 days' END),
        CASE
          WHEN LOWER(h.recruitment_status) = 'requested' THEN 'Approve or decline the requisition.'
          WHEN LOWER(h.recruitment_status) = 'offer' THEN 'Confirm the offer response and next step.'
          ELSE 'Record recruiting progress or confirm the requisition remains active.'
        END,
        'hiring_record', h.id, CURRENT_TIMESTAMP, 'internal', h.application_date, CURRENT_TIMESTAMP
      FROM hiring_requisitions_view h
      WHERE LOWER(h.data_source) <> 'demo' AND LOWER(h.recruitment_status) IN ('requested', 'open', 'offer')
    `),
    database.prepare(`
      INSERT OR IGNORE INTO workflow_requests(
        id, type, employee_id, title, status, details_json, requested_by_email,
        priority, owner_email, due_at, next_action, source_entity_type, source_entity_id,
        assigned_at, blocked_reason, confidentiality_level, created_at, updated_at
      )
      SELECT t.id, 'training', t.employee_id, t.training_program || ' assignment', t.completion_status,
        json_object('program', t.training_program, 'hours', t.training_hours),
        'data-import@laidbackhr.cloud', 'medium', COALESCE(NULLIF(e.work_email, ''), 'learning@laidbackhr.cloud'), NULL,
        'Set a due date before escalation.', 'training_record', t.id, CURRENT_TIMESTAMP,
        'No assignment due date was included in the imported record.', 'internal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM learning_assignments_view t
      LEFT JOIN employee_directory_view e ON e.employee_id = t.employee_id
      WHERE LOWER(t.data_source) <> 'demo' AND LOWER(t.completion_status) <> 'completed'
    `),
  ]
}

async function syncOpenOperationalWork(database: Database): Promise<void> {
  await database.batch(operationalWorkStatements(database))
}

async function syncPostgresLearningCatalog(database: Database): Promise<void> {
  await database.prepare(`
    INSERT INTO learning_courses(id, title, default_duration_hours, is_mandatory, status, created_at, updated_at)
    SELECT 'course:' || LOWER(TRIM(training_program)), training_program, MAX(training_hours),
      CASE WHEN LOWER(training_program) LIKE '%security%'
        OR LOWER(training_program) LIKE '%privacy%'
        OR LOWER(training_program) LIKE '%safety%' THEN 1 ELSE 0 END,
      'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM training_records
    WHERE TRIM(COALESCE(training_program, '')) <> ''
    GROUP BY LOWER(TRIM(training_program)), training_program
    ON CONFLICT(title) DO UPDATE SET
      default_duration_hours=excluded.default_duration_hours,
      is_mandatory=excluded.is_mandatory,
      updated_at=CURRENT_TIMESTAMP
  `).run()
  await database.prepare(`
    INSERT INTO course_assignments(
      id, course_id, employee_id, assigned_at, due_date, status, completed_at,
      assessment_score, assigned_hours, data_source, updated_at
    )
    SELECT t.id, 'course:' || LOWER(TRIM(t.training_program)), t.employee_id,
      COALESCE(w.created_at, t.updated_at),
      COALESCE(json_extract(w.details_json, '$.dueDate'), t.completion_date),
      t.completion_status, t.completion_date, t.assessment_score,
      t.training_hours, t.data_source, t.updated_at
    FROM training_records t
    LEFT JOIN workflow_requests w ON w.id=t.id AND w.type='training'
    ON CONFLICT(id) DO UPDATE SET
      course_id=excluded.course_id,
      employee_id=excluded.employee_id,
      due_date=excluded.due_date,
      status=excluded.status,
      completed_at=excluded.completed_at,
      assessment_score=excluded.assessment_score,
      assigned_hours=excluded.assigned_hours,
      data_source=excluded.data_source,
      updated_at=excluded.updated_at
  `).run()
}

async function backfillDemoProfiles(database: Database): Promise<void> {
  const blanks = await database.prepare("SELECT employee_id FROM employee_directory_view WHERE data_source = 'demo' AND COALESCE(first_name, '') = ''").all<{ employee_id: string }>()
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

  const result = await database.prepare("SELECT employee_id, department FROM employee_directory_view WHERE archived_at IS NULL AND LOWER(employment_status) <> 'terminated' ORDER BY CASE WHEN LOWER(data_source) = 'demo' THEN 1 ELSE 0 END, employee_id LIMIT 18").all<LeaveExampleEmployee>()
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

  const result = await database.prepare("SELECT employee_id, department FROM employee_directory_view WHERE archived_at IS NULL AND LOWER(employment_status) <> 'terminated' ORDER BY CASE WHEN LOWER(data_source) = 'demo' THEN 1 ELSE 0 END, employee_id LIMIT 18").all<LeaveExampleEmployee>()
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

type SoftwareWorkflowEmployee = {
  employee_id: string
  department: string
}

async function seedSoftwareCompanyWorkflowsOnce(database: Database): Promise<void> {
  const settingKey = "software_company_workflows_v1"
  const initialized = await database.prepare("SELECT value FROM workspace_settings WHERE key = ?")
    .bind(settingKey).first<{ value: string }>()
  if (initialized) return

  const result = await database.prepare("SELECT employee_id, department FROM employee_directory_view WHERE archived_at IS NULL AND LOWER(employment_status) <> 'terminated' AND LOWER(COALESCE(work_email, '')) <> 'pranavreddyg17@gmail.com' ORDER BY employee_id LIMIT 48")
    .all<SoftwareWorkflowEmployee>()
  const employees = result.results ?? []
  if (!employees.length) return

  const statements: Statement[] = []
  const leaveExamples = [
    { type: "Annual", start: -150, days: 4, status: "Approved" },
    { type: "Sick", start: -118, days: 2, status: "Approved" },
    { type: "Personal", start: -91, days: 1, status: "Approved" },
    { type: "Annual", start: -63, days: 5, status: "Approved" },
    { type: "Caregiver", start: -34, days: 3, status: "Approved" },
    { type: "Annual", start: -16, days: 3, status: "Approved" },
    { type: "Sick", start: -2, days: 4, status: "Approved" },
    { type: "Personal", start: 0, days: 1, status: "Approved" },
    { type: "Annual", start: 6, days: 5, status: "Approved" },
    { type: "Caregiver", start: 12, days: 2, status: "Pending" },
    { type: "Annual", start: 19, days: 5, status: "Pending" },
    { type: "Personal", start: 27, days: 1, status: "Pending" },
    { type: "Parental", start: 36, days: 15, status: "Approved" },
    { type: "Annual", start: 48, days: 4, status: "Pending" },
    { type: "Unpaid", start: 58, days: 3, status: "Pending" },
    { type: "Annual", start: 72, days: 5, status: "Pending" },
    { type: "Personal", start: -45, days: 2, status: "Rejected" },
    { type: "Annual", start: -25, days: 7, status: "Rejected" },
  ] as const

  leaveExamples.forEach((example, index) => {
    const employee = employees[index % employees.length]
    const id = `LEV-SOFTWARE-${String(index + 1).padStart(3, "0")}`
    const startDate = dateFromToday(example.start)
    const endDate = dateFromToday(example.start + example.days - 1)
    const details = JSON.stringify({ leaveType: example.type, startDate, endDate, days: example.days, note: "Team coverage confirmed in the delivery plan.", origin: "software_company_workspace" })
    const pending = example.status === "Pending"
    statements.push(
      database.prepare("INSERT OR IGNORE INTO leave_records(id, employee_id, leave_type, start_date, end_date, leave_days, approval_status, department, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'workflow', CURRENT_TIMESTAMP)")
        .bind(id, employee.employee_id, example.type, startDate, endDate, example.days, example.status, employee.department),
      database.prepare("INSERT OR IGNORE INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, resolved_by_email, resolved_at, created_at, updated_at) VALUES (?, 'leave', ?, ?, ?, ?, 'people-ops@laidbackhr.cloud', ?, ?, ?, CURRENT_TIMESTAMP)")
        .bind(id, employee.employee_id, `${example.type} leave request`, example.status, details, pending ? null : "people-ops@laidbackhr.cloud", pending ? null : dateFromToday(example.start - 3), dateFromToday(example.start - 12)),
      database.prepare("INSERT OR IGNORE INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, ?, ?, ?, 'people-ops@laidbackhr.cloud', ?)")
        .bind(`ACT-${id}`, employee.employee_id, pending ? "leave_requested" : "leave_decision", pending ? `Submitted a ${example.type.toLowerCase()} leave request` : `${example.status} ${example.type.toLowerCase()} leave`, details, dateFromToday(pending ? example.start - 12 : example.start - 3)),
    )
  })

  const trainingExamples = [
    { program: "Secure Coding Fundamentals", due: -140, hours: 3, status: "Completed", completed: -144, score: 94 },
    { program: "Data Privacy for Engineers", due: -112, hours: 2, status: "Completed", completed: -114, score: 91 },
    { program: "Incident Response Tabletop", due: -84, hours: 4, status: "Completed", completed: -85, score: 88 },
    { program: "Cloud Security Essentials", due: -61, hours: 3, status: "Completed", completed: -64, score: 93 },
    { program: "Accessibility for Product Teams", due: -43, hours: 2, status: "Completed", completed: -44, score: 90 },
    { program: "Engineering Manager Essentials", due: -31, hours: 6, status: "Completed", completed: -35, score: 86 },
    { program: "Kubernetes Reliability", due: -22, hours: 5, status: "Completed", completed: -24, score: 89 },
    { program: "SOC 2 Control Ownership", due: -12, hours: 2, status: "Completed", completed: -14, score: 96 },
    { program: "Responsible AI and Data Handling", due: -7, hours: 2, status: "Incomplete", completed: null, score: null },
    { program: "Secure Coding Fundamentals", due: -3, hours: 3, status: "Incomplete", completed: null, score: null },
    { program: "Cloud Security Essentials", due: 2, hours: 3, status: "Incomplete", completed: null, score: null },
    { program: "Incident Response Tabletop", due: 5, hours: 4, status: "Incomplete", completed: null, score: null },
    { program: "Data Privacy for Engineers", due: 8, hours: 2, status: "Incomplete", completed: null, score: null },
    { program: "Accessibility for Product Teams", due: 12, hours: 2, status: "Incomplete", completed: null, score: null },
    { program: "Technical Interviewing", due: 16, hours: 3, status: "Incomplete", completed: null, score: null },
    { program: "Engineering Manager Essentials", due: 21, hours: 6, status: "Incomplete", completed: null, score: null },
    { program: "Kubernetes Reliability", due: 26, hours: 5, status: "Incomplete", completed: null, score: null },
    { program: "Product Analytics Foundations", due: 31, hours: 4, status: "Incomplete", completed: null, score: null },
    { program: "SOC 2 Control Ownership", due: 37, hours: 2, status: "Incomplete", completed: null, score: null },
    { program: "Responsible AI and Data Handling", due: 42, hours: 2, status: "Incomplete", completed: null, score: null },
  ] as const

  trainingExamples.forEach((example, index) => {
    const employee = employees[(index + 18) % employees.length]
    const id = `TRN-SOFTWARE-${String(index + 1).padStart(3, "0")}`
    const dueDate = dateFromToday(example.due)
    const completionDate = example.completed === null ? null : dateFromToday(example.completed)
    const completed = example.status === "Completed"
    const details = JSON.stringify({ program: example.program, dueDate, hours: example.hours, note: "Complete through the company learning portal.", origin: "software_company_workspace" })
    statements.push(
      database.prepare("INSERT OR IGNORE INTO training_records(id, training_program, employee_id, completion_status, completion_date, training_hours, assessment_score, department, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'workflow', CURRENT_TIMESTAMP)")
        .bind(id, example.program, employee.employee_id, example.status, completionDate, example.hours, example.score, employee.department),
      database.prepare("INSERT OR IGNORE INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, resolved_by_email, resolved_at, created_at, updated_at) VALUES (?, 'training', ?, ?, ?, ?, 'learning@laidbackhr.cloud', ?, ?, ?, CURRENT_TIMESTAMP)")
        .bind(id, employee.employee_id, `${example.program} assignment`, completed ? "Completed" : "Assigned", details, completed ? "learning@laidbackhr.cloud" : null, completionDate, dateFromToday(example.due - 21)),
      database.prepare("INSERT OR IGNORE INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, ?, ?, ?, 'learning@laidbackhr.cloud', ?)")
        .bind(`ACT-${id}`, employee.employee_id, completed ? "training_completed" : "training_assigned", completed ? `Completed ${example.program}` : `Assigned ${example.program}`, details, completionDate ?? dateFromToday(example.due - 21)),
    )
  })

  const hiringExamples = [
    { position: "Senior Backend Engineer", department: "Research & Development", location: "Austin", source: "Employee referral", opened: -72, status: "Hired", days: 41 },
    { position: "Product Designer", department: "Research & Development", location: "Remote", source: "LinkedIn", opened: -63, status: "Hired", days: 36 },
    { position: "Site Reliability Engineer", department: "Research & Development", location: "San Francisco", source: "Employee referral", opened: -57, status: "Hired", days: 44 },
    { position: "Customer Success Engineer", department: "Sales", location: "New York", source: "Careers site", opened: -49, status: "Hired", days: 32 },
    { position: "Technical Recruiter", department: "Human Resources", location: "Remote", source: "LinkedIn", opened: -44, status: "Hired", days: 29 },
    { position: "Staff Frontend Engineer", department: "Research & Development", location: "Austin", source: "Manager request", opened: -28, status: "Open", days: null },
    { position: "Security Engineer", department: "Research & Development", location: "Remote", source: "Manager request", opened: -24, status: "Open", days: null },
    { position: "QA Automation Engineer", department: "Research & Development", location: "London", source: "Manager request", opened: -19, status: "Open", days: null },
    { position: "Technical Product Manager", department: "Research & Development", location: "New York", source: "Manager request", opened: -17, status: "Open", days: null },
    { position: "Solutions Architect", department: "Sales", location: "Singapore", source: "Manager request", opened: -14, status: "Open", days: null },
    { position: "Data Platform Engineer", department: "Research & Development", location: "Remote", source: "Agency", opened: -21, status: "Offer", days: null },
    { position: "Developer Experience Engineer", department: "Research & Development", location: "Austin", source: "Employee referral", opened: -18, status: "Offer", days: null },
    { position: "Enterprise Account Executive", department: "Sales", location: "San Francisco", source: "LinkedIn", opened: -16, status: "Offer", days: null },
    { position: "Engineering Manager", department: "Research & Development", location: "London", source: "Manager request", opened: -8, status: "Requested", days: null },
    { position: "Mobile Engineer", department: "Research & Development", location: "Remote", source: "Manager request", opened: -6, status: "Requested", days: null },
    { position: "Product Data Analyst", department: "Research & Development", location: "Austin", source: "Manager request", opened: -5, status: "Requested", days: null },
    { position: "Customer Success Manager", department: "Sales", location: "New York", source: "Manager request", opened: -3, status: "Requested", days: null },
    { position: "People Operations Partner", department: "Human Resources", location: "Remote", source: "Manager request", opened: -2, status: "Requested", days: null },
  ] as const

  hiringExamples.forEach((example, index) => {
    const id = `HIR-SOFTWARE-${String(index + 1).padStart(3, "0")}`
    const applicationDate = dateFromToday(example.opened)
    const hired = example.status === "Hired"
    const hiringDate = hired && example.days !== null ? dateFromToday(example.opened + example.days) : null
    const details = JSON.stringify({ employmentType: "Full-time", justification: `Approved headcount plan for ${example.position}.`, origin: "software_company_workspace" })
    const resolved = !["Requested", "Offer"].includes(example.status)
    statements.push(
      database.prepare("INSERT OR IGNORE INTO hiring_records(id, position, department, application_date, hiring_date, hiring_source, time_to_hire_days, recruitment_status, location, data_source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'workflow', CURRENT_TIMESTAMP)")
        .bind(id, example.position, example.department, applicationDate, hiringDate, example.source, example.days, example.status, example.location),
      database.prepare("INSERT OR IGNORE INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, resolved_by_email, resolved_at, created_at, updated_at) VALUES (?, 'hiring', NULL, ?, ?, ?, 'talent@laidbackhr.cloud', ?, ?, ?, CURRENT_TIMESTAMP)")
        .bind(id, `New ${example.position} requisition`, example.status, details, resolved ? "talent@laidbackhr.cloud" : null, resolved ? dateFromToday(example.opened + 2) : null, applicationDate),
    )
  })

  for (let index = 0; index < statements.length; index += 80) {
    await database.batch(statements.slice(index, index + 80))
  }
  await database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES (?, 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP")
    .bind(settingKey).run()
}

async function refreshCurrentLeaveExamples(database: Database): Promise<void> {
  const today = dateFromToday(0)
  const settingKey = "software_company_leave_calendar_date"
  const refreshed = await database.prepare("SELECT value FROM workspace_settings WHERE key = ?")
    .bind(settingKey).first<{ value: string }>()
  if (refreshed?.value === today) return

  const examples = [
    { id: "LEV-SOFTWARE-007", start: -1, days: 4 },
    { id: "LEV-SOFTWARE-008", start: 0, days: 1 },
  ] as const
  for (const example of examples) {
    const startDate = dateFromToday(example.start)
    const endDate = dateFromToday(example.start + example.days - 1)
    await database.prepare("UPDATE leave_records SET start_date=?, end_date=?, leave_days=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND data_source='workflow' AND approval_status='Approved'")
      .bind(startDate, endDate, example.days, example.id).run()
    await database.prepare("UPDATE workflow_requests SET details_json=json_set(details_json, '$.startDate', ?, '$.endDate', ?, '$.days', ?), updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS (SELECT 1 FROM leave_records l WHERE l.id=? AND l.approval_status='Approved')")
      .bind(startDate, endDate, example.days, example.id, example.id).run()
  }
  await database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP")
    .bind(settingKey, today).run()
}

async function seedHiringCandidatePipelineOnce(database: Database): Promise<void> {
  const settingKey = "hiring_candidate_pipeline_seed_v1"
  const initialized = await database.prepare("SELECT value FROM workspace_settings WHERE key=?").bind(settingKey).first<{ value: string }>()
  if (initialized) return
  const candidates = [
    { id: "CAN-SOFTWARE-001", requisition: "HIR-SOFTWARE-001", name: "Maya Patel", email: "maya.patel@example.com", stage: "Hired", source: "Employee referral", applied: -68, owner: "talent@laidbackhr.cloud", step: "Onboarding handoff completed", due: null, notes: "Accepted offer after platform engineering panel." },
    { id: "CAN-SOFTWARE-002", requisition: "HIR-SOFTWARE-002", name: "Ethan Brooks", email: "ethan.brooks@example.com", stage: "Hired", source: "LinkedIn", applied: -59, owner: "talent@laidbackhr.cloud", step: "Onboarding handoff completed", due: null, notes: "Portfolio and product collaboration interviews completed." },
    { id: "CAN-SOFTWARE-003", requisition: "HIR-SOFTWARE-006", name: "Sophia Turner", email: "sophia.turner@example.com", stage: "Interview", source: "Employee referral", applied: -16, owner: "talent@laidbackhr.cloud", step: "Record system-design panel outcome", due: 1, notes: "Frontend platform experience aligns with the role." },
    { id: "CAN-SOFTWARE-004", requisition: "HIR-SOFTWARE-006", name: "Daniel Kim", email: "daniel.kim@example.com", stage: "Screening", source: "LinkedIn", applied: -9, owner: "talent@laidbackhr.cloud", step: "Complete recruiter screen", due: 2, notes: null },
    { id: "CAN-SOFTWARE-005", requisition: "HIR-SOFTWARE-006", name: "Amara Okafor", email: "amara.okafor@example.com", stage: "Applied", source: "Careers site", applied: -3, owner: "talent@laidbackhr.cloud", step: "Review application", due: 1, notes: null },
    { id: "CAN-SOFTWARE-006", requisition: "HIR-SOFTWARE-007", name: "Lucas Martin", email: "lucas.martin@example.com", stage: "Interview", source: "Agency", applied: -14, owner: "talent@laidbackhr.cloud", step: "Schedule security architecture interview", due: -1, notes: "Cloud security background confirmed in recruiter screen." },
    { id: "CAN-SOFTWARE-007", requisition: "HIR-SOFTWARE-007", name: "Priya Shah", email: "priya.shah@example.com", stage: "Screening", source: "Employee referral", applied: -6, owner: "talent@laidbackhr.cloud", step: "Complete hiring-manager screen", due: 2, notes: null },
    { id: "CAN-SOFTWARE-008", requisition: "HIR-SOFTWARE-008", name: "Noah Wilson", email: "noah.wilson@example.com", stage: "Interview", source: "Careers site", applied: -12, owner: "talent@laidbackhr.cloud", step: "Record automation exercise outcome", due: 1, notes: null },
    { id: "CAN-SOFTWARE-009", requisition: "HIR-SOFTWARE-009", name: "Elena Rossi", email: "elena.rossi@example.com", stage: "Applied", source: "LinkedIn", applied: -4, owner: "talent@laidbackhr.cloud", step: "Review application", due: -1, notes: "Product analytics and platform delivery experience." },
    { id: "CAN-SOFTWARE-010", requisition: "HIR-SOFTWARE-010", name: "Marcus Chen", email: "marcus.chen@example.com", stage: "Screening", source: "Employee referral", applied: -7, owner: "talent@laidbackhr.cloud", step: "Complete technical discovery screen", due: 3, notes: null },
    { id: "CAN-SOFTWARE-011", requisition: "HIR-SOFTWARE-011", name: "Lily Nguyen", email: "lily.nguyen@example.com", stage: "Offer", source: "Agency", applied: -17, owner: "talent@laidbackhr.cloud", step: "Record offer response", due: 2, notes: "Offer issued after final data-platform panel." },
    { id: "CAN-SOFTWARE-012", requisition: "HIR-SOFTWARE-012", name: "Ava Thompson", email: "ava.thompson@example.com", stage: "Offer", source: "Employee referral", applied: -15, owner: "talent@laidbackhr.cloud", step: "Confirm proposed start date", due: 1, notes: null },
    { id: "CAN-SOFTWARE-013", requisition: "HIR-SOFTWARE-013", name: "Oliver Grant", email: "oliver.grant@example.com", stage: "Offer", source: "LinkedIn", applied: -13, owner: "talent@laidbackhr.cloud", step: "Record offer response", due: -1, notes: "Compensation approval is complete." },
    { id: "CAN-SOFTWARE-014", requisition: "HIR-SOFTWARE-010", name: "Zara Ali", email: "zara.ali@example.com", stage: "Rejected", source: "Careers site", applied: -10, owner: "talent@laidbackhr.cloud", step: "No further action", due: null, notes: "Role scope did not match candidate preference." },
  ] as const
  const statements = candidates.map((candidate) => database.prepare("INSERT OR IGNORE INTO hiring_candidates(id, requisition_id, full_name, email, stage, source, applied_at, owner_email, next_step, next_step_due_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
    .bind(candidate.id, candidate.requisition, candidate.name, candidate.email, candidate.stage, candidate.source, dateFromToday(candidate.applied), candidate.owner, candidate.step, candidate.due === null ? null : dateFromToday(candidate.due), candidate.notes, dateFromToday(candidate.applied)))
  for (let index = 0; index < statements.length; index += 80) await database.batch(statements.slice(index, index + 80))
  await database.prepare("INSERT INTO workspace_settings(key, value, updated_at) VALUES (?, 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP")
    .bind(settingKey).run()
}

export async function ensureHrDatabase(): Promise<Database | null> {
  const database = await configuredDatabase()
  if (!database) return null
  if (readyDatabase === database && setupPromise) {
    await setupPromise
    return database
  }
  readyDatabase = database
  setupPromise = (async () => {
    const postgres = database.dialect === "postgres"
    if (!postgres) {
      for (const statement of createStatements) await database.prepare(statement).run()
      await ensureEmployeeProfileColumns(database)
      await ensureWorkflowAccountabilityColumns(database)
      await ensureDataImportColumns(database)
      await ensureAssessmentFeatureColumns(database)
      await applyNormalizedHrSchema(database)
      await ensureModelVersionColumns(database)
    }
    await seedDemoOnce(database)
    await seedCorrelatedDemoOnce(database)
    await syncModelRuntime(database)
    await backfillDemoProfiles(database)
    await seedLeaveWorkflowExamplesOnce(database)
    await seedTrainingWorkflowExamplesOnce(database)
    await seedSoftwareCompanyWorkflowsOnce(database)
    await refreshCurrentLeaveExamples(database)
    await seedHiringCandidatePipelineOnce(database)
    if (postgres) await syncPostgresLearningCatalog(database)
    else await backfillWorkflowAccountabilityOnce(database)
    await syncOpenOperationalWork(database)
    if (!postgres) await refreshNormalizedReportingLines(database)
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

const primaryKeyByDomain: Record<HrDomain, string> = {
  employees: "employee_id",
  hiring: "id",
  attrition: "id",
  leave: "id",
  training: "id",
  promotions: "id",
}

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
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function canonicalEnum(domain: HrDomain, field: string, value: string): string | null {
  const allowed = enumValues[domain]?.[field]
  if (!allowed) return value
  return allowed.find((item) => item.toLowerCase() === value.toLowerCase()) ?? null
}

function addIssue(issues: ImportIssue[], issue: ImportIssue): void {
  if (issues.length < 100) issues.push(issue)
}

async function selectExistingValues(database: Database, table: string, column: string, values: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  for (let index = 0; index < values.length; index += 80) {
    const chunk = values.slice(index, index + 80)
    if (!chunk.length) continue
    const result = await database.prepare(`SELECT ${column} AS value FROM ${table} WHERE ${column} IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk).all<{ value: string }>()
    for (const row of result.results ?? []) found.add(String(row.value))
  }
  return found
}

async function selectExistingSources(database: Database, domain: HrDomain, values: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  const column = primaryKeyByDomain[domain]
  for (let index = 0; index < values.length; index += 80) {
    const chunk = values.slice(index, index + 80)
    if (!chunk.length) continue
    const result = await database.prepare(`SELECT ${column} AS value, data_source AS dataSource FROM ${tableByDomain[domain]} WHERE ${column} IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk).all<{ value: string; dataSource: string }>()
    for (const row of result.results ?? []) found.set(String(row.value), String(row.dataSource))
  }
  return found
}

type ValidatedImport = { preview: ImportPreview; rows: Array<Record<string, string | number | null>> }

async function validateImportRows({ database, domain, rows, filename, mode }: {
  database: Database
  domain: HrDomain
  rows: unknown[]
  filename: string
  mode: ImportMode
}): Promise<ValidatedImport> {
  const issues: ImportIssue[] = []
  const invalidRows = new Set<number>()
  const normalizedSource = rows.map((source, index) => {
    try {
      return normalizeRow(source)
    } catch (error) {
      invalidRows.add(index)
      addIssue(issues, { severity: "error", code: "invalid_row", message: error instanceof Error ? error.message : "Invalid row.", row: index + 2 })
      return {}
    }
  })
  const availableColumns = new Set(Object.keys(normalizedSource[0] ?? {}))
  for (const field of importFields[domain]) {
    if (!availableColumns.has(field)) {
      normalizedSource.forEach((_, index) => invalidRows.add(index))
      addIssue(issues, { severity: "error", code: "missing_column", field, message: `Required column “${field}” is missing.` })
    }
  }

  const clean = normalizedSource.map((row, index) => {
    const result: Record<string, string | number | null> = {}
    for (const field of importFields[domain]) {
      const value = row[field]
      if ((value === undefined || value === null || value === "") && nullableFields.has(field)) {
        result[field] = null
        continue
      }
      if (value === undefined || value === null || value === "") {
        invalidRows.add(index)
        addIssue(issues, { severity: "error", code: "required_value", field, row: index + 2, message: `${field} is required.` })
        continue
      }
      if (numberFields.has(field)) {
        const numeric = typeof value === "number" ? value : Number(value)
        if (!Number.isFinite(numeric) || numeric < 0) {
          invalidRows.add(index)
          addIssue(issues, { severity: "error", code: "invalid_number", field, row: index + 2, message: `${field} must be a non-negative number.` })
        } else result[field] = numeric
        continue
      }
      const text = String(value).trim()
      if (dateFields.has(field) && !isIsoDate(text)) {
        invalidRows.add(index)
        addIssue(issues, { severity: "error", code: "invalid_date", field, row: index + 2, message: `${field} must be a valid YYYY-MM-DD date.` })
        continue
      }
      const canonical = canonicalEnum(domain, field, text)
      if (canonical === null) {
        invalidRows.add(index)
        addIssue(issues, { severity: "error", code: "invalid_value", field, row: index + 2, message: `${field} has an unsupported value.` })
      } else result[field] = canonical
    }
    if (result.work_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(result.work_email))) {
      invalidRows.add(index)
      addIssue(issues, { severity: "error", code: "invalid_email", field: "work_email", row: index + 2, message: "work_email is not a valid email address." })
    }
    const datePairs: Array<[string, string]> = domain === "hiring" ? [["application_date", "hiring_date"]] : domain === "leave" ? [["start_date", "end_date"]] : []
    for (const [start, end] of datePairs) {
      if (result[start] && result[end] && String(result[end]) < String(result[start])) {
        invalidRows.add(index)
        addIssue(issues, { severity: "error", code: "date_order", field: end, row: index + 2, message: `${end} cannot be before ${start}.` })
      }
    }
    result.data_source = "imported"
    return result
  })

  const primaryKey = primaryKeyByDomain[domain]
  const seenKeys = new Map<string, number>()
  for (const [index, row] of clean.entries()) {
    const key = String(row[primaryKey] ?? "")
    if (!key) continue
    const previous = seenKeys.get(key)
    if (previous !== undefined) {
      invalidRows.add(index)
      invalidRows.add(previous)
      addIssue(issues, { severity: "error", code: "duplicate_id", field: primaryKey, row: index + 2, message: `${primaryKey} duplicates row ${previous + 2}.` })
    } else seenKeys.set(key, index)
  }

  const allKeys = [...seenKeys.keys()]
  if (domain !== "employees") {
    const employeeIds = [...new Set(clean.map((row) => String(row.employee_id ?? "")).filter(Boolean))]
    const existingEmployees = await selectExistingValues(database, "employees", "employee_id", employeeIds)
    for (const [index, row] of clean.entries()) {
      const employeeId = String(row.employee_id ?? "")
      if (employeeId && !existingEmployees.has(employeeId)) {
        invalidRows.add(index)
        addIssue(issues, { severity: "error", code: "unknown_employee", field: "employee_id", row: index + 2, message: `Employee ${employeeId} is not in the employee directory.` })
      }
    }
  } else {
    const managerIds = [...new Set(clean.map((row) => String(row.manager_id ?? "")).filter(Boolean))]
    const existingManagers = await selectExistingValues(database, "employees", "employee_id", managerIds)
    const fileEmployees = new Set(allKeys)
    for (const [index, row] of clean.entries()) {
      const managerId = String(row.manager_id ?? "")
      if (managerId && !existingManagers.has(managerId) && !fileEmployees.has(managerId)) {
        addIssue(issues, { severity: "warning", code: "unknown_manager", field: "manager_id", row: index + 2, message: `Manager ${managerId} is not in this file or the employee directory.` })
      }
    }
  }

  const replaced = mode === "replace_imported"
    ? await database.prepare(`SELECT COUNT(*) AS count FROM ${tableByDomain[domain]} WHERE data_source = 'imported'`).first<{ count: number }>()
    : null
  const validKeys = allKeys.filter((key) => {
    const rowIndex = seenKeys.get(key)
    return rowIndex !== undefined && !invalidRows.has(rowIndex)
  })
  const existingSources = await selectExistingSources(database, domain, validKeys)
  const updateKeys = mode === "replace_imported"
    ? validKeys.filter((key) => existingSources.has(key) && existingSources.get(key) !== "imported")
    : validKeys.filter((key) => existingSources.has(key))
  const errorCount = issues.filter((issue) => issue.severity === "error").length
  return {
    rows: clean.filter((_, index) => !invalidRows.has(index)),
    preview: {
      domain,
      filename: filename.slice(0, 240) || `${domain}.csv`,
      mode,
      totalRows: rows.length,
      validRows: rows.length - invalidRows.size,
      invalidRows: invalidRows.size,
      inserts: validKeys.length - updateKeys.length,
      updates: updateKeys.length,
      replacedRows: Number(replaced?.count ?? 0),
      canApply: errorCount === 0 && invalidRows.size === 0,
      issues,
    },
  }
}

export async function validateHrImport({ domain, rows, filename, mode = "merge" }: {
  domain: HrDomain
  rows: unknown[]
  filename: string
  mode?: ImportMode
}): Promise<ImportPreview> {
  if (!hrDomains.includes(domain)) throw new Error("Unsupported HR data domain.")
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 5000) throw new Error("Import must contain between 1 and 5,000 rows.")
  if (mode !== "merge" && mode !== "replace_imported") throw new Error("Unsupported import mode.")
  const database = await ensureHrDatabase()
  if (!database) throw new Error("Persistent HR database is unavailable.")
  return (await validateImportRows({ database, domain, rows, filename, mode })).preview
}

function stagedImportSql(domain: HrDomain): string {
  const fields = importFields[domain]
  const table = tableByDomain[domain]
  const primaryKey = primaryKeyByDomain[domain]
  const select = fields.map((field) => `json_extract(payload_json, '$.${field}')`).join(", ")
  const updates = fields.filter((field) => field !== primaryKey).map((field) => `${field}=excluded.${field}`)
  updates.push("data_source=excluded.data_source")
  if (domain === "employees") updates.push("archived_at=NULL", `version=${table}.version+1`, "updated_at=CURRENT_TIMESTAMP")
  else updates.push("updated_at=CURRENT_TIMESTAMP")
  return `INSERT INTO ${table}(${fields.join(", ")}, data_source) SELECT ${select}, 'imported' FROM data_import_rows WHERE job_id = ? AND true ON CONFLICT(${primaryKey}) DO UPDATE SET ${updates.join(",")}`
}

export async function importHrData({ domain, rows, filename, mode = "merge", actorEmail }: {
  domain: HrDomain
  rows: unknown[]
  filename: string
  mode?: ImportMode
  actorEmail?: string
}): Promise<{ domain: HrDomain; imported: number; filename: string; jobId: string; preview: ImportPreview }> {
  if (!hrDomains.includes(domain)) throw new Error("Unsupported HR data domain.")
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 5000) throw new Error("Import must contain between 1 and 5,000 rows.")
  if (mode !== "merge" && mode !== "replace_imported") throw new Error("Unsupported import mode.")
  const database = await ensureHrDatabase()
  if (!database) throw new Error("Persistent HR database is unavailable.")
  const validation = await validateImportRows({ database, domain, rows, filename, mode })
  if (!validation.preview.canApply) throw Object.assign(new Error("Import validation failed."), { preview: validation.preview })

  const jobId = crypto.randomUUID()
  const safeFilename = filename.slice(0, 240) || `${domain}.csv`
  await database.prepare("INSERT INTO data_imports(id, domain, filename, mode, total_rows, row_count, inserted_rows, updated_rows, deleted_rows, error_count, imported_by_email, status, imported_at) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, 'processing', CURRENT_TIMESTAMP)")
    .bind(jobId, domain, safeFilename, mode, validation.preview.totalRows, actorEmail ?? null).run()
  try {
    const primaryKey = primaryKeyByDomain[domain]
    const stageStatements = validation.rows.map((row) => database.prepare("INSERT INTO data_import_rows(job_id, row_key, payload_json) VALUES (?, ?, ?)")
      .bind(jobId, String(row[primaryKey]), JSON.stringify(row)))
    for (let index = 0; index < stageStatements.length; index += 80) await database.batch(stageStatements.slice(index, index + 80))
    const finalStatements: Statement[] = []
    if (mode === "replace_imported") finalStatements.push(database.prepare(`DELETE FROM ${tableByDomain[domain]} WHERE data_source = 'imported'`))
    finalStatements.push(database.prepare(stagedImportSql(domain)).bind(jobId))
    if (domain === "employees") {
      finalStatements.push(...normalizedHrReconciliationStatements.map((statement) => database.prepare(statement)))
      finalStatements.push(database.prepare(`
        UPDATE employment_assignments
        SET manager_employee_id = (
          SELECT e.manager_id FROM employees e
          WHERE e.employee_id = employment_assignments.employee_id
            AND EXISTS (SELECT 1 FROM employees m WHERE m.employee_id = e.manager_id)
        ), updated_at = CURRENT_TIMESTAMP
        WHERE is_primary = 1
      `))
    }
    finalStatements.push(
      ...operationalWorkStatements(database),
      database.prepare("UPDATE data_imports SET row_count=?, inserted_rows=?, updated_rows=?, deleted_rows=?, status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(validation.preview.validRows, validation.preview.inserts, validation.preview.updates, validation.preview.replacedRows, jobId),
      database.prepare("DELETE FROM data_import_rows WHERE job_id=?").bind(jobId),
    )
    await database.batch(finalStatements)
    return { domain, imported: validation.preview.validRows, filename: safeFilename, jobId, preview: validation.preview }
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 1000) : "Import failed."
    await database.batch([
      database.prepare("DELETE FROM data_import_rows WHERE job_id=?").bind(jobId),
      database.prepare("UPDATE data_imports SET status='failed', error_count=1, error_summary=?, completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(detail, jobId),
    ])
    throw error
  }
}

export async function getDataImportJobs(limit = 20): Promise<ImportJob[]> {
  const database = await ensureHrDatabase()
  if (!database) return []
  const result = await database.prepare("SELECT id, domain, filename, mode, status, total_rows AS totalRows, row_count AS rowCount, inserted_rows AS insertedRows, updated_rows AS updatedRows, deleted_rows AS deletedRows, error_count AS errorCount, error_summary AS errorSummary, imported_by_email AS importedByEmail, imported_at AS startedAt, COALESCE(completed_at, CASE WHEN status='completed' THEN imported_at END) AS completedAt FROM data_imports ORDER BY imported_at DESC LIMIT ?")
    .bind(Math.min(Math.max(limit, 1), 100)).all<ImportJob>()
  return result.results ?? []
}

export async function getDataImportSummary(): Promise<{ completedImports: number; failedImports: number; lastCompletedAt: string | null }> {
  const database = await ensureHrDatabase()
  if (!database) return { completedImports: 0, failedImports: 0, lastCompletedAt: null }
  const result = await database.prepare("SELECT SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completedImports, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failedImports, MAX(CASE WHEN status='completed' THEN COALESCE(completed_at, imported_at) END) AS lastCompletedAt FROM data_imports")
    .first<{ completedImports: number | null; failedImports: number | null; lastCompletedAt: string | null }>()
  return {
    completedImports: Number(result?.completedImports ?? 0),
    failedImports: Number(result?.failedImports ?? 0),
    lastCompletedAt: result?.lastCompletedAt ?? null,
  }
}

export async function readDomainRows(domain: HrDomain): Promise<Array<Record<string, unknown>>> {
  const database = await ensureHrDatabase()
  if (!database) return generateDemoDataset()[domain]
  if (domain === "training") {
    const result = await database.prepare("SELECT t.*, COALESCE(t.due_date, json_extract(w.details_json, '$.dueDate')) AS due_date, w.requested_by_email, COALESCE(t.assigned_at, w.created_at) AS assigned_at FROM learning_assignments_view t LEFT JOIN workflow_requests w ON w.id=t.id AND w.type='training' ORDER BY t.updated_at DESC LIMIT 10000").all<Record<string, unknown>>()
    return result.results ?? []
  }
  const result = await database.prepare(`SELECT * FROM ${readViewByDomain[domain]} ORDER BY updated_at DESC LIMIT 10000`).all<Record<string, unknown>>()
  return result.results ?? []
}

export async function readAttritionModelProfiles(): Promise<Array<Record<string, unknown>>> {
  const database = await ensureHrDatabase()
  if (!database) return generateDemoModelProfiles()
  const result = await database.prepare("SELECT * FROM attrition_model_profiles_view ORDER BY risk_score DESC LIMIT 10000").all<Record<string, unknown>>()
  return result.results ?? []
}
