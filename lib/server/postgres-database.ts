import { Pool, types, type PoolClient, type QueryResultRow } from "pg"

import postgresSchema from "@/db/postgres/0001_runtime.sql?raw"
import learningAssignmentDatesMigration from "@/db/postgres/0002_learning_assignment_dates.sql?raw"
import employeeExperienceMigration from "@/db/postgres/0003_employee_experience.sql?raw"
import correlatedEmployeeExperienceMigration from "@/db/postgres/0004_correlated_employee_experience.sql?raw"
import operatingModelMigration from "@/db/postgres/0005_operating_model.sql?raw"
import onboardingAndCapabilityMigration from "@/db/postgres/0006_onboarding_and_capability.sql?raw"
import employeeServiceOutcomesMigration from "@/db/postgres/0007_employee_service_outcomes.sql?raw"
import aiWorkflowHandoffsMigration from "@/db/postgres/0008_ai_workflow_handoffs.sql?raw"
import integrationApiMigration from "@/db/postgres/0009_integration_api.sql?raw"
import adminProviderSnapshotsMigration from "@/db/postgres/0010_admin_provider_snapshots.sql?raw"
import type { Database, Statement } from "@/lib/server/hr-repository"
import { invalidateAnalyticsReads, sqlAffectsAnalytics } from "@/lib/server/analytics-cache"
import { runtimeEnv } from "@/lib/server/runtime-env"

types.setTypeParser(20, (value) => Number(value))
types.setTypeParser(1700, (value) => Number(value))

type Executor = Pick<Pool, "query"> | Pick<PoolClient, "query">

function placeholders(sql: string): string {
  let position = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let translated = ""
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]
    const next = sql[index + 1]
    if (character === "'" && !inDoubleQuote) {
      translated += character
      if (inSingleQuote && next === "'") {
        translated += next
        index += 1
      } else {
        inSingleQuote = !inSingleQuote
      }
      continue
    }
    if (character === '"' && !inSingleQuote) {
      translated += character
      if (inDoubleQuote && next === '"') {
        translated += next
        index += 1
      } else {
        inDoubleQuote = !inDoubleQuote
      }
      continue
    }
    translated += character === "?" && !inSingleQuote && !inDoubleQuote ? `$${++position}` : character
  }
  return translated
}

/** Translate the repository's driver-neutral placeholders to PostgreSQL positions. */
function postgresSql(input: string): string {
  const sql = placeholders(input.trim().replace(/;\s*$/, ""))
  return sql || "SELECT 1"
}

class PostgresStatement {
  private values: unknown[] = []

  constructor(private readonly pool: Pool, readonly sourceSql: string) {}

  bind(...values: unknown[]): PostgresStatement {
    this.values = values
    return this
  }

  async execute(executor: Executor = this.pool) {
    return executor.query(postgresSql(this.sourceSql), this.values)
  }

  async run(): Promise<{ success: boolean }> {
    await this.execute()
    if (sqlAffectsAnalytics(this.sourceSql)) invalidateAnalyticsReads()
    return { success: true }
  }

  async all<T>(): Promise<{ results: T[] }> {
    const result = await this.execute()
    return { results: result.rows as T[] }
  }

  async first<T>(): Promise<T | null> {
    const result = await this.execute()
    return (result.rows[0] as T | undefined) ?? null
  }
}

class PostgresDatabase implements Database {
  readonly dialect = "postgres" as const

  constructor(private readonly pool: Pool) {}

  prepare(sql: string): PostgresStatement {
    return new PostgresStatement(this.pool, sql)
  }

  async batch(statements: Statement[]): Promise<unknown> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      const results = []
      for (const statement of statements) results.push(await (statement as PostgresStatement).execute(client))
      await client.query("COMMIT")
      if (statements.some((statement) => sqlAffectsAnalytics((statement as PostgresStatement).sourceSql))) invalidateAnalyticsReads()
      return results
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }
}

let databasePromise: Promise<Database> | null = null

async function initialize(pool: Pool): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('laidbackhr-schema'))")
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    const migrations = [
      { id: "0001_runtime", sql: postgresSchema },
      { id: "0002_learning_assignment_dates", sql: learningAssignmentDatesMigration },
      { id: "0003_employee_experience", sql: employeeExperienceMigration },
      { id: "0004_correlated_employee_experience", sql: correlatedEmployeeExperienceMigration },
      { id: "0005_operating_model", sql: operatingModelMigration },
      { id: "0006_onboarding_and_capability", sql: onboardingAndCapabilityMigration },
      { id: "0007_employee_service_outcomes", sql: employeeServiceOutcomesMigration },
      { id: "0008_ai_workflow_handoffs", sql: aiWorkflowHandoffsMigration },
      { id: "0009_integration_api", sql: integrationApiMigration },
      { id: "0010_admin_provider_snapshots", sql: adminProviderSnapshotsMigration },
    ]
    for (const migration of migrations) {
      const applied = await client.query<QueryResultRow>("SELECT id FROM schema_migrations WHERE id=$1", [migration.id])
      if (applied.rowCount) continue
      await client.query("BEGIN")
      for (const statement of migration.sql.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) {
        await client.query(statement)
      }
      await client.query("INSERT INTO schema_migrations(id) VALUES ($1)", [migration.id])
      await client.query("COMMIT")
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('laidbackhr-schema'))").catch(() => undefined)
    client.release()
  }
}

async function connectPostgresDatabase(): Promise<Database> {
  let pool: Pool | null = null
  try {
    const connectionString = runtimeEnv.DATABASE_URL
    if (!connectionString) throw new Error("DATABASE_URL is required for the Azure database runtime.")
    pool = new Pool({
      connectionString,
      max: Number(runtimeEnv.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: true,
      ssl: runtimeEnv.DATABASE_SSL_MODE === "disable" ? false : { rejectUnauthorized: runtimeEnv.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
    })
    await pool.query("SELECT 1")
    await initialize(pool)
    return new PostgresDatabase(pool)
  } catch (error) {
    await pool?.end().catch(() => undefined)
    throw error
  }
}

export async function getPostgresDatabase(): Promise<Database> {
  if (databasePromise) return databasePromise
  databasePromise = connectPostgresDatabase().catch((error) => {
    // A short Azure PostgreSQL or Key Vault interruption must not poison the
    // process for its entire lifetime. The next request receives a fresh pool.
    databasePromise = null
    throw error
  })
  return databasePromise
}
