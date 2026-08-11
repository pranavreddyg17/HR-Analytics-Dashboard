import { DefaultAzureCredential, ManagedIdentityCredential, type TokenCredential } from "@azure/identity"

import {
  AZURE_COST_STALE_MS,
  azureRetryAfterAt,
  isCurrentUtcMonth,
  providerCacheMode,
} from "@/lib/server/admin-provider-cache"
import { cachedAnalyticsRead } from "@/lib/server/analytics-cache"
import { ensureHrDatabase, type Database } from "@/lib/server/hr-repository"
import { runtimeEnv } from "@/lib/server/runtime-env"

type ProviderState<T> = { status: "ready"; data: T } | { status: "unavailable"; reason: string }

type CostSnapshot = {
  monthToDate: number
  currency: string
  periodStart: string
  periodEnd: string
  byService: Array<{ service: string; cost: number }>
}

type CostMetrics = CostSnapshot & {
  refreshedAt: string
  stale: boolean
}

type StoredProviderRow = {
  payload_json: unknown
  fetched_at: string | null
  retry_after_at: string | null
  last_status_code: number | null
}

type CostProviderState = {
  snapshot: CostSnapshot | null
  fetchedAt: number | null
  retryAfterAt: number | null
  lastStatus: number | null
}

class AzureCostRequestError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfterAt: number) {
    super(message)
  }
}

export type AdminMonitor = {
  generatedAt: string
  application: ProviderState<{ requests: number; failedRequests: number; failureRate: number; averageMs: number; p95Ms: number }>
  cost: ProviderState<CostMetrics>
  usage: ProviderState<{
    users: { total: number; active30d: number }
    work: { open: number; overdue: number; completed30d: number }
    integrations: { requests24h: number; failed24h: number; averageMs: number; p95Ms: number; activeClients: number }
    imports: { completed30d: number; failed30d: number; lastCompletedAt: string | null }
  }>
}

// Production runs on App Service with a system-assigned identity. Selecting it
// explicitly avoids walking the developer credential chain on every monitor
// refresh; local development keeps the standard Azure CLI-aware fallback.
const credential: TokenCredential = runtimeEnv.IDENTITY_ENDPOINT || runtimeEnv.MSI_ENDPOINT
  ? new ManagedIdentityCredential()
  : new DefaultAzureCredential()

let costProviderState: CostProviderState | null = null
let costRequest: Promise<AdminMonitor["cost"]> | null = null

function unavailable<T>(error: unknown, fallback: string): ProviderState<T> {
  const message = error instanceof Error ? error.message : ""
  const actionable = /^(Log Analytics workspace|Azure resource scope|Azure Monitor returned|Azure Cost Management returned)/.test(message)
  return { status: "unavailable", reason: actionable ? message : fallback }
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
    // Azure Monitor's current query host uses the legacy Log Analytics OAuth
    // audience. App Service managed identity rejects the host name as a token
    // resource in this tenant, while api.loganalytics.io is the documented
    // service principal for v2 client-credential tokens.
    const token = await azureToken("https://api.loganalytics.io/.default")
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
  } catch (error) {
    return unavailable(error, "Performance telemetry is temporarily unavailable. Verify the web app managed identity can read the Log Analytics workspace.")
  }
}

function timestamp(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseCostSnapshot(value: unknown): CostSnapshot | null {
  let candidate = value
  if (typeof candidate === "string") {
    try { candidate = JSON.parse(candidate) } catch { return null }
  }
  if (!candidate || typeof candidate !== "object") return null
  const record = candidate as Record<string, unknown>
  if (!Number.isFinite(Number(record.monthToDate)) || typeof record.currency !== "string" || typeof record.periodStart !== "string" || typeof record.periodEnd !== "string" || !Array.isArray(record.byService)) return null
  const byService = record.byService.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const cost = Number(row.cost)
    return typeof row.service === "string" && Number.isFinite(cost) ? [{ service: row.service, cost }] : []
  })
  return {
    monthToDate: Number(record.monthToDate),
    currency: record.currency,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    byService,
  }
}

async function readCostProviderState(database: Database): Promise<CostProviderState> {
  const row = await database.prepare(`SELECT payload_json, fetched_at::text, retry_after_at::text, last_status_code
    FROM admin_provider_snapshots WHERE provider='azure-cost'`).first<StoredProviderRow>()
  const snapshot = parseCostSnapshot(row?.payload_json)
  return {
    snapshot,
    fetchedAt: snapshot ? timestamp(row?.fetched_at ?? null) : null,
    retryAfterAt: timestamp(row?.retry_after_at ?? null),
    lastStatus: row?.last_status_code ?? null,
  }
}

async function recordCostSuccess(database: Database, snapshot: CostSnapshot, fetchedAt: number): Promise<void> {
  await database.prepare(`INSERT INTO admin_provider_snapshots(provider, payload_json, fetched_at, retry_after_at, last_status_code, updated_at)
    VALUES ('azure-cost', ?::jsonb, ?, NULL, 200, CURRENT_TIMESTAMP)
    ON CONFLICT(provider) DO UPDATE SET payload_json=EXCLUDED.payload_json, fetched_at=EXCLUDED.fetched_at,
      retry_after_at=NULL, last_status_code=200, updated_at=CURRENT_TIMESTAMP`)
    .bind(JSON.stringify(snapshot), new Date(fetchedAt).toISOString()).run()
}

async function recordCostFailure(database: Database, status: number, retryAfterAt: number): Promise<void> {
  await database.prepare(`INSERT INTO admin_provider_snapshots(provider, retry_after_at, last_status_code, updated_at)
    VALUES ('azure-cost', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(provider) DO UPDATE SET retry_after_at=EXCLUDED.retry_after_at,
      last_status_code=EXCLUDED.last_status_code, updated_at=CURRENT_TIMESTAMP`)
    .bind(new Date(retryAfterAt).toISOString(), status || null).run()
}

async function claimCostRefresh(database: Database, now: number): Promise<boolean> {
  const leaseUntil = new Date(now + 2 * 60 * 1_000).toISOString()
  const claimed = await database.prepare(`INSERT INTO admin_provider_snapshots(provider, retry_after_at, last_status_code, updated_at)
    VALUES ('azure-cost', ?, 102, CURRENT_TIMESTAMP)
    ON CONFLICT(provider) DO UPDATE SET retry_after_at=EXCLUDED.retry_after_at,
      last_status_code=102, updated_at=CURRENT_TIMESTAMP
    WHERE admin_provider_snapshots.retry_after_at IS NULL OR admin_provider_snapshots.retry_after_at <= CURRENT_TIMESTAMP
    RETURNING provider`).bind(leaseUntil).first<{ provider: string }>()
  return claimed?.provider === "azure-cost"
}

function readyCost(state: CostProviderState, stale: boolean): AdminMonitor["cost"] {
  if (!state.snapshot || state.fetchedAt === null) return { status: "unavailable", reason: "Azure cost data has not completed its first refresh." }
  return {
    status: "ready",
    data: { ...state.snapshot, refreshedAt: new Date(state.fetchedAt).toISOString(), stale },
  }
}

function costFailureReason(error: unknown, retryAfterAt: number): string {
  const retry = new Date(retryAfterAt).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })
  if (error instanceof AzureCostRequestError && error.status === 429) return `Azure cost refresh is temporarily throttled. Automatic retry is scheduled after ${retry} UTC.`
  if (error instanceof AzureCostRequestError && error.status === 503) return `Azure cost data is temporarily unavailable. Automatic retry is scheduled after ${retry} UTC.`
  if (error instanceof AzureCostRequestError && [401, 403].includes(error.status)) return "Azure cost access is unavailable. Verify the web app has Cost Management Reader on Laidback.ai."
  return "Azure cost data is temporarily unavailable. The last successful snapshot will be used when available."
}

async function fetchAzureCost(): Promise<CostSnapshot> {
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
  if (!response.ok) {
    const retryAfterAt = [429, 503].includes(response.status) ? azureRetryAfterAt(response.headers) : Date.now() + 6 * 60 * 60 * 1_000
    throw new AzureCostRequestError(response.status, `Azure Cost Management returned ${response.status}.`, retryAfterAt)
  }
  const body = await response.json() as { properties?: { rows?: unknown[][]; columns?: Array<{ name?: string }> } }
  const columns = body.properties?.columns?.map((column) => column.name ?? "") ?? []
  const costIndex = columns.findIndex((name) => name.toLowerCase() === "cost")
  const serviceIndex = columns.findIndex((name) => name.toLowerCase() === "servicename")
  const currencyIndex = columns.findIndex((name) => name.toLowerCase() === "currency")
  if (costIndex < 0 || serviceIndex < 0) throw new Error("Azure Cost Management returned an unexpected result shape.")
  const byService = (body.properties?.rows ?? [])
    .map((row) => ({ service: String(row[serviceIndex] ?? "Other"), cost: Number(row[costIndex] ?? 0) }))
    .filter((row) => Number.isFinite(row.cost))
    .sort((a, b) => b.cost - a.cost)
  const now = new Date()
  return {
    monthToDate: byService.reduce((sum, row) => sum + row.cost, 0),
    currency: String(body.properties?.rows?.[0]?.[currencyIndex] ?? "USD"),
    periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    periodEnd: now.toISOString(),
    byService,
  }
}

async function loadCostMetrics(): Promise<AdminMonitor["cost"]> {
  try {
    const database = await ensureHrDatabase()
    const now = Date.now()
    const state = costProviderState ?? await readCostProviderState(database)
    costProviderState = state
    const currentPeriod = state.snapshot ? isCurrentUtcMonth(state.snapshot.periodStart, now) : false
    const mode = providerCacheMode({ fetchedAt: currentPeriod ? state.fetchedAt : null, retryAfterAt: state.retryAfterAt, now })
    if (mode === "fresh") return readyCost(state, false)
    if (mode === "stale") {
      if (state.lastStatus === 401 || state.lastStatus === 403) return { status: "unavailable", reason: "Azure cost access is unavailable. Verify the web app has Cost Management Reader on Laidback.ai." }
      return readyCost(state, true)
    }
    if (mode === "blocked") return { status: "unavailable", reason: `Azure cost refresh is temporarily delayed. Automatic retry is scheduled after ${new Date(state.retryAfterAt!).toISOString()}.` }

    if (!await claimCostRefresh(database, now)) {
      const current = await readCostProviderState(database)
      costProviderState = current
      if (current.snapshot && isCurrentUtcMonth(current.snapshot.periodStart, now) && current.fetchedAt !== null && current.fetchedAt + AZURE_COST_STALE_MS > now) return readyCost(current, true)
      return { status: "unavailable", reason: "Azure cost refresh is already in progress. Refresh this page again shortly." }
    }

    try {
      const snapshot = await fetchAzureCost()
      const fetchedAt = Date.now()
      await recordCostSuccess(database, snapshot, fetchedAt)
      costProviderState = { snapshot, fetchedAt, retryAfterAt: null, lastStatus: 200 }
      return readyCost(costProviderState, false)
    } catch (error) {
      const retryAfterAt = error instanceof AzureCostRequestError ? error.retryAfterAt : Date.now() + 15 * 60 * 1_000
      const status = error instanceof AzureCostRequestError ? error.status : 0
      await recordCostFailure(database, status, retryAfterAt).catch(() => undefined)
      costProviderState = { ...state, retryAfterAt, lastStatus: status }
      const hasUsableSnapshot = state.snapshot && isCurrentUtcMonth(state.snapshot.periodStart) && state.fetchedAt !== null && state.fetchedAt + AZURE_COST_STALE_MS > Date.now()
      if (hasUsableSnapshot && (status === 0 || status === 429 || status === 503)) return readyCost(costProviderState, true)
      return { status: "unavailable", reason: costFailureReason(error, retryAfterAt) }
    }
  } catch (error) {
    return unavailable(error, "Azure cost data is temporarily unavailable. Verify the database and managed identity configuration.")
  }
}

async function costMetrics(): Promise<AdminMonitor["cost"]> {
  if (costRequest) return costRequest
  const pending = loadCostMetrics()
  costRequest = pending
  try { return await pending } finally {
    if (costRequest === pending) costRequest = null
  }
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
  } catch (error) { return unavailable(error, "Internal usage data is temporarily unavailable.") }
}

export function getAdminMonitor(): Promise<AdminMonitor> {
  return cachedAnalyticsRead("admin-monitor:v1", async () => {
    const [application, cost, usage] = await Promise.all([applicationMetrics(), costMetrics(), internalUsage()])
    return { generatedAt: new Date().toISOString(), application, cost, usage }
  })
}
