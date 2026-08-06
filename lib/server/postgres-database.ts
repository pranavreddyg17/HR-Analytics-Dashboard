import { Pool, types, type PoolClient, type QueryResultRow } from "pg"

import postgresSchema from "@/db/postgres/0001_runtime.sql?raw"
import type { Database, Statement } from "@/lib/server/hr-database"
import { runtimeEnv } from "@/lib/server/runtime-env"

types.setTypeParser(20, (value) => Number(value))
types.setTypeParser(1700, (value) => Number(value))

type Executor = Pick<Pool, "query"> | Pick<PoolClient, "query">

function placeholders(sql: string): string {
  let position = 0
  return sql.replace(/\?/g, () => `$${++position}`)
}

function dateWithModifier(expression: string, modifier: string): string {
  const interval = modifier.startsWith("'") ? `INTERVAL ${modifier}` : `(${modifier})::interval`
  return `((${expression})::date + ${interval})::date::text`
}

/** Translate the small SQLite expression surface retained by existing APIs. */
export function postgresSql(input: string): string {
  let sql = placeholders(input.trim().replace(/;\s*$/, ""))
  if (!sql || /^PRAGMA\b/i.test(sql)) return "SELECT 1"

  const ignoreConflict = /^INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql)
  if (ignoreConflict) sql = sql.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO")

  sql = sql
    .replace(/\bMIN\(\s*date\(/gi, "LEAST(date(")
    .replace(
      /json_set\(details_json,\s*'\$\.startDate',\s*(\$\d+),\s*'\$\.endDate',\s*(\$\d+),\s*'\$\.days',\s*(\$\d+)\)/gi,
      "jsonb_set(jsonb_set(jsonb_set(details_json::jsonb, '{startDate}', to_jsonb(($1)::text)), '{endDate}', to_jsonb(($2)::text)), '{days}', to_jsonb(($3)::numeric))::text",
    )
    .replace(/json_extract\(([^,]+),\s*'\$\.([A-Za-z0-9_]+)'\)/gi, "(($1)::jsonb ->> '$2')")
    .replace(/json_object\(/gi, "json_build_object(")
    .replace(/julianday\(([^()]+)\)\s*-\s*julianday\(([^()]+)\)/gi, "(($1)::date - ($2)::date)")
    .replace(/date\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*,\s*(CASE[\s\S]*?END)\s*\)/gi,
      (_match, expression: string, modifier: string) => dateWithModifier(expression, `(${modifier})`))
    .replace(/date\(\s*'now'\s*,\s*('(?:[+-]?\d+\s+(?:day|days|month|months|year|years))'|\$\d+)\s*\)/gi,
      (_match, modifier: string) => dateWithModifier("CURRENT_DATE", modifier))
    .replace(/date\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*,\s*('(?:[+-]?\d+\s+(?:day|days|month|months|year|years))'|\$\d+)\s*\)/gi,
      (_match, expression: string, modifier: string) => dateWithModifier(expression, modifier))
    .replace(/date\(\s*'now'\s*\)/gi, "CURRENT_DATE::text")
    .replace(/date\(\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\)/gi, "(($1)::date)::text")
    .replace(/CAST\(\s*\(\(([^)]+)\)::date - \(([^)]+)\)::date\)\s+AS\s+INTEGER\s*\)/gi, "(($1)::date - ($2)::date)")

  if (/json_build_object\(/i.test(sql)) {
    sql = sql.replace(/json_build_object\(([^)]*)\)/gi, "json_build_object($1)::text")
  }
  if (ignoreConflict) sql += " ON CONFLICT DO NOTHING"
  return sql
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
    const applied = await client.query<QueryResultRow>("SELECT id FROM schema_migrations WHERE id=$1", ["0001_runtime"])
    if (!applied.rowCount) {
      await client.query("BEGIN")
      for (const statement of postgresSchema.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) {
        await client.query(statement)
      }
      await client.query("INSERT INTO schema_migrations(id) VALUES ($1)", ["0001_runtime"])
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

export async function getPostgresDatabase(): Promise<Database> {
  if (databasePromise) return databasePromise
  databasePromise = (async () => {
    const connectionString = runtimeEnv.DATABASE_URL
    if (!connectionString) throw new Error("DATABASE_URL is required for the Azure database runtime.")
    const pool = new Pool({
      connectionString,
      max: Number(runtimeEnv.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: runtimeEnv.DATABASE_SSL_MODE === "disable" ? false : { rejectUnauthorized: runtimeEnv.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
    })
    await pool.query("SELECT 1")
    await initialize(pool)
    return new PostgresDatabase(pool)
  })()
  return databasePromise
}
