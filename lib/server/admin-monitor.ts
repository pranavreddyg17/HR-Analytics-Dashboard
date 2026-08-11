import { DefaultAzureCredential } from "@azure/identity"

import { cachedAnalyticsRead } from "@/lib/server/analytics-cache"
import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { runtimeEnv } from "@/lib/server/runtime-env"

type ProviderState<T> = { status: "ready"; data: T } | { status: "unavailable"; reason: string }

export type AdminMonitor = {
  generatedAt: string
  application: ProviderState<{ requests: number; failedRequests: number; failureRate: number; averageMs: number; p95Ms: number }>
  cost: ProviderState<{ monthToDate: number; currency: string; periodStart: string; periodEnd: string; byService: Array<{ service: string; cost: number }> }>
  usage: ProviderState<{
    users: { total: number; active30d: number }
    work: { open: number; overdue: number; completed30d: number }
    integrations: { requests24h: number; failed24h: number; averageMs: number; p95Ms: number; activeClients: number }
    imports: { completed30d: number; failed30d: number; lastCompletedAt: string | null }
  }>
}

const credential = new DefaultAzureCredential()

function unavailable<T>(error: unknown): ProviderState<T> {
  return { status: "unavailable", reason: error instanceof Error ? error.message.slice(0, 240) : "Provider unavailable." }
}

async function azureToken(scope: string): Promise<string> {
  const token = await credential.getToken(scope)
  if (!token?.token) throw new Error("Managed identity token was not issued.")
  return token.token
}

async function applicationMetrics(): Promise<AdminMonitor["application"]> {
  try {
    const workspaceId = runtimeEnv.AZURE_LOG_ANALYTICS_WORKSPACE_ID
    if (!workspaceId) throw new Error("Log Analytics workspace is not configured.")
    const token = await azureToken("https://api.loganalytics.azure.com/.default")
    const response = await fetch(`https://api.loganalytics.azure.com/v1/workspaces/${encodeURIComponent(workspaceId)}/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: "AppRequests | where TimeGenerated >= ago(24h) | summarize requests=count(), failed=countif(Success == false), averageMs=avg(DurationMs), p95Ms=percentile(DurationMs, 95)" }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    })
    if (!response.ok) throw new Error(`Azure Monitor returned ${response.status}. Grant the web app Monitoring Reader on Laidback.ai.`)
    const body = await response.json() as { tables?: Array<{ rows?: unknown[][] }> }
    const row = body.tables?.[0]?.rows?.[0] ?? [0, 0, 0, 0]
    const requests = Number(row[0] ?? 0)
    const failedRequests = Number(row[1] ?? 0)
    return { status: "ready", data: { requests, failedRequests, failureRate: requests ? failedRequests / requests : 0, averageMs: Number(row[2] ?? 0), p95Ms: Number(row[3] ?? 0) } }
  } catch (error) { return unavailable(error) }
}

async function costMetrics(): Promise<AdminMonitor["cost"]> {
  try {
    const subscriptionId = runtimeEnv.AZURE_SUBSCRIPTION_ID
    const resourceGroup = runtimeEnv.AZURE_RESOURCE_GROUP
    if (!subscriptionId || !resourceGroup) throw new Error("Azure resource scope is not configured.")
    const token = await azureToken("https://management.azure.com/.default")
    const scope = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`
    const response = await fetch(`https://management.azure.com${scope}/providers/Microsoft.CostManagement/query?api-version=2025-03-01`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        type: "ActualCost",
        timeframe: "MonthToDate",
        dataset: {
          granularity: "None",
          aggregation: { totalCost: { name: "Cost", function: "Sum" } },
          grouping: [{ type: "Dimension", name: "ServiceName" }],
        },
      }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    })
    if (!response.ok) throw new Error(`Azure Cost Management returned ${response.status}. Grant the web app Cost Management Reader on Laidback.ai.`)
    const body = await response.json() as { properties?: { rows?: unknown[][]; columns?: Array<{ name?: string }> } }
    const columns = body.properties?.columns?.map((column) => column.name ?? "") ?? []
    const costIndex = columns.findIndex((name) => name.toLowerCase() === "cost")
    const serviceIndex = columns.findIndex((name) => name.toLowerCase() === "servicename")
    const currencyIndex = columns.findIndex((name) => name.toLowerCase() === "currency")
    const byService = (body.properties?.rows ?? []).map((row) => ({ service: String(row[serviceIndex] ?? "Other"), cost: Number(row[costIndex] ?? 0) })).sort((a, b) => b.cost - a.cost)
    const now = new Date()
    return { status: "ready", data: {
      monthToDate: byService.reduce((sum, row) => sum + row.cost, 0),
      currency: String(body.properties?.rows?.[0]?.[currencyIndex] ?? "USD"),
      periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      periodEnd: now.toISOString(),
      byService,
    } }
  } catch (error) { return unavailable(error) }
}

async function internalUsage(): Promise<AdminMonitor["usage"]> {
  try {
    const database = await ensureHrDatabase()
    const [users, work, integrations, clients, imports] = await Promise.all([
      database.prepare(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE last_login_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '30 days') AS active_30d FROM app_users WHERE status='active'`).first<{ total: number; active_30d: number }>(),
      database.prepare(`SELECT COUNT(*) FILTER (WHERE completed_at IS NULL) AS open,
        COUNT(*) FILTER (WHERE completed_at IS NULL AND due_at IS NOT NULL AND due_at::timestamptz < CURRENT_TIMESTAMP) AS overdue,
        COUNT(*) FILTER (WHERE completed_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '30 days') AS completed_30d FROM workflow_requests`).first<{ open: number; overdue: number; completed_30d: number }>(),
      database.prepare(`SELECT COUNT(*) AS requests_24h, COUNT(*) FILTER (WHERE status_code >= 400) AS failed_24h,
        COALESCE(AVG(duration_ms),0) AS average_ms, COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms),0) AS p95_ms
        FROM integration_api_audit WHERE created_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '24 hours'`).first<{ requests_24h: number; failed_24h: number; average_ms: number; p95_ms: number }>(),
      database.prepare("SELECT COUNT(*) AS count FROM integration_clients WHERE status='active' AND expires_at::timestamptz > CURRENT_TIMESTAMP").first<{ count: number }>(),
      database.prepare(`SELECT COUNT(*) FILTER (WHERE status='completed' AND completed_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '30 days') AS completed_30d,
        COUNT(*) FILTER (WHERE status='failed' AND imported_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '30 days') AS failed_30d,
        MAX(completed_at) FILTER (WHERE status='completed') AS last_completed_at FROM data_imports`).first<{ completed_30d: number; failed_30d: number; last_completed_at: string | null }>(),
    ])
    return { status: "ready", data: {
      users: { total: Number(users?.total ?? 0), active30d: Number(users?.active_30d ?? 0) },
      work: { open: Number(work?.open ?? 0), overdue: Number(work?.overdue ?? 0), completed30d: Number(work?.completed_30d ?? 0) },
      integrations: { requests24h: Number(integrations?.requests_24h ?? 0), failed24h: Number(integrations?.failed_24h ?? 0), averageMs: Number(integrations?.average_ms ?? 0), p95Ms: Number(integrations?.p95_ms ?? 0), activeClients: Number(clients?.count ?? 0) },
      imports: { completed30d: Number(imports?.completed_30d ?? 0), failed30d: Number(imports?.failed_30d ?? 0), lastCompletedAt: imports?.last_completed_at ?? null },
    } }
  } catch (error) { return unavailable(error) }
}

export function getAdminMonitor(): Promise<AdminMonitor> {
  return cachedAnalyticsRead("admin-monitor:v1", async () => {
    const [application, cost, usage] = await Promise.all([applicationMetrics(), costMetrics(), internalUsage()])
    return { generatedAt: new Date().toISOString(), application, cost, usage }
  })
}
