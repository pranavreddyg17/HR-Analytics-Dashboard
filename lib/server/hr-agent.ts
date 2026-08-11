import { loadMcpTools } from "@langchain/mcp-adapters"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { buildHrSystemPrompt, type KnowledgeMatch } from "@/lib/server/hr-knowledge"
import { resolveHrIntent, type AgentHistoryMessage, type ToolPlan } from "@/lib/server/hr-agent-intent"
import { planHrAgentWithAzure, shouldUseAzurePlanner } from "@/lib/server/hr-agent-planner"
import { renderHrEvidence } from "@/lib/server/hr-agent-response"
import { getWorkforceDimensions } from "@/lib/server/hr-analytics"
import { createHrMcpServer } from "@/lib/server/hr-mcp"
import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { runtimeEnv } from "@/lib/server/runtime-env"
import { synthesizeWithAzureResponses } from "@/lib/server/azure-ai"
import { planAiWorkflow } from "@/lib/server/ai-workflows"
import type { AssistantPageContext } from "@/lib/assistant-page-context"
import type { RequestActor } from "@/lib/server/request-user"

type ToolTrace = {
  tool: string
  input: Record<string, unknown>
  iteration: number
  resultContext?: {
    employeeIds?: string[]
    recordScope?: string
  }
  durationMs: number
  status: "completed" | "failed"
}

type AgentAnswer = {
  answer: string
  provider: string
  tools: ToolTrace[]
  context: Array<Pick<KnowledgeMatch, "source" | "section">>
  dataMode?: string
  groundedAt: string
  workflow?: {
    prompt: string
    type: "calendar_invite" | "learning_assignment" | "hiring_requisition" | "retention_review"
    title: string
    evidence: string
    requiresConfirmation: true
  }
}

type AgentProgress =
  | { phase: "planning"; message: string }
  | { phase: "tool_started"; tool: string; iteration: number }
  | { phase: "tool_completed"; tool: string; iteration: number; durationMs: number }
  | { phase: "synthesis"; message: string }

type EvidenceResult = {
  plan: ToolPlan
  data: Record<string, unknown>
}

const outOfScopeResponse = "I can help with workforce analytics, HR data questions, or model explanations from the available workspace data. For operational decisions, I recommend human review."

const agentFocus: Record<string, string> = {
  "workforce-intelligence": "Focus on workforce headcount, movement, departmental comparison, operating coverage, and data quality",
  "retention-planner": "Focus on attrition and retention evidence, model contributors, mobility context, learning context, and a practical human-reviewed retention plan",
  "recruiting-operations": "Focus on hiring requisitions, candidate pipeline, recruiting ownership, overdue work, and replacement coverage",
  "learning-compliance": "Focus on learning assignments, mandatory compliance gaps, course completion, and development context",
  "people-operations": "Focus on employee records, leave, promotions, mobility, and cross-domain people operations",
}

function contentToJson(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { return JSON.parse(value) as Record<string, unknown> } catch { return { text: value } }
  }
  if (Array.isArray(value)) {
    const text = value.find((item) => item && typeof item === "object" && (item as { type?: string }).type === "text") as { text?: string } | undefined
    return contentToJson(text?.text ?? "{}")
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if (record.content) return contentToJson(record.content)
    return record
  }
  return {}
}

function numericTokens(value: string): Set<string> {
  return new Set((value.match(/\b\d[\d,]*(?:\.\d+)?%?/g) ?? []).map((token) => token.replace(/[,%]/g, "")))
}

function evidenceContext(data: Record<string, unknown>): ToolTrace["resultContext"] {
  const rows = Array.isArray(data.joinedEmployeeRecords)
    ? data.joinedEmployeeRecords
    : Array.isArray(data.employees)
      ? data.employees
      : []
  const employeeIds = rows.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const value = (item as Record<string, unknown>).employeeId
    return typeof value === "string" ? [value] : []
  }).slice(0, 20)
  const recordScope = typeof data.recordScope === "string" ? data.recordScope : undefined
  if (!employeeIds.length && !recordScope) return undefined
  return { ...(employeeIds.length ? { employeeIds } : {}), ...(recordScope ? { recordScope } : {}) }
}

function followUpEvidencePlans(evidence: EvidenceResult[], iteration: number): ToolPlan[] {
  if (iteration !== 1) return []
  const retention = evidence.find((item) => item.plan.purpose === "attrition_record_retention_plan")
  if (!retention) return []
  const employeeIds = Array.isArray(retention.data.joinedEmployeeRecords)
    ? retention.data.joinedEmployeeRecords.flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const employeeId = (item as Record<string, unknown>).employeeId
      return typeof employeeId === "string" ? [employeeId] : []
    }).slice(0, retention.plan.limit)
    : []
  if (!employeeIds.length) return []
  return [
    {
      name: "review_people_operations",
      input: { domain: "promotions", employeeIds },
      purpose: "retention_mobility_context",
      limit: employeeIds.length,
    },
    {
      name: "review_people_operations",
      input: { domain: "training", employeeIds },
      purpose: "retention_learning_context",
      limit: employeeIds.length,
    },
  ]
}

function isWorkflowCommand(query: string): boolean {
  return /\b(?:schedule|set up|invite)\b.{0,60}\b(?:meeting|calendar|one[- ]to[- ]one|1:1)\b/i.test(query)
    || /\b(?:assign|enrol|enroll)\b.{0,60}\b(?:course|training|learning|certification)\b/i.test(query)
    || /\b(?:request|open|create|submit|hire)\b.{0,120}\b(?:position|role|requisition|headcount|because|business need)\b/i.test(query)
    || /\b(?:create|start|open)\b.{0,60}\bretention review\b/i.test(query)
}

function compactEvidence(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[nested evidence omitted]"
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => compactEvidence(item, depth + 1))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["directoryEmployees", "rows"].includes(key))
      .slice(0, 80)
      .map(([key, item]) => [key, compactEvidence(item, depth + 1)]))
  }
  if (typeof value === "string") return value.slice(0, 1_500)
  return value
}

async function loadInProcessMcpTools(actor?: RequestActor) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const mcpServer = createHrMcpServer(actor)
  const mcpClient = new Client({ name: "LaidbackHR.AI Workforce Orchestrator", version: "4.0.0" }, { capabilities: {} })
  await mcpServer.connect(serverTransport)
  await mcpClient.connect(clientTransport)
  const tools = await loadMcpTools("laidbackhr", mcpClient as unknown as Parameters<typeof loadMcpTools>[1])
  return {
    tools,
    close: async () => {
      await mcpClient.close()
      if (mcpServer.isConnected()) await mcpServer.close()
    },
  }
}

async function synthesizeWithModel({
  query,
  draft,
  evidence,
  systemPrompt,
}: {
  query: string
  draft: string
  evidence: EvidenceResult[]
  systemPrompt: string
}): Promise<string | null> {
  const evidenceJson = JSON.stringify(evidence.map(({ plan, data }) => ({
    tool: plan.name,
    purpose: plan.purpose,
    evidence: compactEvidence(data),
  })))
  const synthesisInstruction = `${systemPrompt}\n\nYou are composing the final answer from completed read-only evidence. Answer the user's exact question and respect the current page scope. Lead with the decision-useful conclusion. Return clean Markdown: use no more than two short level-three headings, no more than six bullets per section, and a compact Markdown table only when comparison is materially clearer. Keep a normal response under 180 words unless the user explicitly asks for detail or a complete list. Summarize omitted records and offer the next useful drill-down. Never emit raw HTML or fenced code. Use only facts in the supplied evidence; do not invent a number, name, status, date, relationship, or cause. Do not say “Current source”, describe tool mechanics, append a generic disclaimer, or repeat the question. State a limitation only when it changes the decision. Observed outcomes, model signals, and planning scenarios must remain distinct.`
  const userContent = `Question:\n${query}\n\nStructured evidence:\n${evidenceJson}\n\nDeterministic reference draft:\n${draft}`
  const azureAnswer = await synthesizeWithAzureResponses({ system: synthesisInstruction, user: userContent, maxOutputTokens: 1_800 }).catch(() => null)
  if (azureAnswer) {
    const allowedNumbers = numericTokens(`${query}\n${draft}\n${evidenceJson}`)
    const introducedNumber = [...numericTokens(azureAnswer)].some((token) => !allowedNumbers.has(token))
    if (azureAnswer.length <= 8_000 && !introducedNumber) return azureAnswer
  }
  return null
}

async function startRun(input: { actorEmail?: string; conversationId?: string; agentId?: string; objective: string }): Promise<string | null> {
  if (!input.actorEmail) return null
  try {
    const database = await ensureHrDatabase()
    if (!database) return null
    const id = `AGENT-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
    await database.prepare(`INSERT INTO agent_runs(id, agent_id, actor_email, conversation_id, objective, status, provider) VALUES (?, ?, ?, ?, ?, 'running', 'langchain-mcp')`)
      .bind(id, input.agentId ?? "workforce-intelligence", input.actorEmail, input.conversationId ?? null, input.objective).run()
    return id
  } catch { return null }
}

async function recordRunStep(runId: string | null, stepNumber: number, trace: ToolTrace) {
  if (!runId) return
  try {
    const database = await ensureHrDatabase()
    if (!database) return
    await database.prepare(`INSERT INTO agent_run_steps(id, run_id, step_number, tool_name, input_json, output_summary, status, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), runId, stepNumber, trace.tool, JSON.stringify(trace.input), trace.resultContext ? JSON.stringify(trace.resultContext) : null, trace.status, trace.durationMs).run()
  } catch { /* Audit persistence must not hide a valid grounded answer. */ }
}

async function finishRun(runId: string | null, status: "completed" | "failed", provider?: string) {
  if (!runId) return
  try {
    const database = await ensureHrDatabase()
    if (!database) return
    await database.prepare("UPDATE agent_runs SET status=?, provider=COALESCE(?, provider), completed_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(status, provider ?? null, runId).run()
  } catch { /* Best-effort operational audit. */ }
}

export async function runHrAgent({ message, history = [], actor, conversationId, agentId, pageContext, onProgress }: { message: unknown; history?: AgentHistoryMessage[]; actor?: RequestActor; conversationId?: string; agentId?: string; pageContext?: AssistantPageContext; onProgress?: (progress: AgentProgress) => void | Promise<void> }): Promise<AgentAnswer> {
  if (typeof message !== "string" || !message.trim() || message.length > 2000) throw new Error("message must contain between 1 and 2,000 characters.")
  const query = message.trim()
  if (/^(?:hi|hello|hey|good (?:morning|afternoon|evening))[!.?\s]*$/i.test(query)) {
    return {
      answer: "Hi. What would you like to review—workforce, attrition risk, hiring, leave, learning or employee records?",
      provider: "conversation",
      tools: [],
      context: [],
      groundedAt: new Date().toISOString(),
    }
  }
  const runId = await startRun({ actorEmail: actor?.email, conversationId, agentId, objective: query })
  const safeHistory = history
    .filter((item): item is AgentHistoryMessage => Boolean(item) && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .slice(-12)
  if (actor && actor.role !== "employee" && isWorkflowCommand(query)) {
    try {
      await onProgress?.({ phase: "planning", message: "Preparing a governed workflow" })
      const workflow = await planAiWorkflow({ prompt: query }, actor)
      const answer = `${workflow.title}\n\n${workflow.evidence}\n\nReview the affected records and confirm before anything is written or sent.`
      await finishRun(runId, "completed", "azure-foundry-workflow-planner")
      return {
        answer,
        provider: "azure-foundry-workflow-planner",
        tools: [],
        context: [],
        groundedAt: new Date().toISOString(),
        workflow: {
          prompt: query,
          type: workflow.type,
          title: workflow.title,
          evidence: workflow.evidence,
          requiresConfirmation: true,
        },
      }
    } catch (error) {
      const answer = error instanceof Error ? error.message : "The workflow needs more information before it can be prepared."
      await finishRun(runId, "completed", "workflow-clarification")
      return { answer, provider: "workflow-clarification", tools: [], context: [], groundedAt: new Date().toISOString() }
    }
  }

  const dimensions = await getWorkforceDimensions()
  await onProgress?.({ phase: "planning", message: "Selecting workspace evidence" })
  const focus = agentId ? agentFocus[agentId] : undefined
  // Intent routing must reflect the user's objective, not the agent's role
  // description. Mixing the two can select an unrelated MCP schema (for
  // example, a generic workforce objective being treated as a comparison).
  const fallbackIntent = resolveHrIntent(query, safeHistory, dimensions, pageContext)
  const modelIntent = shouldUseAzurePlanner(query, fallbackIntent, pageContext)
    ? await planHrAgentWithAzure({ query, history: safeHistory, pageContext, dimensions })
    : null
  const intent = modelIntent?.inScope && modelIntent.plans.length ? modelIntent : fallbackIntent
  const pageScope = pageContext ? `${pageContext.label}${Object.keys(pageContext.filters).length ? ` (${Object.entries(pageContext.filters).map(([key, value]) => `${key}: ${value}`).join(", ")})` : ""}` : ""

  if (!intent.inScope || !intent.plans.length) {
    await finishRun(runId, "completed", "scope-guard")
    return { answer: outOfScopeResponse, provider: "scope-guard", tools: [], context: [], groundedAt: new Date().toISOString() }
  }

  // Guidance retrieval and operational MCP calls are independent. Starting
  // retrieval here prevents Azure AI Search latency from blocking database
  // evidence collection while keeping the final answer grounded in both.
  const knowledgePromise = buildHrSystemPrompt(`${pageScope ? `${pageScope}. ` : ""}${intent.contextQuery}`)
  const mcp = await loadInProcessMcpTools(actor)
  const traces: ToolTrace[] = []
  try {
    const evidence: EvidenceResult[] = []
    let stepNumber = 0
    let pendingPlans = intent.plans
    for (let iteration = 1; iteration <= 2 && pendingPlans.length; iteration += 1) {
      const iterationEvidence = await Promise.all(pendingPlans.map(async (plan): Promise<EvidenceResult | null> => {
        const tool = mcp.tools.find((candidate) => candidate.name === plan.name)
        if (!tool) return null
        const started = Date.now()
        await onProgress?.({ phase: "tool_started", tool: plan.name, iteration })
        try {
          const output = await tool.invoke(plan.input)
          const data = contentToJson(output)
          const item = { plan, data }
          const trace: ToolTrace = { tool: plan.name, input: plan.input, iteration, resultContext: evidenceContext(data), durationMs: Date.now() - started, status: "completed" }
          traces.push(trace)
          await recordRunStep(runId, ++stepNumber, trace)
          await onProgress?.({ phase: "tool_completed", tool: plan.name, iteration, durationMs: trace.durationMs })
          return item
        } catch (error) {
          const trace: ToolTrace = { tool: plan.name, input: plan.input, iteration, durationMs: Date.now() - started, status: "failed" }
          traces.push(trace)
          await recordRunStep(runId, ++stepNumber, trace)
          throw error
        }
      }))
      evidence.push(...iterationEvidence.filter((item): item is EvidenceResult => item !== null))
      pendingPlans = followUpEvidencePlans(evidence, iteration)
    }

    const draft = evidence.map(({ plan, data }) => renderHrEvidence(plan, data)).join("\n\n")
    const { prompt: basePrompt, context } = await knowledgePromise
    const promptParts = [basePrompt, focus ? `Specialized agent scope: ${focus}.` : "", pageScope ? `Current workspace page: ${pageScope}. Use the page route and active filters to choose evidence. Factual claims must come from MCP results.` : ""].filter(Boolean)
    const prompt = promptParts.join("\n\n")
    const citedContext = context.map(({ source, section }) => ({ source, section }))
    await onProgress?.({ phase: "synthesis", message: "Preparing grounded response" })
    const synthesized = await synthesizeWithModel({ query, draft, evidence, systemPrompt: prompt })
    const answer = synthesized ?? draft
    const dataMode = evidence.map((item) => item.data.dataMode).find((value): value is string => typeof value === "string")
    const provider = synthesized ? "azure-openai-langchain-mcp" : "langchain-mcp-deterministic-orchestrator"
    await finishRun(runId, "completed", provider)
    return {
      answer,
      provider,
      tools: traces,
      context: citedContext,
      dataMode,
      groundedAt: new Date().toISOString(),
    }
  } catch (error) {
    await finishRun(runId, "failed")
    throw error
  } finally {
    await mcp.close()
  }
}
