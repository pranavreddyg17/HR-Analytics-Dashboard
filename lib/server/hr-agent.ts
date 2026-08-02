import { env } from "cloudflare:workers"
import { loadMcpTools } from "@langchain/mcp-adapters"
import { ChatOpenAI } from "@langchain/openai"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createAgent } from "langchain"

import type { HrFilters } from "@/lib/hr-types"
import { buildHrSystemPrompt, type KnowledgeMatch } from "@/lib/server/hr-knowledge"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { createHrMcpServer } from "@/lib/server/hr-mcp"

type ToolTrace = {
  tool: string
  input: Record<string, unknown>
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

type ToolPlan = {
  name: "workforce_overview" | "compare_departments" | "analyze_attrition_signals" | "review_people_operations" | "find_employee_records"
  input: Record<string, unknown>
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

function numberValue(data: Record<string, unknown>, key: string): number {
  return typeof data[key] === "number" ? data[key] : 0
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : []
}

function topItem(value: unknown, labelKey = "label"): { label: string; value: number } | null {
  const first = list(value)[0]
  if (!first) return null
  const label = first[labelKey]
  return typeof label === "string" && typeof first.value === "number" ? { label, value: first.value } : null
}

function dataLabel(data: Record<string, unknown>): string {
  return typeof data.dataMode === "string" ? data.dataMode : "mixed"
}

function explainTool(toolName: string, data: Record<string, unknown>): string {
  const mode = dataLabel(data)

  if (toolName === "workforce_overview") {
    const kpis = (data.kpis ?? {}) as Record<string, unknown>
    const open = (data.openWork ?? {}) as Record<string, unknown>
    const workflows = (data.workflowQueue ?? {}) as Record<string, unknown>
    return [
      `Current source: ${mode}.`,
      `- ${numberValue(kpis, "activeEmployees")} active employees; ${numberValue(kpis, "hires")} completed hires; ${numberValue(kpis, "attritionRate")}% recorded attrition.`,
      `- ${numberValue(open, "pendingLeaveRequests")} leave requests pending; ${numberValue(open, "activeHiringRequisitions")} active requisitions; ${numberValue(open, "mandatoryTrainingGaps")} mandatory training gaps.`,
      `- ${numberValue(workflows, "openTotal")} persisted workflow requests remain open across leave, hiring, and training.`,
      `- ${numberValue(open, "mobilityReviews")} employees meet the tenure-based mobility review definition.`,
      "Recommended next step: review the largest operational queue first, then validate any employee-level action with the underlying record.",
    ].join("\n")
  }

  if (toolName === "compare_departments") {
    const departments = list(data.departments)
    const first = departments[0]
    const metric = String(data.definition ?? data.metric ?? "selected metric")
    if (!first) return `Current source: ${mode}. No department records match this view.`
    return [
      `Current source: ${mode}.`,
      `${String(first.department)} has the highest ${metric.toLowerCase()} value in the current view (${Number(first.value ?? 0).toLocaleString()}).`,
      ...departments.slice(0, 5).map((row) => `- ${String(row.department)}: ${Number(row.value ?? 0).toLocaleString()}`),
      "This is a descriptive comparison and does not establish cause.",
    ].join("\n")
  }

  if (toolName === "analyze_attrition_signals") {
    const observed = (data.observedAttrition ?? {}) as Record<string, unknown>
    const model = (data.historicalModelReview ?? {}) as Record<string, unknown>
    const distribution = (model.riskDistribution ?? {}) as Record<string, unknown>
    const department = topItem(observed.byDepartment)
    const records = list(data.joinedEmployeeRecords)
    return [
      `Current source: ${mode}.`,
      `- ${numberValue(observed, "exits")} recorded exits; ${numberValue(observed, "rate")}% attrition; ${numberValue(observed, "voluntary")} voluntary and ${numberValue(observed, "involuntary")} involuntary.`,
      department ? `- ${department.label} has the most recorded exits in this view (${department.value}).` : "- No department exit comparison is available.",
      `- Historical model review: ${numberValue(distribution, "high")} high, ${numberValue(distribution, "medium")} medium, and ${numberValue(distribution, "low")} low risk records across ${numberValue(model, "totalScoredRecords")} validation rows.`,
      records.length ? `- ${Number(data.matchCount ?? records.length)} joined synthetic employee records match this request:` : "",
      ...records.map((record) => {
        const exit = record.exitDate ? `exited ${String(record.exitDate)} (${String(record.exitType ?? "type not recorded")}; ${String(record.exitReason ?? "reason not recorded")})` : `status: ${String(record.employmentStatus)}`
        return `- ${String(record.name)} (${String(record.employeeId)}) — ${String(record.jobTitle)}, ${String(record.department)}; ${exit}; model score ${Number(record.riskScore ?? 0).toFixed(1)}% (${String(record.riskLevel)}).`
      }),
      Number(data.matchCount ?? 0) > records.length ? `- ${Number(data.matchCount) - records.length} additional matching records are available.` : "",
      "IBM scores are joined only to labelled synthetic demo profiles. Imported operational employees do not receive these scores. Associations are not forecasts or proven causes; human review is required.",
    ].filter(Boolean).join("\n")
  }

  if (toolName === "review_people_operations") {
    const domain = String(data.domain ?? "")
    const summary = (data.summary ?? {}) as Record<string, unknown>
    if (domain === "hiring") {
      const topSource = list(data.sourcePerformance)[0]
      return [
        `Current source: ${mode}.`,
        `- ${numberValue(summary, "completedHires")} completed hires; ${numberValue(summary, "activeRequisitions")} active requisitions; ${numberValue(summary, "averageTimeToHireDays")} average days to hire.`,
        topSource ? `- ${String(topSource.label)} leads completed-hire volume with ${Number(topSource.hires ?? 0)} hires and ${Number(topSource.averageDays ?? 0)} average days to hire.` : "- No completed source data is available.",
        "Use quality-of-hire and retention alongside source volume before changing recruiting spend.",
      ].join("\n")
    }
    if (domain === "leave") {
      const topType = topItem(data.byType)
      return [
        `Current source: ${mode}.`,
        `- ${numberValue(summary, "pending")} pending requests; ${numberValue(summary, "approvedDays")} approved leave days; ${numberValue(summary, "averageApprovedDaysPerEmployee")} average approved days per employee taking leave.`,
        topType ? `- ${topType.label} is the largest approved leave category (${topType.value} days).` : "- No approved leave category data is available.",
        "Use this for coverage planning, not as an employee performance signal.",
      ].join("\n")
    }
    if (domain === "training") {
      const gaps = list(data.incompleteMandatoryAssignments)
      return [
        `Current source: ${mode}.`,
        `- ${numberValue(summary, "completionRate")}% completion across ${numberValue(summary, "assignedHours")} assigned hours.`,
        `- ${numberValue(summary, "mandatoryGaps")} mandatory assignments require follow-up.`,
        ...gaps.slice(0, 5).map((row) => `- ${String(row.program)} — ${String(row.employeeId)}${row.dueDate ? `, due ${String(row.dueDate)}` : ""}`),
        gaps.length > 5 ? `- ${gaps.length - 5} additional mandatory gaps are in the current result.` : "",
      ].filter(Boolean).join("\n")
    }
    const mobility = list(data.mobilityReview)
    return [
      `Current source: ${mode}.`,
      `- ${numberValue(summary, "promotions")} promotions; ${numberValue(summary, "promotionRate")}% promotion rate; ${numberValue(summary, "averageMonthsToPromotion")} average months between recorded promotions.`,
      `- ${numberValue(summary, "mobilityReviewCount")} active employees meet the three-year tenure and no-recorded-promotion review definition.`,
      ...mobility.slice(0, 10).map((row) => `- ${String(row.name)} (${String(row.employeeId)}) — ${String(row.jobTitle)}, ${String(row.department)}, ${Number(row.tenureYears ?? 0)} years tenure; ${String(row.dataSource)} record.`),
      numberValue(summary, "mobilityReviewCount") > 10 ? `- ${numberValue(summary, "mobilityReviewCount") - 10} additional records are available in this cohort.` : "",
      "This list identifies employees for a career-mobility review; it does not determine who should be promoted. Confirm role level, performance evidence, lateral moves, employee preference, and record completeness.",
    ].filter(Boolean).join("\n")
  }

  if (toolName === "find_employee_records") {
    const employees = list(data.employees)
    if (!employees.length) return `Current source: ${mode}. No employee records match the requested criteria.`
    return [
      `Current source: ${mode}. ${Number(data.matchCount ?? employees.length)} employee records match.`,
      ...employees.map((employee) => `- ${String(employee.name)} (${String(employee.employeeId)}) — ${String(employee.jobTitle)}, ${String(employee.department)}, ${String(employee.location)}; status: ${String(employee.employmentStatus)}.`),
      "Only minimum profile fields are shown. Use employee-level information for legitimate HR work and human review.",
    ].join("\n")
  }

  return `Current source: ${mode}. The requested HR analysis completed.`
}

function inHrScope(message: string): boolean {
  return /employee|people|workforce|headcount|department|location|manager|hire|hiring|recruit|attrition|turnover|exit|retention|risk|leave|pto|absence|vacation|training|learning|course|mandatory|promotion|career|mobility|data quality|demo|import|summary|brief|company|status/i.test(message)
}

function operationDomain(message: string): "hiring" | "leave" | "training" | "promotions" | null {
  if (/hire|hiring|recruit|candidate|source|requisition|offer/i.test(message)) return "hiring"
  if (/leave|pto|absence|vacation|sick|coverage/i.test(message)) return "leave"
  if (/training|learning|course|assessment|mandatory|compliance|phishing|safety/i.test(message)) return "training"
  if (/promotion|promote|career|progression|mobility/i.test(message)) return "promotions"
  return null
}

function comparisonMetric(message: string): "headcount" | "hires" | "exits" | "leave_days" | "training_hours" | "promotions" {
  if (/hire|recruit/i.test(message)) return "hires"
  if (/exit|attrition|turnover/i.test(message)) return "exits"
  if (/leave|absence|pto/i.test(message)) return "leave_days"
  if (/training|learning/i.test(message)) return "training_hours"
  if (/promotion|mobility/i.test(message)) return "promotions"
  return "headcount"
}

async function inferFilters(message: string): Promise<HrFilters> {
  const analytics = await getWorkforceAnalytics()
  const lower = message.toLowerCase()
  return {
    department: analytics.dimensions.departments.find((value) => lower.includes(value.toLowerCase())),
    jobTitle: analytics.dimensions.jobTitles.find((value) => lower.includes(value.toLowerCase())),
    location: analytics.dimensions.locations.find((value) => lower.includes(value.toLowerCase())),
    period: /quarter/i.test(message) ? "quarter" : /year|annual/i.test(message) ? "year" : "month",
  }
}

async function planTools(message: string): Promise<ToolPlan[]> {
  const filters = await inferFilters(message)
  const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined))
  const plans: ToolPlan[] = []
  const domain = operationDomain(message)

  if (/attrition|turnover|exit|retention|risk/i.test(message)) {
    const wantsRecords = /\b(?:list|show|find|pull|which|who|records?|employees?|people)\b/i.test(message)
    const exitedRecords = /attrition records?|employees? (?:who )?(?:left|exited)|former employees?|departures?|terminations?/i.test(message)
      || /records? of employees? of attrition/i.test(message)
    const highRiskRecords = /at[-\s]?risk|high[-\s]?risk|retention risk|likely to leave/i.test(message)
    const identifier = message.match(/\b(?:emp|ibm)[-_ ]?\d+\b/i)?.[0]?.replace(/[_ ]/g, "-")
    plans.push({
      name: "analyze_attrition_signals",
      input: {
        ...cleanFilters,
        ...(wantsRecords ? { recordScope: exitedRecords ? "exited" : highRiskRecords ? "high_risk" : "all", limit: 10 } : {}),
        ...(identifier ? { query: identifier } : {}),
      },
    })
  }
  if (domain) {
    plans.push({ name: "review_people_operations", input: { ...cleanFilters, domain } })
  }
  if (/compare|which department|highest|lowest|break down|breakdown|by department/i.test(message)) {
    plans.push({ name: "compare_departments", input: { ...cleanFilters, metric: comparisonMetric(message) } })
  }
  const explicitLookup = /\b(?:emp|ibm)[-_ ]?[a-z0-9]+\b/i.test(message)
    || /\b(?:find|lookup|open|show)\b.{0,30}\b(?:employee|person|profile|record)\b/i.test(message)
    || /\b(?:employee|person)\b.{0,20}\b(?:profile|record|details)\b/i.test(message)
  const cohortQuestion = /promot|mobility|career progression|attrition|risk|training|leave|hiring|recruit/i.test(message)
  if (explicitLookup && !cohortQuestion) {
    const identifier = message.match(/\b(?:emp|ibm)[-_ ]?\d+\b/i)?.[0]
    plans.push({ name: "find_employee_records", input: { ...cleanFilters, query: identifier?.replace(/[_ ]/g, "-") ?? message, limit: 10 } })
  } else if (/\b(?:list|show|find)\b.{0,20}\bactive employees\b/i.test(message) && !cohortQuestion) {
    plans.push({ name: "find_employee_records", input: { ...cleanFilters, status: "Active", limit: 10 } })
  }
  if (!plans.length || /executive|summary|brief|overview|company|workforce/i.test(message)) {
    plans.unshift({ name: "workforce_overview", input: cleanFilters })
  }
  return plans.filter((plan, index, all) => all.findIndex((candidate) => candidate.name === plan.name) === index).slice(0, 2)
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

async function loadInProcessMcpTools() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const mcpServer = createHrMcpServer()
  const mcpClient = new Client({ name: "LaidbackHR.AI LangChain Agent", version: "3.0.0" }, { capabilities: {} })
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

export async function runHrAgent({ message }: { message: unknown }): Promise<AgentAnswer> {
  if (typeof message !== "string" || !message.trim() || message.length > 2000) throw new Error("message must contain between 1 and 2,000 characters.")
  const query = message.trim()
  const { prompt, context } = buildHrSystemPrompt(query)
  const citedContext = context.map(({ source, section }) => ({ source, section }))

  if (!inHrScope(query)) {
    return { answer: outOfScopeResponse, provider: "scope-guard", tools: [], context: citedContext, groundedAt: new Date().toISOString() }
  }

  const mcp = await loadInProcessMcpTools()
  const traces: ToolTrace[] = []
  try {
    const apiKey = getWorkerSecret("OPENAI_API_KEY")
    if (apiKey) {
      const model = new ChatOpenAI({ apiKey, model: getWorkerSecret("OPENAI_MODEL") ?? "gpt-4.1-mini", temperature: 0 })
      const agent = createAgent({ model, tools: mcp.tools, systemPrompt: prompt })
      const started = Date.now()
      const response = await agent.invoke({ messages: [{ role: "user", content: query }] })
      const usedTools = response.messages.flatMap((item) => {
        if (!("tool_calls" in item) || !Array.isArray(item.tool_calls)) return []
        return item.tool_calls.map((call) => ({ name: call.name, input: call.args && typeof call.args === "object" ? call.args as Record<string, unknown> : {} }))
      })
      for (const call of usedTools) traces.push({ tool: call.name, input: call.input, durationMs: Date.now() - started, status: "completed" })
      return {
        answer: messageText(response.messages.at(-1)) || "No answer was produced for this question.",
        provider: "langchain-openai-mcp-rag",
        tools: traces,
        context: citedContext,
        groundedAt: new Date().toISOString(),
      }
    }

    const evidenceResults: Array<{ tool: string; data: Record<string, unknown> }> = []
    for (const plan of await planTools(query)) {
      const tool = mcp.tools.find((candidate) => candidate.name === plan.name)
      if (!tool) continue
      const started = Date.now()
      try {
        const output = await tool.invoke(plan.input)
        evidenceResults.push({ tool: plan.name, data: contentToJson(output) })
        traces.push({ tool: plan.name, input: plan.input, durationMs: Date.now() - started, status: "completed" })
      } catch (error) {
        traces.push({ tool: plan.name, input: plan.input, durationMs: Date.now() - started, status: "failed" })
        throw error
      }
    }
    const mode = evidenceResults.map((item) => item.data.dataMode).find((value): value is string => typeof value === "string")
    return {
      answer: evidenceResults.map(({ tool, data }) => explainTool(tool, data)).join("\n\n"),
      provider: "langchain-mcp-rag-deterministic",
      tools: traces,
      context: citedContext,
      dataMode: mode,
      groundedAt: new Date().toISOString(),
    }
  } finally {
    await mcp.close()
  }
}
