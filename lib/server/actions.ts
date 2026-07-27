import { env } from "cloudflare:workers"

import type { AgentActionStatus, ActionsResponse } from "@/lib/types"
import { getActionTemplates } from "@/lib/server/runtime"

type Statement = {
  bind(...values: unknown[]): Statement
  run(): Promise<unknown>
  all<T>(): Promise<{ results?: T[] }>
}

type Database = {
  prepare(sql: string): Statement
}

function getDatabase(): Database | null {
  return (env as unknown as { DB?: Database }).DB ?? null
}

async function ensureTable(database: Database): Promise<void> {
  await database
    .prepare("CREATE TABLE IF NOT EXISTS action_status (action_id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    .run()
}

export async function getActions(): Promise<ActionsResponse> {
  const database = getDatabase()
  const statuses = new Map<string, AgentActionStatus>()
  if (database) {
    await ensureTable(database)
    const result = await database.prepare("SELECT action_id, status FROM action_status").all<{
      action_id: string
      status: AgentActionStatus
    }>()
    for (const row of result.results ?? []) statuses.set(row.action_id, row.status)
  }

  const items = getActionTemplates()
    .map((action) => ({ ...action, status: statuses.get(action.id) ?? action.status }))
    .filter((action) => action.status !== "dismissed")
  return {
    items,
    stats: {
      actions: items.length,
      awaitingApproval: items.filter((item) => item.status === "needs_approval").length,
      completed: items.filter((item) => item.status === "completed").length,
    },
  }
}

export async function setActionStatus(actionId: string, status: AgentActionStatus): Promise<void> {
  const database = getDatabase()
  if (!database) throw new Error("Persistent action storage is unavailable.")
  await ensureTable(database)
  await database
    .prepare("INSERT INTO action_status(action_id, status, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(action_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP")
    .bind(actionId, status)
    .run()
}
