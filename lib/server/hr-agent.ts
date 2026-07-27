import { env } from "cloudflare:workers"
import { MultiServerMCPClient } from "@langchain/mcp-adapters"
import { ChatOpenAI } from "@langchain/openai"
import { createAgent } from "langchain"

import type { HrFilters } from "@/lib/hr-types"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"

type ToolTrace = {
  tool: string
  input: HrFilters & { employeeId?: string }
  durationMs: number
  status: "completed" | "failed"
}

type AgentAnswer = {
  answer: string
  provider: string
  tools: ToolTrace[]
  groundedAt: string
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

function topLabel(value: unknown): { label: string; value: number } | null {
  if (!Array.isArray(value) || !value.length) return null
  const first = value[0] as { label?: unknown; value?: unknown }
  return typeof first.label === "string" && typeof first.value === "number" ? { label: first.label, value: first.value } : null
}

function numberValue(data: Record<string, unknown>, key: string): number {
  return typeof data[key] === "number" ? data[key] : 0
}

function explainTool(toolName: string, data: Record<string, unknown>): string {
  if (toolName === "executive_summary") {
    const kpis = (data.kpis ?? {}) as Record<string, unknown>
    const insights = Array.isArray(data.insights) ? data.insights.map(String) : []
    return `The selected workforce view contains **${numberValue(kpis, "activeEmployees")} active employees**, ${numberValue(kpis, "hires")} hires, **${numberValue(kpis, "attritionRate")}% attrition**, ${numberValue(kpis, "leaveDays")} approved leave days, **${numberValue(kpis, "trainingCompletionRate")}% training completion**, and ${numberValue(kpis, "promotions")} promotions.\n\n${insights.map((item) => `- ${item}`).join("\n")}`
  }
  if (toolName === "analyze_hiring") {
    const source = topLabel(data.bySource)
    const department = topLabel(data.byDepartment)
    return `Hiring produced **${numberValue(data, "totalHired")} completed hires** with an average time-to-hire of **${numberValue(data, "averageTimeToHire")} days**.${source ? ` ${source.label} was the largest source (${source.value} hires).` : ""}${department ? ` ${department.label} hired the most (${department.value}).` : ""} Treat source volume as one signal—quality-of-hire and retention should be joined before reallocating spend.`
  }
  if (toolName === "analyze_attrition") {
    const department = topLabel(data.byDepartment)
    const risks = Array.isArray(data.highRiskEmployees) ? data.highRiskEmployees.length : 0
    return `There were **${numberValue(data, "totalExits")} exits** and an attrition rate of **${numberValue(data, "rate")}%**: ${numberValue(data, "voluntary")} voluntary and ${numberValue(data, "involuntary")} involuntary.${department ? ` ${department.label} recorded the most exits (${department.value}).` : ""} ${risks} high-risk historical model records are available for human review. Risk scores are not employment decisions.`
  }
  if (toolName === "analyze_leave") {
    const type = topLabel(data.byType)
    const department = topLabel(data.byDepartment)
    return `Approved leave totals **${numberValue(data, "totalDays")} days**, averaging ${numberValue(data, "averageDaysPerEmployee")} days per employee with leave. ${numberValue(data, "pending")} requests are pending.${type ? ` ${type.label} is the largest leave category (${type.value} days).` : ""}${department ? ` ${department.label} has the highest leave-day total (${department.value}).` : ""} Leave use should be read as a capacity-planning signal, not an adverse employee signal.`
  }
  if (toolName === "analyze_training") {
    const program = topLabel(data.byProgram)
    return `Training completion is **${numberValue(data, "completionRate")}%** across ${numberValue(data, "totalHours")} assigned hours, with an average completed assessment score of ${numberValue(data, "averageScore")}. **${numberValue(data, "requiringMandatoryTraining")} mandatory assignments need attention**.${program ? ` ${program.label} accounts for the most assigned hours (${program.value}).` : ""}`
  }
  if (toolName === "analyze_promotions") {
    const department = topLabel(data.byDepartment)
    return `The selected data contains **${numberValue(data, "total")} promotions** (${numberValue(data, "rate")}% of active employees), with ${numberValue(data, "averageMonthsToPromotion")} average months between promotions. **${numberValue(data, "withoutPromotionOver36Months")} employees with 3+ years' tenure have no promotion record**.${department ? ` ${department.label} recorded the most promotions (${department.value}).` : ""} Check data completeness and role ladders before interpreting this as stalled progression.`
  }
  if (toolName === "data_quality") {
    const gaps = Array.isArray(data.gaps) ? data.gaps.map(String) : []
    return gaps.length ? `The analytics warehouse is still in demo mode for: ${gaps.join(", ")}. Import those domains before using the numbers for operational decisions.` : "All six HR domains contain imported operational data."
  }
  if (toolName === "employee_drilldown") {
    return data.employee ? `I found the employee record and related operational history. Review the employee-level rows in the returned evidence with appropriate HR access controls.` : "No matching employee was found in the current filtered dataset."
  }
  return "The requested analysis completed."
}

function selectTools(message: string): string[] {
  const text = message.toLowerCase()
  const selected: string[] = []
  if (/hire|hiring|recruit|time.to.hire|source/.test(text)) selected.push("analyze_hiring")
  if (/attrition|turnover|exit|retention|risk/.test(text)) selected.push("analyze_attrition")
  if (/leave|pto|absence|vacation|sick/.test(text)) selected.push("analyze_leave")
  if (/training|learning|course|assessment|mandatory/.test(text)) selected.push("analyze_training")
  if (/promotion|promote|career|progression|mobility/.test(text)) selected.push("analyze_promotions")
  if (/quality|demo|import|source data|coverage/.test(text)) selected.push("data_quality")
  const employeeMatch = text.match(/(?:employee|id)\s*[:#-]?\s*(emp[-_ ]?\d+|ibm[-_ ]?\d+)/i)
  if (employeeMatch) selected.unshift("employee_drilldown")
  if (!selected.length || /executive|summary|brief|overview|company|all/.test(text)) selected.unshift("executive_summary")
  return [...new Set(selected)].slice(0, 3)
}

async function inferFilters(message: string): Promise<HrFilters & { employeeId?: string }> {
  const analytics = await getWorkforceAnalytics()
  const lower = message.toLowerCase()
  const department = analytics.dimensions.departments.find((value) => lower.includes(value.toLowerCase()))
  const jobTitle = analytics.dimensions.jobTitles.find((value) => lower.includes(value.toLowerCase()))
  const location = analytics.dimensions.locations.find((value) => lower.includes(value.toLowerCase()))
  const employeeMatch = message.match(/(?:employee|id)\s*[:#-]?\s*([a-z]+[-_ ]?\d+)/i)
  return {
    department,
    jobTitle,
    location,
    period: /quarter/.test(lower) ? "quarter" : /year|annual/.test(lower) ? "year" : "month",
    employeeId: employeeMatch?.[1].replace(/[_ ]/g, "-"),
  }
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

export async function runHrAgent({ message, origin, forwardedHeaders }: { message: unknown; origin: string; forwardedHeaders?: Record<string, string> }): Promise<AgentAnswer> {
  if (typeof message !== "string" || !message.trim() || message.length > 2000) throw new Error("message must contain between 1 and 2,000 characters.")
  const client = new MultiServerMCPClient({
    throwOnLoadError: true,
    prefixToolNameWithServerName: false,
    onConnectionError: "throw",
    mcpServers: {
      laidbackhr: {
        transport: "http",
        url: `${origin}/api/mcp`,
        headers: forwardedHeaders,
        automaticSSEFallback: false,
      },
    },
  })
  const traces: ToolTrace[] = []
  try {
    const tools = await client.getTools()
    const apiKey = getWorkerSecret("OPENAI_API_KEY")
    if (apiKey) {
      const model = new ChatOpenAI({ apiKey, model: getWorkerSecret("OPENAI_MODEL") ?? "gpt-4.1-mini", temperature: 0 })
      const agent = createAgent({
        model,
        tools,
        systemPrompt: "You are LaidbackHR.AI, an executive HR analytics agent. Use the provided MCP tools for every factual claim. State whether data is demo or imported. Give concise, decision-useful explanations, separate association from causation, and require human review for employee-level risk.",
      })
      const started = Date.now()
      const response = await agent.invoke({ messages: [{ role: "user", content: message }] })
      const usedTools = response.messages.flatMap((item) => "tool_calls" in item && Array.isArray(item.tool_calls) ? item.tool_calls.map((call) => call.name) : [])
      for (const tool of [...new Set(usedTools)]) traces.push({ tool, input: {}, durationMs: Date.now() - started, status: "completed" })
      return { answer: messageText(response.messages.at(-1)) || "The agent completed without a text response.", provider: "langchain-agent+openai+mcp", tools: traces, groundedAt: new Date().toISOString() }
    }

    const selected = selectTools(message)
    const filters = await inferFilters(message)
    const cleanFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined)) as HrFilters & { employeeId?: string }
    const evidence: Array<{ tool: string; data: Record<string, unknown> }> = []
    for (const name of selected) {
      const selectedTool = tools.find((tool) => tool.name === name)
      if (!selectedTool) continue
      const input = name === "data_quality" ? {} : name === "employee_drilldown" ? { ...cleanFilters, employeeId: cleanFilters.employeeId ?? "missing" } : cleanFilters
      const started = Date.now()
      try {
        const output = await selectedTool.invoke(input)
        evidence.push({ tool: name, data: contentToJson(output) })
        traces.push({ tool: name, input, durationMs: Date.now() - started, status: "completed" })
      } catch (error) {
        traces.push({ tool: name, input, durationMs: Date.now() - started, status: "failed" })
        throw error
      }
    }
    const answer = evidence.map(({ tool, data }) => explainTool(tool, data)).join("\n\n")
    return { answer: `${answer}\n\n_MCP evidence retrieved through LangChain. ${apiKey ? "LLM synthesis enabled." : "Deterministic synthesis is active; no employee data was sent to an external model."}_`, provider: "langchain-mcp-grounded-agent", tools: traces, groundedAt: new Date().toISOString() }
  } finally {
    await client.close()
  }
}
