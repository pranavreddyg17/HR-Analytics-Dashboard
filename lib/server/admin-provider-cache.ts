export const AZURE_COST_FRESH_MS = 24 * 60 * 60 * 1_000
export const AZURE_COST_STALE_MS = 7 * 24 * 60 * 60 * 1_000

const DEFAULT_BACKOFF_MS = 15 * 60 * 1_000
const MINIMUM_BACKOFF_MS = 60 * 1_000
const MAXIMUM_BACKOFF_MS = 24 * 60 * 60 * 1_000

export type ProviderCacheMode = "fresh" | "refresh" | "stale" | "blocked"

export function isCurrentUtcMonth(periodStart: string, now = Date.now()): boolean {
  const period = new Date(periodStart)
  const current = new Date(now)
  return Number.isFinite(period.getTime())
    && period.getUTCFullYear() === current.getUTCFullYear()
    && period.getUTCMonth() === current.getUTCMonth()
}

export function providerCacheMode(input: {
  fetchedAt: number | null
  retryAfterAt: number | null
  now: number
  freshForMs?: number
  staleForMs?: number
}): ProviderCacheMode {
  const freshForMs = input.freshForMs ?? AZURE_COST_FRESH_MS
  const staleForMs = input.staleForMs ?? AZURE_COST_STALE_MS
  if (input.fetchedAt !== null && input.fetchedAt + freshForMs > input.now) return "fresh"
  if (input.retryAfterAt !== null && input.retryAfterAt > input.now) {
    return input.fetchedAt !== null && input.fetchedAt + staleForMs > input.now ? "stale" : "blocked"
  }
  return "refresh"
}

function secondsHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name)?.trim()
  if (!value) return null
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

/**
 * Azure Cost Management exposes a QPU-specific delay header, while the REST
 * contract also documents the Consumption and standard Retry-After headers.
 * Prefer the largest supplied delay and apply conservative bounds when Azure
 * omits or returns an invalid value.
 */
export function azureRetryAfterAt(headers: Headers, now = Date.now()): number {
  const seconds = [
    secondsHeader(headers, "x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after"),
    secondsHeader(headers, "x-ms-ratelimit-microsoft.consumption-retry-after"),
    secondsHeader(headers, "retry-after"),
  ].filter((value): value is number => value !== null)

  const retryAfter = headers.get("retry-after")?.trim()
  const dateDelay = retryAfter && !Number.isFinite(Number(retryAfter)) ? Date.parse(retryAfter) - now : Number.NaN
  const requestedMs = Math.max(
    seconds.length ? Math.max(...seconds) * 1_000 : 0,
    Number.isFinite(dateDelay) && dateDelay > 0 ? dateDelay : 0,
  ) || DEFAULT_BACKOFF_MS

  return now + Math.min(MAXIMUM_BACKOFF_MS, Math.max(MINIMUM_BACKOFF_MS, requestedMs))
}
