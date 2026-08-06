import type { HrFilters } from "@/lib/hr-types"

type HrToolName = "workforce_overview" | "compare_departments" | "analyze_attrition_signals" | "review_people_operations" | "find_employee_records"

type StoredToolContext = {
  tool: string
  status: string
  input?: Record<string, unknown>
  resultContext?: {
    employeeIds?: string[]
    recordScope?: string
  }
}

export type AgentHistoryMessage = {
  role: "user" | "assistant"
  content: string
  tools?: StoredToolContext[]
}

type PlanPurpose =
  | "workforce_summary"
  | "manager_concentration"
  | "replacement_coverage"
  | "department_comparison"
  | "attrition_summary"
  | "attrition_records"
  | "attrition_record_explanations"
  | "attrition_record_retention_plan"
  | "attrition_retention_strategy"
  | "attrition_drivers"
  | "retention_mobility_context"
  | "people_operations"
  | "employee_lookup"

export type ToolPlan = {
  name: HrToolName
  input: Record<string, unknown>
  purpose: PlanPurpose
  limit: number
}

type Topic = "workforce" | "manager_exits" | "replacement" | "attrition" | "hiring" | "leave" | "training" | "promotions" | "employee"

type Dimensions = {
  departments: string[]
  jobTitles: string[]
  locations: string[]
}

type ResolvedHrIntent = {
  plans: ToolPlan[]
  inScope: boolean
  isFollowUp: boolean
  contextQuery: string
}

const scopePattern = /employee|people|workforce|headcount|department|location|manager|hire|hiring|recruit|attrition|turnover|exit|retention|risk|leave|pto|absence|vacation|training|learning|course|mandatory|promotion|career|mobility|data quality|demo|import|summary|brief|company|status|replacement|coverage/i

function directTopic(message: string): Topic | null {
  if (/manager/i.test(message) && /exit|attrition|turnover|retention/i.test(message)) return "manager_exits"
  if (/replacement/i.test(message) && /coverage|gap|pipeline|hiring/i.test(message)) return "replacement"
  if (/promotion|promote|career progression|mobility/i.test(message)) return "promotions"
  if (/attrition|turnover|exit|retention|risk/i.test(message)) return "attrition"
  if (/hire|hiring|recruit|candidate|requisition|offer/i.test(message)) return "hiring"
  if (/leave|pto|absence|vacation|sick/i.test(message)) return "leave"
  if (/training|learning|course|assessment|mandatory|compliance|phishing|safety/i.test(message)) return "training"
  if (/employee|people|person|profile|directory/i.test(message)) return "employee"
  if (/workforce|headcount|company|open hr work|executive summary|executive brief/i.test(message)) return "workforce"
  return null
}

function priorState(history: AgentHistoryMessage[]): { topic: Topic | null; input: Record<string, unknown>; employeeIds: string[]; employeeRecordScope?: string; userMessage: string } {
  const lastUser = history.filter((item) => item.role === "user").at(-1)?.content ?? ""
  const assistant = history.filter((item) => item.role === "assistant" && item.tools?.length).at(-1)
  const trace = assistant?.tools?.find((item) => item.status === "completed")
  const entityTrace = history.slice().reverse().flatMap((item) => item.tools ?? [])
    .find((item) => item.tool === "analyze_attrition_signals" && item.status === "completed" && item.resultContext?.employeeIds?.length)
  const employeeIds = entityTrace?.resultContext?.employeeIds?.filter((value) => typeof value === "string").slice(0, 20) ?? []
  const employeeRecordScope = entityTrace?.resultContext?.recordScope ?? (typeof entityTrace?.input?.recordScope === "string" ? entityTrace.input.recordScope : undefined)
  const shared = { employeeIds, employeeRecordScope, userMessage: lastUser }
  if (!trace) return { topic: directTopic(lastUser), input: {}, ...shared }
  if (trace.tool === "analyze_attrition_signals") return { topic: "attrition", input: trace.input ?? {}, ...shared }
  if (trace.tool === "workforce_overview") return { topic: "workforce", input: trace.input ?? {}, ...shared }
  if (trace.tool === "find_employee_records") return { topic: "employee", input: trace.input ?? {}, ...shared }
  if (trace.tool === "review_people_operations") {
    const domain = trace.input?.domain
    const topic = domain === "hiring" || domain === "leave" || domain === "training" || domain === "promotions" ? domain : null
    return { topic, input: trace.input ?? {}, ...shared }
  }
  if (trace.tool === "compare_departments") {
    const metric = trace.input?.metric
    const topic = metric === "hires" ? "hiring" : metric === "leave_days" ? "leave" : metric === "training_hours" ? "training" : metric === "promotions" ? "promotions" : metric === "exits" ? "attrition" : "workforce"
    return { topic, input: trace.input ?? {}, ...shared }
  }
  return { topic: directTopic(lastUser), input: trace.input ?? {}, ...shared }
}

function isExplicitFollowUp(message: string): boolean {
  const words = message.trim().split(/\s+/).length
  return words <= 20 && /^(?:just|only|and\b|also\b|what about|how about|why\b|explain\b|give me (?:some )?(?:analysis|detail)|show (?:me )?(?:those|them)|those\b|them\b|same\b|top\s+\d+|can you tell me|could (?:this|that|the|their)|what(?:'s| is) driving|what could (?:be )?(?:the )?(?:reason|cause)|what should (?:we|hr)|how should (?:we|hr)|how come)/i.test(message.trim())
}

function requestedLimit(message: string, fallback = 10): number {
  const match = message.match(/\b(?:top|first|limit(?:ed)?(?:\s+to)?|show(?:\s+me)?)\s+(\d{1,2})\b/i)
  const value = match ? Number(match[1]) : fallback
  return Math.max(1, Math.min(20, Number.isFinite(value) ? value : fallback))
}

function recordScope(message: string, priorInput: Record<string, unknown>, followUp: boolean): "summary" | "exited" | "high_risk" | "all" {
  if (/attrition risk|retention risk|high[-\s]?risk|at[-\s]?risk|likely to leave|predicted risk|model risk/i.test(message)) return "high_risk"
  if (/employees? (?:who |that )?(?:left|exited)|former employees?|departures?|terminations?|attrition records?|employees? (?:with|of) attrition/i.test(message)) return "exited"
  if (followUp && ["exited", "high_risk", "all"].includes(String(priorInput.recordScope))) return priorInput.recordScope as "exited" | "high_risk" | "all"
  return "all"
}

function wantsEmployeeRecords(message: string, followUp: boolean, priorInput: Record<string, unknown>): boolean {
  if (/\btop\s+\d+\b/i.test(message)) return true
  if (/\b(?:list|show|find|pull)\b.{0,30}\b(?:employees?|people|records?)\b/i.test(message)) return true
  if (/\b(?:which|who)\b.{0,30}\b(?:employees?|people)\b/i.test(message)) return true
  if (/\bemployees?\b.{0,20}\b(?:attrition|risk|left|exited)\b/i.test(message)) return true
  return followUp && /^(?:just|only|show|top)/i.test(message.trim()) && ["exited", "high_risk", "all"].includes(String(priorInput.recordScope))
}

function wantsExplanation(message: string): boolean {
  return /\bwhy\b|\bexplain|\banalysis\b|\bdrivers?\b|\breasons?\b|\bcauses?\b|\bdriving\b|contributing signals?|what should (?:we|hr) do|recommended actions?/i.test(message)
}

function wantsRetentionPlan(message: string): boolean {
  return /\bprevent\b|\breduce\b|\bmitigate\b|\baddress\b|\bretention plan\b|\baction plan\b|\b360(?:-degree)?\b|skill continuity|technical skills?|downstream impact|what (?:else )?(?:does|gets) affected|best practices?|boost (?:their )?confidence|what should (?:i|we|hr) do|how (?:can|should) (?:i|we|hr) (?:retain|prevent|reduce|address|manage)/i.test(message)
}

function referencesPriorSelection(message: string): boolean {
  return /\b(?:these|those|them|their|listed|above|previous|same)\b|\bthe (?:employees|people|records|profiles|cohort|list)\b/i.test(message)
}

function employeeIdentifier(message: string): string | undefined {
  return message.match(/\b(?:demo-)?emp(?:[-_ ]+[a-z0-9]+|[0-9][a-z0-9]*)\b/i)?.[0]?.replace(/[_ ]/g, "-").toUpperCase()
}

function filtersFor(message: string, dimensions: Dimensions, previousInput: Record<string, unknown>, followUp: boolean): HrFilters {
  const lower = message.toLowerCase()
  const match = (values: string[]) => values.find((value) => lower.includes(value.toLowerCase()))
  const previous = (key: "department" | "jobTitle" | "location") => followUp && typeof previousInput[key] === "string" ? previousInput[key] as string : undefined
  return {
    department: match(dimensions.departments) ?? previous("department"),
    jobTitle: match(dimensions.jobTitles) ?? previous("jobTitle"),
    location: match(dimensions.locations) ?? previous("location"),
    period: /quarter/i.test(message) ? "quarter" : /year|annual/i.test(message) ? "year" : followUp && ["month", "quarter", "year"].includes(String(previousInput.period)) ? previousInput.period as HrFilters["period"] : "month",
  }
}

function cleanFilters(filters: HrFilters): Record<string, unknown> {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined))
}

function comparisonMetric(topic: Topic): "headcount" | "hires" | "exits" | "leave_days" | "training_hours" | "promotions" {
  if (topic === "hiring") return "hires"
  if (topic === "attrition") return "exits"
  if (topic === "leave") return "leave_days"
  if (topic === "training") return "training_hours"
  if (topic === "promotions") return "promotions"
  return "headcount"
}

export function resolveHrIntent(message: string, history: AgentHistoryMessage[], dimensions: Dimensions): ResolvedHrIntent {
  const query = message.trim()
  const previous = priorState(history)
  const explicitTopic = directTopic(query)
  const followUp = Boolean(previous.topic) && (explicitTopic ? referencesPriorSelection(query) : isExplicitFollowUp(query))
  const topic = explicitTopic ?? (followUp ? previous.topic : null)
  const inScope = Boolean(topic) || scopePattern.test(query) || followUp
  if (!inScope) return { plans: [], inScope: false, isFollowUp: false, contextQuery: query }

  const filters = cleanFilters(filtersFor(query, dimensions, previous.input, followUp))
  const defaultLimit = topic === "manager_exits" ? 5 : 10
  const limit = requestedLimit(query, followUp && typeof previous.input.limit === "number" ? previous.input.limit : defaultLimit)
  const contextQuery = followUp && previous.userMessage ? `${previous.userMessage}\nFollow-up: ${query}` : query

  if (topic === "manager_exits") return { plans: [{ name: "workforce_overview", input: filters, purpose: "manager_concentration", limit }], inScope, isFollowUp: followUp, contextQuery }
  if (topic === "replacement") return { plans: [{ name: "workforce_overview", input: filters, purpose: "replacement_coverage", limit }], inScope, isFollowUp: followUp, contextQuery }
  if (topic === "attrition") {
    const analysis = wantsExplanation(query)
    const retentionPlan = wantsRetentionPlan(query)
    const records = wantsEmployeeRecords(query, followUp, previous.input)
    const identifier = employeeIdentifier(query)
    const priorRecordScope = ["exited", "high_risk", "all"].includes(String(previous.input.recordScope)) ? String(previous.input.recordScope) as "exited" | "high_risk" | "all" : undefined
    const selectedCohort = Boolean(identifier || records || (followUp && (previous.employeeIds.length || priorRecordScope || previous.employeeRecordScope)))
    if (retentionPlan && selectedCohort) {
      const employeeIds = identifier ? [identifier] : previous.employeeIds
      const scope = identifier ? "all" : previous.employeeRecordScope === "high_risk" ? "high_risk" : recordScope(`${query} ${followUp ? previous.userMessage : ""}`, previous.input, followUp)
      return {
        plans: [{
          name: "analyze_attrition_signals",
          input: {
            ...filters,
            recordScope: scope,
            ...(identifier ? { query: identifier } : {}),
            ...(employeeIds.length ? { employeeIds } : {}),
            includeExplanations: true,
            limit: identifier ? 1 : Math.min(limit, employeeIds.length || limit),
          },
          purpose: "attrition_record_retention_plan",
          limit: identifier ? 1 : Math.min(limit, employeeIds.length || limit),
        }],
        inScope,
        isFollowUp: followUp,
        contextQuery,
      }
    }
    if (retentionPlan) return { plans: [{ name: "analyze_attrition_signals", input: { ...filters, recordScope: "summary" }, purpose: "attrition_retention_strategy", limit }], inScope, isFollowUp: followUp, contextQuery }
    const explainRecords = analysis && Boolean(identifier || records || (followUp && (previous.employeeIds.length || priorRecordScope)))
    if (explainRecords) {
      const scope = identifier ? "all" : recordScope(`${query} ${followUp ? previous.userMessage : ""}`, previous.input, followUp)
      const employeeIds = identifier ? [identifier] : previous.employeeIds
      return {
        plans: [{
          name: "analyze_attrition_signals",
          input: {
            ...filters,
            recordScope: scope,
            ...(identifier ? { query: identifier } : {}),
            ...(employeeIds.length ? { employeeIds } : {}),
            includeExplanations: true,
            limit: identifier ? 1 : limit,
          },
          purpose: "attrition_record_explanations",
          limit: identifier ? 1 : limit,
        }],
        inScope,
        isFollowUp: followUp,
        contextQuery,
      }
    }
    if (analysis) return { plans: [{ name: "analyze_attrition_signals", input: { ...filters, recordScope: "summary" }, purpose: "attrition_drivers", limit }], inScope, isFollowUp: followUp, contextQuery }
    if (records) {
      const scope = recordScope(`${query} ${followUp ? previous.userMessage : ""}`, previous.input, followUp)
      return { plans: [{ name: "analyze_attrition_signals", input: { ...filters, recordScope: scope, limit }, purpose: "attrition_records", limit }], inScope, isFollowUp: followUp, contextQuery }
    }
    if (/compare|which departments?|highest|lowest|by department|break ?down/i.test(query) && !/predict|model risk|risk score/i.test(query)) {
      return { plans: [{ name: "compare_departments", input: { ...filters, metric: "exits" }, purpose: "department_comparison", limit }], inScope, isFollowUp: followUp, contextQuery }
    }
    return { plans: [{ name: "analyze_attrition_signals", input: { ...filters, recordScope: "summary" }, purpose: "attrition_summary", limit }], inScope, isFollowUp: followUp, contextQuery }
  }

  if (topic === "hiring" || topic === "leave" || topic === "training" || topic === "promotions") {
    const compare = /compare|which departments?|highest|lowest|by department|break ?down/i.test(query)
      && !(topic === "promotions" && /employees?|mobility|career/i.test(query))
    if (compare) return { plans: [{ name: "compare_departments", input: { ...filters, metric: comparisonMetric(topic) }, purpose: "department_comparison", limit }], inScope, isFollowUp: followUp, contextQuery }
    return { plans: [{ name: "review_people_operations", input: { ...filters, domain: topic }, purpose: "people_operations", limit }], inScope, isFollowUp: followUp, contextQuery }
  }

  if (topic === "employee") {
    const identifier = employeeIdentifier(query)
    const status = /active employees/i.test(query) ? "Active" : undefined
    return { plans: [{ name: "find_employee_records", input: { ...filters, query: identifier ?? query, ...(status ? { status } : {}), limit }, purpose: "employee_lookup", limit }], inScope, isFollowUp: followUp, contextQuery }
  }

  return { plans: [{ name: "workforce_overview", input: filters, purpose: "workforce_summary", limit }], inScope, isFollowUp: followUp, contextQuery }
}
