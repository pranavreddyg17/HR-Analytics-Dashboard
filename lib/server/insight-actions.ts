import type { HrFilters } from "@/lib/hr-types"
import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import type { RequestActor } from "@/lib/server/request-user"

export class InsightActionError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

function requirePeopleTeam(actor: RequestActor): void {
  if (!["admin", "hr"].includes(actor.role)) throw new InsightActionError("Only HR administrators can manage insight work items.", 403)
}

function dueDate(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function normalizedStatus(status: string): "pending" | "in_progress" | "completed" {
  const value = status.toLowerCase().replaceAll(" ", "_")
  return value === "in_progress" ? "in_progress" : value === "completed" ? "completed" : "pending"
}

export async function createInsightWorkItem(
  signalId: string,
  filters: HrFilters,
  actor: RequestActor,
): Promise<{ id: string; status: "pending" | "in_progress" | "completed" }> {
  requirePeopleTeam(actor)
  const analytics = await getWorkforceAnalytics({ ...filters, dataMode: filters.dataMode ?? "all" })
  const signal = analytics.decisionSupport.actions.find((item) => item.id === signalId)
  if (!signal) throw new InsightActionError("This insight is no longer present in the selected reporting scope.", 409)
  if (signal.workItem && signal.workItem.status !== "completed") return { id: signal.workItem.id, status: signal.workItem.status }

  const database = await ensureHrDatabase()
  if (!database) throw new InsightActionError("Workflow storage is unavailable.", 503)
  const id = `INS-${crypto.randomUUID()}`
  const dueAt = dueDate(signal.severity === "high" ? 7 : 14)
  const scope = [filters.from, filters.to].filter(Boolean).join(" to ") || "Current reporting scope"
  const details = JSON.stringify({
    signalId: signal.id,
    category: signal.category,
    department: signal.department,
    evidence: signal.evidence,
    recommendedAction: signal.recommendedAction,
    target: signal.target,
    reportingScope: scope,
    filters,
    generatedAt: analytics.generatedAt,
    formulaVersion: "2.0",
  })

  await database.prepare(`
    INSERT INTO workflow_requests(
      id, type, employee_id, title, status, details_json, requested_by_email,
      priority, owner_email, due_at, next_action, source_entity_type, source_entity_id,
      assigned_at, confidentiality_level, created_at, updated_at
    )
    SELECT ?, 'insight', NULL, ?, 'Pending', ?, ?, ?, ?, ?, ?,
      'workforce_insight', ?, CURRENT_TIMESTAMP, 'restricted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    WHERE NOT EXISTS (
      SELECT 1 FROM workflow_requests
      WHERE type='insight' AND source_entity_id=? AND completed_at IS NULL
    )
  `).bind(
    id,
    `${signal.department}: ${signal.title}`,
    details,
    actor.email,
    signal.severity,
    actor.email,
    dueAt,
    signal.recommendedAction,
    signal.id,
    signal.id,
  ).run()

  const stored = await database.prepare(`
    SELECT id, status FROM workflow_requests
    WHERE type='insight' AND source_entity_id=? AND completed_at IS NULL
    ORDER BY created_at DESC, id DESC LIMIT 1
  `).bind(signal.id).first<{ id: string; status: string }>()
  if (!stored) throw new InsightActionError("The work item could not be created.", 500)
  return { id: stored.id, status: normalizedStatus(stored.status) }
}

export async function updateInsightWorkItem(
  workItemId: string,
  action: "start" | "complete",
  note: string,
  actor: RequestActor,
): Promise<{ id: string; status: "in_progress" | "completed" }> {
  requirePeopleTeam(actor)
  const database = await ensureHrDatabase()
  if (!database) throw new InsightActionError("Workflow storage is unavailable.", 503)
  const workItem = await database.prepare("SELECT id, status, owner_email FROM workflow_requests WHERE id=? AND type='insight'")
    .bind(workItemId).first<{ id: string; status: string; owner_email: string | null }>()
  if (!workItem) throw new InsightActionError("Insight work item not found.", 404)
  const status = normalizedStatus(workItem.status)

  if (action === "start") {
    if (status !== "pending") throw new InsightActionError("This work item cannot be started from its current status.", 409)
    await database.prepare(`
      UPDATE workflow_requests
      SET status='In progress', owner_email=?, assigned_at=CURRENT_TIMESTAMP,
        details_json=(COALESCE(NULLIF(details_json, ''), '{}')::jsonb || jsonb_build_object('workPlan', ?::text))::text,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND type='insight'
    `).bind(actor.email, note.trim(), workItemId).run()
    return { id: workItemId, status: "in_progress" }
  }

  if (status !== "in_progress") throw new InsightActionError("Start the work item before completing it.", 409)
  await database.prepare(`
    UPDATE workflow_requests
    SET status='Completed', next_action='No further action.', resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP,
      completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND type='insight'
  `).bind(actor.email, note.trim(), workItemId).run()
  return { id: workItemId, status: "completed" }
}
