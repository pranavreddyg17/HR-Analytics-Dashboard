import { runtimeEnv } from "@/lib/server/runtime-env"

type CacheEntry<T> = {
  expiresAt: number
  revision: number
  value: Promise<T>
}

const entries = new Map<string, CacheEntry<unknown>>()
let revision = 0

function ttlMs(): number {
  if (runtimeEnv.NODE_ENV !== "production") return 0
  const configured = Number(runtimeEnv.ANALYTICS_CACHE_TTL_MS ?? 15_000)
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 0), 60_000) : 15_000
}

/**
 * Short, process-local cache for read-only BI projections.
 *
 * Azure App Service currently runs one B1 worker, so this removes repeated
 * 11k-row projections without adding Redis cost. Database mutations that can
 * affect a dashboard invalidate the cache immediately; the TTL bounds stale
 * data if the app is scaled to more than one worker later.
 */
export function cachedAnalyticsRead<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const ttl = ttlMs()
  if (!ttl) return loader()
  const now = Date.now()
  const current = entries.get(key) as CacheEntry<T> | undefined
  if (current && current.revision === revision && current.expiresAt > now) return current.value

  const value = loader().catch((error) => {
    const failed = entries.get(key)
    if (failed?.value === value) entries.delete(key)
    throw error
  })
  entries.set(key, { expiresAt: now + ttl, revision, value })
  if (entries.size > 80) entries.delete(entries.keys().next().value as string)
  return value
}

export function invalidateAnalyticsReads(): void {
  revision += 1
  entries.clear()
}

const analyticsTables = [
  "employees",
  "job_profiles",
  "hiring_records",
  "hiring_candidates",
  "attrition_events",
  "attrition_model_profiles",
  "leave_records",
  "training_records",
  "course_assignments",
  "learning_courses",
  "promotion_records",
  "employee_compensation",
  "workspace_analytics_settings",
] as const

export function sqlAffectsAnalytics(sql: string): boolean {
  if (!/\b(?:insert\s+into|update|delete\s+from|truncate|alter|create|drop)\b/i.test(sql)) return false
  return analyticsTables.some((table) => new RegExp(`\\b${table}\\b`, "i").test(sql))
}
