import { env } from "cloudflare:workers"
import { loadMcpTools } from "@langchain/mcp-adapters"
import { ChatOpenAI } from "@langchain/openai"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { buildHrSystemPrompt, type KnowledgeMatch } from "@/lib/server/hr-knowledge"
import { resolveHrIntent, type AgentHistoryMessage, type ToolPlan } from "@/lib/server/hr-agent-intent"
import { renderHrEvidence } from "@/lib/server/hr-agent-response"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { createHrMcpServer } from "@/lib/server/hr-mcp"

export type { AgentHistoryMessage } from "@/lib/server/hr-agent-intent"

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
}

type EvidenceResult = {
  plan: ToolPlan
  data: Record<string, unknown>
}

const outOfScopeResponse = "I can help with workforce analytics, HR data questions, or model explanations from the available workspace data. For operational decisions, I recommend human review."

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

function getWorkerSecret(name: "OPENAI_API_KEY" | "OPENAI_MODEL"): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[name]
  return typeof value === "string" && value ? value : undefined
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object") return ""
  const content = (message as { content?: unknown }).content
  if (typeof content === "string") return content
  if (Array.isArray(content)) return content.map((item) => item && typeof item === "object" && "text" in item ? String((item as { text: unknown }).text) : "").join("\n")
  return ""
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
  return [{
    name: "review_people_operations",
    input: { domain: "promotions", employeeIds },
    purpose: "retention_mobility_context",
    limit: employeeIds.length,
  }]
}

async function loadInProcessMcpTools() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const mcpServer = createHrMcpServer()
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
  systemPrompt,
}: {
  query: string
  draft: string
  systemPrompt: string
}): Promise<string | null> {
  const apiKey = getWorkerSecret("OPENAI_API_KEY")
  if (!apiKey) return null
  try {
    const model = new ChatOpenAI({ apiKey, model: getWorkerSecret("OPENAI_MODEL") ?? "gpt-4.1-mini", temperature: 0 })
    const response = await model.invoke([
      {
        role: "system",
        content: `${systemPrompt}\n\nYou are synthesizing a completed, deterministic tool result. Use only the supplied draft. Preserve every number and data-source qualification. Do not add facts, repeat sections, or mention tools. Return a concise answer beginning with the same Current source line.`,
      },
      { role: "user", content: `Question:\n${query}\n\nGrounded draft:\n${draft}` },
    ])
    const answer = messageText(response).trim()
    const draftSource = draft.split("\n", 1)[0]
    const answerSource = answer.split("\n", 1)[0]
    const allowedNumbers = numericTokens(draft)
    const introducedNumber = [...numericTokens(answer)].some((token) => !allowedNumbers.has(token))
    if (!answer || answer.length > 6_000 || answerSource !== draftSource || introducedNumber) return null
    return answer
  } catch {
    return null
  }
}

export async function runHrAgent({ message, history = [] }: { message: unknown; history?: AgentHistoryMessage[] }): Promise<AgentAnswer> {
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
  const safeHistory = history
    .filter((item): item is AgentHistoryMessage => Boolean(item) && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .slice(-12)
  const dimensions = (await getWorkforceAnalytics()).dimensions
  const intent = resolveHrIntent(query, safeHistory, dimensions)
  const { prompt, context } = buildHrSystemPrompt(intent.contextQuery)
  const citedContext = context.map(({ source, section }) => ({ source, section }))

  if (!intent.inScope || !intent.plans.length) {
    return { answer: outOfScopeResponse, provider: "scope-guard", tools: [], context: citedContext, groundedAt: new Date().toISOString() }
  }

  const mcp = await loadInProcessMcpTools()
  const traces: ToolTrace[] = []
  try {
    const evidence: EvidenceResult[] = []
    let pendingPlans = intent.plans
    for (let iteration = 1; iteration <= 2 && pendingPlans.length; iteration += 1) {
      const iterationEvidence: EvidenceResult[] = []
      for (const plan of pendingPlans) {
        const tool = mcp.tools.find((candidate) => candidate.name === plan.name)
        if (!tool) continue
        const started = Date.now()
        try {
          const output = await tool.invoke(plan.input)
          const data = contentToJson(output)
          const item = { plan, data }
          evidence.push(item)
          iterationEvidence.push(item)
          traces.push({ tool: plan.name, input: plan.input, iteration, resultContext: evidenceContext(data), durationMs: Date.now() - started, status: "completed" })
        } catch (error) {
          traces.push({ tool: plan.name, input: plan.input, iteration, durationMs: Date.now() - started, status: "failed" })
          throw error
        }
      }
      pendingPlans = followUpEvidencePlans(iterationEvidence, iteration)
    }

    const draft = evidence.map(({ plan, data }) => renderHrEvidence(plan, data)).join("\n\n")
    const synthesized = await synthesizeWithModel({ query, draft, systemPrompt: prompt })
    const answer = synthesized ?? draft
    const dataMode = evidence.map((item) => item.data.dataMode).find((value): value is string => typeof value === "string")
    return {
      answer,
      provider: synthesized ? "langchain-openai-mcp-grounded-synthesis" : "langchain-mcp-deterministic-orchestrator",
      tools: traces,
      context: citedContext,
      dataMode,
      groundedAt: new Date().toISOString(),
    }
  } finally {
    await mcp.close()
  }
}
