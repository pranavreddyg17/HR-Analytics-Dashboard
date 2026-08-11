import assert from "node:assert/strict"
import test from "node:test"

import {
  AZURE_COST_FRESH_MS,
  AZURE_COST_STALE_MS,
  azureRetryAfterAt,
  isCurrentUtcMonth,
  providerCacheMode,
} from "../lib/server/admin-provider-cache"

const now = Date.UTC(2026, 7, 11, 17, 0, 0)

test("a current cost snapshot avoids another Azure request", () => {
  assert.equal(providerCacheMode({ fetchedAt: now - AZURE_COST_FRESH_MS + 1, retryAfterAt: null, now }), "fresh")
})

test("a stale snapshot is served while Azure requires backoff", () => {
  assert.equal(providerCacheMode({ fetchedAt: now - AZURE_COST_FRESH_MS, retryAfterAt: now + 60_000, now }), "stale")
})

test("backoff blocks an Azure request when no usable snapshot exists", () => {
  assert.equal(providerCacheMode({ fetchedAt: now - AZURE_COST_STALE_MS, retryAfterAt: now + 60_000, now }), "blocked")
  assert.equal(providerCacheMode({ fetchedAt: null, retryAfterAt: now + 60_000, now }), "blocked")
})

test("an expired snapshot refreshes after the backoff window", () => {
  assert.equal(providerCacheMode({ fetchedAt: now - AZURE_COST_STALE_MS, retryAfterAt: now - 1, now }), "refresh")
})

test("Cost Management QPU backoff takes precedence and is bounded", () => {
  const headers = new Headers({
    "x-ms-ratelimit-microsoft.costmanagement-qpu-retry-after": "900",
    "x-ms-ratelimit-microsoft.consumption-retry-after": "60",
  })
  assert.equal(azureRetryAfterAt(headers, now), now + 900_000)
  assert.equal(azureRetryAfterAt(new Headers({ "retry-after": "1" }), now), now + 60_000)
})

test("standard HTTP-date Retry-After is supported", () => {
  const retryDate = new Date(now + 120_000).toUTCString()
  assert.equal(azureRetryAfterAt(new Headers({ "retry-after": retryDate }), now), now + 120_000)
})

test("cost snapshots do not cross a UTC billing-month boundary", () => {
  assert.equal(isCurrentUtcMonth("2026-08-01T00:00:00.000Z", now), true)
  assert.equal(isCurrentUtcMonth("2026-07-01T00:00:00.000Z", now), false)
})
