import { z } from "zod"

import type { AssistantPageContext } from "@/lib/assistant-page-context"
import { generateAzureJson } from "@/lib/server/azure-ai"
import type {
  AgentHistoryMessage,
  HrToolName,
  PlanPurpose,
  ToolPlan,
} from "@/lib/server/hr-agent-intent"

type Dimensions = {
  departments: string[]
  jobTitles: string[]
  locations: string[]
}

type FallbackIntent = {
  plans: ToolPlan[]
  inScope: boolean
  isFollowUp: boolean
  contextQuery: string
}

type ModelPlan = {
  inScope: boolean
  contextQuery: string
  plans: Array<{
    tool: HrToolName
    purpose: PlanPurpose
    scope: string | null
    queue: string | null
    domain: string | null
    metric: string | null
    recordScope: string | null
    query: string | null
    employeeIds: string[]
    includeExplanations: boolean | null
    includeRecruitingHandoff: boolean | null
    department: string | null
    jobTitle: string | null
    location: string | null
    from: string | null
    to: string | null
    period: string | null
    itemId: string | null
    employeeId: string | null
    status: string | null
    limit: number | null
  }>
}

const toolNames = [
  "workforce_overview",
  "compare_departments",
  "analyze_attrition_signals",
  "review_people_operations",
  "find_employee_records",
  "review_work_queue",
  "review_onboarding_readiness",
  "review_capability_plan",
  "review_exit_and_asset_operations",
] as const

const purposes = [
  "workforce_summary",
  "manager_concentration",
  "replacement_coverage",
  "department_comparison",
  "attrition_summary",
  "attrition_records",
  "attrition_record_explanations",
  "attrition_record_retention_plan",
  "attrition_retention_strategy",
  "attrition_drivers",
  "retention_mobility_context",
  "retention_learning_context",
  "people_operations",
  "employee_count",
  "employee_lookup",
  "work_queue_review",
  "directory_summary",
  "capability_recommendations",
  "onboarding_readiness",
  "exit_asset_operations",
] as const

const modelPlanSchema = z.object({
  inScope: z.boolean(),
  contextQuery: z.string().trim().min(1).max(600),
  plans: z.array(z.object({
    tool: z.enum(toolNames),
    purpose: z.enum(purposes),
    scope: z.string().nullable(),
    queue: z.string().nullable(),
    domain: z.string().nullable(),
    metric: z.string().nullable(),
    recordScope: z.string().nullable(),
    query: z.string().nullable(),
    employeeIds: z.array(z.string()),
    includeExplanations: z.boolean().nullable(),
    includeRecruitingHandoff: z.boolean().nullable(),
    department: z.string().nullable(),
    jobTitle: z.string().nullable(),
    location: z.string().nullable(),
    from: z.string().nullable(),
    to: z.string().nullable(),
    period: z.string().nullable(),
    itemId: z.string().nullable(),
    employeeId: z.string().nullable(),
    status: z.string().nullable(),
    limit: z.number().int().nullable(),
  })).max(3),
})

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    inScope: { type: "boolean" },
    contextQuery: { type: "string" },
    plans: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          tool: { type: "string", enum: [...toolNames] },
          purpose: { type: "string", enum: [...purposes] },
          scope: { type: ["string", "null"] },
          queue: { type: ["string", "null"] },
          domain: { type: ["string", "null"] },
          metric: { type: ["string", "null"] },
          recordScope: { type: ["string", "null"] },
          query: { type: ["string", "null"] },
          employeeIds: { type: "array", maxItems: 20, items: { type: "string" } },
          includeExplanations: { type: ["boolean", "null"] },
          includeRecruitingHandoff: { type: ["boolean", "null"] },
          department: { type: ["string", "null"] },
          jobTitle: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          from: { type: ["string", "null"] },
          to: { type: ["string", "null"] },
          period: { type: ["string", "null"] },
          itemId: { type: ["string", "null"] },
          employeeId: { type: ["string", "null"] },
          status: { type: ["string", "null"] },
          limit: { type: ["integer", "null"] },
        },
        required: [
          "tool", "purpose", "scope", "queue", "domain", "metric", "recordScope", "query",
          "employeeIds", "includeExplanations", "includeRecruitingHandoff", "department", "jobTitle",
          "location", "from", "to", "period", "itemId", "employeeId", "status", "limit",
        ],
      },
    },
  },
  required: ["inScope", "contextQuery", "plans"],
} as const

const defaultPurpose: Record<HrToolName, PlanPurpose> = {
  workforce_overview: "workforce_summary",
  compare_departments: "department_comparison",
  analyze_attrition_signals: "attrition_summary",
  review_people_operations: "people_operations",
  find_employee_records: "employee_lookup",
  review_work_queue: "work_queue_review",
  review_onboarding_readiness: "onboarding_readiness",
  review_capability_plan: "capability_recommendations",
  review_exit_and_asset_operations: "exit_asset_operations",
}

const allowedPurposes: Record<HrToolName, readonly PlanPurpose[]> = {
  workforce_overview: ["workforce_summary", "manager_concentration", "replacement_coverage", "directory_summary"],
  compare_departments: ["department_comparison"],
  analyze_attrition_signals: ["attrition_summary", "attrition_records", "attrition_record_explanations", "attrition_record_retention_plan", "attrition_retention_strategy", "attrition_drivers"],
  review_people_operations: ["people_operations", "retention_mobility_context", "retention_learning_context", "capability_recommendations"],
  find_employee_records: ["employee_count", "employee_lookup"],
  review_work_queue: ["work_queue_review"],
  review_onboarding_readiness: ["onboarding_readiness"],
  review_capability_plan: ["capability_recommendations"],
  review_exit_and_asset_operations: ["exit_asset_operations"],
}

function exactDimension(value: string | null, allowed: string[]): string | undefined {
  if (!value) return undefined
  return allowed.find((item) => item.toLowerCase() === value.trim().toLowerCase())
}

function cleanText(value: string | null, limit: number): string | undefined {
  const cleaned = value?.trim().slice(0, limit)
  return cleaned || undefined
}

function cleanDate(value: string | null): string | undefined {
  const cleaned = cleanText(value, 10)
  return cleaned && /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : undefined
}

function enumValue<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((item) => item === value)
}

function sanitizePlan(plan: ModelPlan["plans"][number], dimensions: Dimensions, pageContext?: AssistantPageContext): ToolPlan | null {
  const limit = Math.max(1, Math.min(20, plan.limit ?? 10))
  const filters = {
    department: exactDimension(plan.department ?? pageContext?.filters.department ?? null, dimensions.departments),
    jobTitle: exactDimension(plan.jobTitle ?? pageContext?.filters.jobTitle ?? null, dimensions.jobTitles),
    location: exactDimension(plan.location ?? pageContext?.filters.location ?? null, dimensions.locations),
    from: cleanDate(plan.from ?? pageContext?.filters.from ?? null),
    to: cleanDate(plan.to ?? pageContext?.filters.to ?? null),
    period: enumValue(plan.period ?? pageContext?.filters.period ?? null, ["month", "quarter", "year"] as const),
  }
  const common = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined))
  const purpose = allowedPurposes[plan.tool].includes(plan.purpose) ? plan.purpose : defaultPurpose[plan.tool]

  if (plan.tool === "workforce_overview") return { name: plan.tool, input: common, purpose, limit }
  if (plan.tool === "compare_departments") {
    const metric = enumValue(plan.metric, ["headcount", "hires", "exits", "leave_days", "training_hours", "promotions"] as const)
    return { name: plan.tool, input: { ...common, metric: metric ?? "headcount" }, purpose, limit }
  }
  if (plan.tool === "analyze_attrition_signals") {
    const recordScope = enumValue(plan.recordScope, ["summary", "exited", "high_risk", "all"] as const) ?? "summary"
    const employeeIds = [...new Set(plan.employeeIds.map((item) => item.trim().toUpperCase()).filter(Boolean))].slice(0, 20)
    return {
      name: plan.tool,
      input: {
        ...common,
        recordScope,
        ...(cleanText(plan.query, 120) ? { query: cleanText(plan.query, 120) } : {}),
        ...(employeeIds.length ? { employeeIds } : {}),
        includeExplanations: plan.includeExplanations === true,
        limit,
      },
      purpose,
      limit,
    }
  }
  if (plan.tool === "review_people_operations") {
    const domain = enumValue(plan.domain, ["hiring", "leave", "training", "promotions"] as const)
    if (!domain) return null
    const employeeIds = [...new Set(plan.employeeIds.map((item) => item.trim().toUpperCase()).filter(Boolean))].slice(0, 20)
    return { name: plan.tool, input: { ...common, domain, ...(employeeIds.length ? { employeeIds } : {}) }, purpose, limit }
  }
  if (plan.tool === "find_employee_records") {
    return {
      name: plan.tool,
      input: {
        ...common,
        query: cleanText(plan.query, 120) ?? cleanText(plan.employeeId, 80) ?? "",
        ...(cleanText(plan.status, 60) ? { status: cleanText(plan.status, 60) } : {}),
        limit,
      },
      purpose,
      limit,
    }
  }
  if (plan.tool === "review_work_queue") {
    const pageScope = pageContext && ["home", "people", "person", "inbox", "hiring", "leaves", "courses", "insights", "exits"].includes(pageContext.key)
      ? pageContext.key
      : "inbox"
    const scope = enumValue(plan.scope, ["home", "people", "person", "inbox", "hiring", "leaves", "courses", "insights", "exits"] as const) ?? pageScope
    const queue = enumValue(plan.queue ?? pageContext?.filters.view ?? null, ["my_work", "decisions", "overdue", "managers", "employees", "open", "completed"] as const)
    const domain = enumValue(plan.domain ?? pageContext?.filters.type ?? null, ["leave", "hiring", "training", "insight", "reimbursement", "case", "onboarding", "offboarding"] as const)
    const itemId = cleanText(plan.itemId, 120)
      ?? cleanText(pageContext?.filters.item ?? pageContext?.filters.requisition ?? pageContext?.filters.request ?? pageContext?.filters.assignment ?? null, 120)
    const employeeId = cleanText(plan.employeeId, 80) ?? cleanText(pageContext?.filters.employeeId ?? null, 80)
    return {
      name: plan.tool,
      input: {
        scope,
        ...(queue ? { queue } : {}),
        ...(domain ? { domain } : {}),
        ...(itemId ? { itemId } : {}),
        ...(employeeId ? { employeeId } : {}),
        limit,
      },
      purpose,
      limit,
    }
  }
  if (plan.tool === "review_onboarding_readiness") {
    return { name: plan.tool, input: { ...common, includeRecruitingHandoff: plan.includeRecruitingHandoff !== false, limit }, purpose, limit }
  }
  if (plan.tool === "review_exit_and_asset_operations") {
    const domain = enumValue(plan.domain, ["assets", "exits", "workforce_status"] as const) ?? "exits"
    return {
      name: plan.tool,
      input: {
        domain,
        ...(cleanText(plan.query, 120) ? { query: cleanText(plan.query, 120) } : {}),
        ...(cleanText(plan.status, 60) ? { status: cleanText(plan.status, 60) } : {}),
        ...(domain === "exits" ? { horizon: 90 } : {}),
        limit,
      },
      purpose,
      limit,
    }
  }
  return { name: plan.tool, input: { ...common, limit }, purpose, limit }
}

function plannerPrompt(input: {
  query: string
  history: AgentHistoryMessage[]
  pageContext?: AssistantPageContext
  dimensions: Dimensions
}): string {
  const history = input.history.slice(-6).map((message) => ({
    role: message.role,
    content: message.content.slice(0, 1_200),
    completedTools: message.tools?.filter((tool) => tool.status === "completed").map((tool) => ({
      tool: tool.tool,
      input: tool.input,
      employeeIds: tool.resultContext?.employeeIds,
    })),
  }))
  return JSON.stringify({
    question: input.query,
    page: input.pageContext ?? null,
    recentConversation: history,
    validDimensions: input.dimensions,
  })
}

const system = `You are the planning layer for a grounded enterprise HR copilot. Select the smallest sufficient set of read-only tools. The database tools provide facts; Azure AI Search provides definitions and operating guidance later.

Tool routing:
- review_work_queue: decisions, exceptions, owners, overdue work, or the current Home/Inbox/operations page.
- workforce_overview: headcount, data quality, cross-domain workforce summary, manager concentration, replacement coverage, or Insights.
- compare_departments: a single normalized department comparison.
- analyze_attrition_signals: observed exits, model review cohorts, contributors, or retention planning.
- review_people_operations: hiring, leave, learning, or promotions.
- find_employee_records: named people, employee IDs, directory searches, or profile facts.
- review_onboarding_readiness: new joiners and recruiting-to-onboarding handoffs.
- review_capability_plan: role skills, course evidence, and governed cohort learning recommendations.
- review_exit_and_asset_operations: confirmed/scheduled employee exits, offboarding tasks, device custody, asset lifecycle, warranty, or replacement exceptions.

Rules:
- Treat the current page and its validated filters as scope, never as employee search text.
- Resolve explicit follow-ups from the recent completed tool context, preserving employee IDs.
- Use at most three tools. Never invent an employee ID or dimension value.
- Use recordScope high_risk only for an explicit model-risk request, exited for former employees, and summary for aggregate questions.
- For a selected attrition cohort asking why or what to do, request explanations and preserve the selected IDs.
- Use work_queue for actionable decisions; do not substitute aggregate analytics.
- Never use attrition-model scores to answer a question about confirmed departures. Use exit operations for known exits and attrition signals only for predicted risk.
- Set inScope false only when the request is unrelated to HR, workforce, employee service, analytics, or supported workflows.
- This planner is read-only. It cannot approve, reject, change pay, assign training, schedule meetings, or make an employment decision.`

export function shouldUseAzurePlanner(query: string, fallback: FallbackIntent, pageContext?: AssistantPageContext): boolean {
  if (!fallback.inScope || !fallback.plans.length) return true
  if (pageContext && fallback.plans.length === 1 && ["review_work_queue", "review_onboarding_readiness", "review_capability_plan"].includes(fallback.plans[0].name)) return false
  if (fallback.isFollowUp) return true
  if (/\b(?:and|also|across|then|based on|prioriti[sz]e|recommend|explain|why|plan|what should|how should)\b/i.test(query)) return true
  if (query.trim().split(/\s+/).length > 16) return true
  return Boolean(pageContext && !["home", "inbox"].includes(pageContext.key) && /summari[sz]e|what needs|what should/i.test(query))
}

export async function planHrAgentWithAzure(input: {
  query: string
  history: AgentHistoryMessage[]
  pageContext?: AssistantPageContext
  dimensions: Dimensions
}): Promise<FallbackIntent | null> {
  const generated = await generateAzureJson<ModelPlan>({
    system,
    user: plannerPrompt(input),
    schemaName: "laidbackhr_agent_plan",
    schema: jsonSchema,
    maxOutputTokens: 1_500,
  }).catch(() => null)
  const parsed = modelPlanSchema.safeParse(generated)
  if (!parsed.success) return null
  const plans = parsed.data.plans
    .map((plan) => sanitizePlan(plan, input.dimensions, input.pageContext))
    .filter((plan): plan is ToolPlan => plan !== null)
  return {
    plans,
    inScope: parsed.data.inScope && plans.length > 0,
    isFollowUp: input.history.length > 0,
    contextQuery: parsed.data.contextQuery,
  }
}
