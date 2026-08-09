import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { runHrAgent } from "@/lib/server/hr-agent"
import type { RequestActor } from "@/lib/server/request-user"

export const agentCatalog = [
  { id: "workforce-intelligence", name: "Workforce intelligence", capability: "Headcount, workforce movement, departmental comparison, data quality, and current work queues", tools: ["workforce_overview", "compare_departments", "review_work_queue"] },
  { id: "retention-planner", name: "Retention planner", capability: "Attrition evidence, explainable model signals, mobility context, and bounded follow-up analysis", tools: ["analyze_attrition_signals", "review_people_operations"] },
  { id: "recruiting-operations", name: "Onboarding operations", capability: "New-joiner readiness, recruiting handoffs, requisitions, candidate pipeline, and overdue work", tools: ["review_onboarding_readiness", "review_people_operations", "compare_departments", "review_work_queue"] },
  { id: "learning-compliance", name: "Learning and capability", capability: "Role capability requirements, mandatory gaps, completion evidence, and cohort recommendations", tools: ["review_capability_plan", "review_people_operations", "find_employee_records"] },
  { id: "people-operations", name: "People operations", capability: "Leave, promotions, employee records, and cross-domain operational summaries", tools: ["review_people_operations", "find_employee_records", "review_work_queue"] },
] as const

type AgentId = typeof agentCatalog[number]["id"]

export function isAgentId(value: string): value is AgentId {
  return agentCatalog.some((agent) => agent.id === value)
}

export async function invokeAgent(agentId: AgentId, objective: string, actor: RequestActor) {
  return runHrAgent({ message: objective, actor, agentId })
}

export async function listAgentRuns(actor: RequestActor) {
  const database = await ensureHrDatabase()
  if (!database) return []
  const clause = actor.role === "admin" || actor.role === "hr" ? "" : "WHERE actor_email=?"
  const query = database.prepare(`
    SELECT id, agent_id, actor_email, objective, status, provider, started_at, completed_at
    FROM agent_runs ${clause}
    ORDER BY started_at DESC LIMIT 30
  `)
  const rows = clause ? await query.bind(actor.email).all<Record<string, unknown>>() : await query.all<Record<string, unknown>>()
  return rows.results ?? []
}
