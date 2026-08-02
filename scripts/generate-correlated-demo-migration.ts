import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { generateCorrelatedDemoData } from "../lib/server/correlated-demo.ts"
import type { Employee as ScoredEmployee } from "../lib/types.ts"

type HrDomain = "employees" | "hiring" | "attrition" | "leave" | "training" | "promotions"

const importFields: Record<HrDomain, string[]> = {
  employees: ["employee_id", "first_name", "last_name", "preferred_name", "work_email", "phone", "department", "job_title", "location", "manager", "manager_id", "hire_date", "employment_type", "employment_status", "tenure_years"],
  hiring: ["id", "position", "department", "application_date", "hiring_date", "hiring_source", "time_to_hire_days", "recruitment_status", "location"],
  attrition: ["id", "employee_id", "exit_date", "exit_reason", "exit_type", "department", "tenure_years"],
  leave: ["id", "employee_id", "leave_type", "start_date", "end_date", "leave_days", "approval_status", "department"],
  training: ["id", "training_program", "employee_id", "completion_status", "completion_date", "training_hours", "assessment_score", "department"],
  promotions: ["id", "employee_id", "previous_title", "new_title", "promotion_date", "department", "months_since_previous_promotion"],
}

const projectRoot = resolve(import.meta.dirname, "..")
const migrationPath = resolve(projectRoot, "drizzle/0005_soft_scourge.sql")
const marker = "-- correlated-demo-seed-v2"

type Row = Record<string, string | number | null>

function valueSql(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cannot write a non-finite number to the migration.")
    return String(value)
  }
  return `'${String(value).replaceAll("'", "''")}'`
}

function insertStatements(table: string, columns: string[], rows: Row[], chunkSize = 40): string[] {
  const statements: string[] = []
  for (let index = 0; index < rows.length; index += chunkSize) {
    const values = rows.slice(index, index + chunkSize).map((row) => `(${columns.map((column) => valueSql(row[column])).join(",")})`)
    statements.push(`INSERT INTO ${table}(${columns.join(",")}) VALUES\n${values.join(",\n")}\nON CONFLICT DO NOTHING;`)
  }
  return statements
}

function validate(data: ReturnType<typeof generateCorrelatedDemoData>) {
  const employees = data.dataset.employees
  const employeeById = new Map(employees.map((employee) => [String(employee.employee_id), employee]))
  if (employeeById.size !== 1470 || employees.length !== 1470) throw new Error(`Expected 1,470 unique employees; found ${employeeById.size}.`)
  if (data.modelProfiles.length !== employees.length) throw new Error("Every synthetic employee must have one model profile.")

  const attritionByEmployee = new Map(data.dataset.attrition.map((row) => [String(row.employee_id), row]))
  const observedExits = data.modelProfiles.filter((profile) => profile.observed_attrition === "Yes")
  if (observedExits.length !== data.dataset.attrition.length) throw new Error("Observed attrition outcomes and exit events do not match.")

  for (const profile of data.modelProfiles) {
    const employee = employeeById.get(profile.employee_id)
    if (!employee) throw new Error(`Model profile ${profile.employee_id} has no employee.`)
    const exit = attritionByEmployee.get(profile.employee_id)
    if ((profile.observed_attrition === "Yes") !== Boolean(exit)) throw new Error(`Exit outcome mismatch for ${profile.employee_id}.`)
    if (profile.observed_attrition === "Yes" && employee.employment_status !== "Terminated") throw new Error(`Exited employee ${profile.employee_id} is not terminated.`)
  }

  for (const employee of employees) {
    if (employee.manager_id) {
      const manager = employeeById.get(String(employee.manager_id))
      if (!manager) throw new Error(`Manager ${employee.manager_id} does not exist for ${employee.employee_id}.`)
      if (manager.department !== employee.department) throw new Error(`Cross-department manager mismatch for ${employee.employee_id}.`)
      if (manager.employee_id === employee.employee_id) throw new Error(`Self-manager relationship for ${employee.employee_id}.`)
    }
  }

  for (const domain of ["attrition", "leave", "training", "promotions"] as const) {
    const ids = new Set<string>()
    for (const row of data.dataset[domain]) {
      if (!employeeById.has(String(row.employee_id))) throw new Error(`${domain} row ${row.id} references a missing employee.`)
      if (ids.has(String(row.id))) throw new Error(`Duplicate ${domain} ID ${row.id}.`)
      ids.add(String(row.id))
    }
  }

  const completedHires = data.dataset.hiring.filter((row) => row.recruitment_status === "Hired")
  if (completedHires.length !== employees.length) throw new Error("Every synthetic employee must have one completed hiring record.")
}

async function main() {
  const runtime = JSON.parse(await readFile(resolve(projectRoot, "lib/server/runtime-data.json"), "utf8")) as {
    employees: ScoredEmployee[]
    metadata: { model_version: string }
  }
  const data = generateCorrelatedDemoData(runtime.employees, runtime.metadata.model_version)
  validate(data)

  const tableByDomain: Record<HrDomain, string> = {
    employees: "employees",
    hiring: "hiring_records",
    attrition: "attrition_events",
    leave: "leave_records",
    training: "training_records",
    promotions: "promotion_records",
  }
  const statements = [
    "DELETE FROM attrition_model_profiles WHERE data_source = 'demo';",
    ...Object.values(tableByDomain).map((table) => `DELETE FROM ${table} WHERE data_source = 'demo';`),
    "DELETE FROM employee_activity WHERE id LIKE 'ACT-LEAVE-WORKFLOW-EXAMPLE-%' OR id LIKE 'ACT-TRN-WORKFLOW-EXAMPLE-%';",
    "DELETE FROM workflow_requests WHERE id LIKE 'LEAVE-WORKFLOW-EXAMPLE-%' OR id LIKE 'TRN-WORKFLOW-EXAMPLE-%';",
    "DELETE FROM leave_records WHERE id LIKE 'LEAVE-WORKFLOW-EXAMPLE-%';",
    "DELETE FROM training_records WHERE id LIKE 'TRN-WORKFLOW-EXAMPLE-%';",
  ]

  for (const domain of Object.keys(tableByDomain) as HrDomain[]) {
    statements.push(...insertStatements(tableByDomain[domain], [...importFields[domain], "data_source"], data.dataset[domain]))
  }

  const profileColumns = [
    "employee_id", "observed_attrition", "risk_score", "risk_level", "top_driver", "monthly_income",
    "distance_from_home", "education_level", "education_field", "environment_satisfaction", "job_satisfaction",
    "prior_companies", "work_life_balance", "years_at_company", "model_version", "data_source",
  ]
  statements.push(...insertStatements("attrition_model_profiles", profileColumns, data.modelProfiles))
  statements.push(
    "INSERT INTO workspace_settings(key, value, updated_at) VALUES ('correlated_demo_seed_v2', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP;",
    "INSERT INTO workspace_settings(key, value, updated_at) VALUES ('leave_workflow_examples_v1', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP;",
    "INSERT INTO workspace_settings(key, value, updated_at) VALUES ('training_workflow_examples_v1', 'true', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value='true', updated_at=CURRENT_TIMESTAMP;",
    "INSERT INTO data_imports(id, domain, filename, row_count, status, imported_at) VALUES ('DEMO-SEED-V2-EMPLOYEES', 'employees', 'correlated-ibm-demo-v2', 1470, 'completed', CURRENT_TIMESTAMP) ON CONFLICT(id) DO NOTHING;",
  )

  const existing = await readFile(migrationPath, "utf8")
  const schemaOnly = existing.includes(marker) ? existing.slice(0, existing.indexOf(marker)).trimEnd() : existing.trimEnd()
  const sql = `${schemaOnly}\n--> statement-breakpoint\n${marker}\n${statements.join("\n--> statement-breakpoint\n")}\n`
  await writeFile(migrationPath, sql)

  const counts = Object.fromEntries(Object.entries(data.dataset).map(([domain, rows]) => [domain, rows.length]))
  console.log(JSON.stringify({ ...counts, modelProfiles: data.modelProfiles.length }, null, 2))
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
