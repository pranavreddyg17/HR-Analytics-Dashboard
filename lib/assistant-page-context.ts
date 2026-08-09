export type AssistantPageKey =
  | "home"
  | "people"
  | "person"
  | "inbox"
  | "hiring"
  | "leaves"
  | "courses"
  | "insights"
  | "attrition"
  | "imports"
  | "access"
  | "workspace"

export type AssistantPageContext = {
  key: AssistantPageKey
  route: string
  label: string
  filters: Record<string, string>
}

const pageLabels: Record<Exclude<AssistantPageKey, "person" | "workspace">, string> = {
  home: "Home",
  people: "People",
  inbox: "Inbox",
  hiring: "Hiring",
  leaves: "Leaves",
  courses: "Assign courses",
  insights: "Insights",
  attrition: "Attrition risk",
  imports: "Import / export data",
  access: "Access",
}

const routeKeys: Record<string, Exclude<AssistantPageKey, "person" | "workspace">> = {
  "/": "home",
  "/people": "people",
  "/inbox": "inbox",
  "/hiring": "hiring",
  "/leaves": "leaves",
  "/courses": "courses",
  "/insights": "insights",
  "/attrition": "attrition",
  "/risk-review": "attrition",
  "/imports": "imports",
  "/access": "access",
}

const allowedFilterKeys = new Set([
  "department",
  "location",
  "view",
  "type",
  "item",
  "requisition",
  "candidate",
  "request",
  "assignment",
  "section",
])

function safeFilters(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    if (!allowedFilterKeys.has(key) || typeof entry !== "string") return []
    const normalized = entry.trim().slice(0, 100)
    return normalized ? [[key, normalized]] : []
  }))
}

export function resolveAssistantPageContext(pathname: string, filters?: unknown): AssistantPageContext {
  const route = pathname.split("?")[0]?.replace(/\/+$/, "") || "/"
  if (route.startsWith("/people/")) {
    const employeeId = decodeURIComponent(route.slice("/people/".length)).trim().slice(0, 80)
    return {
      key: "person",
      route,
      label: employeeId ? `Employee profile · ${employeeId}` : "Employee profile",
      filters: { ...safeFilters(filters), ...(employeeId ? { employeeId } : {}) },
    }
  }
  const key = routeKeys[route]
  if (!key) return { key: "workspace", route, label: "HR workspace", filters: safeFilters(filters) }
  return { key, route, label: pageLabels[key], filters: safeFilters(filters) }
}

export function normalizeAssistantPageContext(value: unknown): AssistantPageContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const input = value as Record<string, unknown>
  if (typeof input.route !== "string" || input.route.length > 180 || !input.route.startsWith("/")) return undefined
  return resolveAssistantPageContext(input.route, input.filters)
}

export function assistantPagePrompts(context: AssistantPageContext): string[] {
  const prompts: Record<AssistantPageKey, string[]> = {
    home: ["Summarize my decisions and overdue work", "What should I review first today?"],
    people: ["Summarize this directory and its data quality", "Which people records need operational follow-up?"],
    person: ["Summarize this employee record", "What open HR work is linked to this employee?"],
    inbox: ["Summarize decisions and exceptions in this queue", "What should I act on first?"],
    hiring: ["Summarize recruiting decisions and overdue follow-ups", "Which requisitions need action next?"],
    leaves: ["Summarize pending leave decisions and coverage exceptions", "Which leave requests need action next?"],
    courses: ["Summarize overdue and mandatory learning work", "Which assignments need follow-up next?"],
    insights: ["Summarize open workforce exceptions", "Which insight actions are overdue?"],
    attrition: ["Summarize the current retention signals", "Which cohort should HR review first?"],
    imports: ["Summarize data coverage and quality issues", "Which HR domain needs data attention?"],
    access: ["Summarize workspace access", "What access administration should be reviewed?"],
    workspace: ["Summarize the current workforce and open HR work", "What should HR review next?"],
  }
  return prompts[context.key]
}
