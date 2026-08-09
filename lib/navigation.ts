export function safeReturnTo(value: string | null | undefined, fallback = ""): string {
  if (!value || value.length > 1800 || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) return fallback
  return value
}

export function withReturnTo(href: string, returnTo: string): string {
  const safe = safeReturnTo(returnTo)
  if (!safe || !href.startsWith("/") || href.startsWith("//")) return href
  const hashIndex = href.indexOf("#")
  const base = hashIndex >= 0 ? href.slice(0, hashIndex) : href
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : ""
  const queryIndex = base.indexOf("?")
  const path = queryIndex >= 0 ? base.slice(0, queryIndex) : base
  const params = new URLSearchParams(queryIndex >= 0 ? base.slice(queryIndex + 1) : "")
  params.set("returnTo", safe)
  return `${path}?${params.toString()}${hash}`
}

export function returnDestinationLabel(href: string): string {
  const path = href.split("?")[0]?.split("#")[0]
  if (path === "/") return "Home"
  const labels: Record<string, string> = {
    "/people": "People",
    "/inbox": "Inbox",
    "/hiring": "Onboarding",
    "/onboarding": "Onboarding",
    "/leaves": "Leaves",
    "/courses": "Learning",
    "/insights": "Insights",
    "/attrition": "Retention risk",
    "/assistant": "AI assistant",
    "/imports": "Data exchange",
    "/access": "Access",
  }
  return labels[path] ?? "previous page"
}

export function searchParamsFromRecord(record: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item))
    else if (value !== undefined) params.set(key, value)
  }
  return params.toString()
}
