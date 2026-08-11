import assert from "node:assert/strict"
import test from "node:test"

const baseUrl = process.env.LAIDBACKHR_BASE_URL ?? "http://localhost:3000"
const paths = [
  "/api/v1/workforce?period=quarter",
  "/api/v1/hr/inbox",
  "/api/v1/hr/hiring",
  "/api/v1/hr/leave",
  "/api/v1/hr/learning",
]

test("one cost-controlled worker serves 100 concurrent read requests without errors", async () => {
  await Promise.all(paths.map((path) => fetch(baseUrl + path)))
  const started = performance.now()
  const results = await Promise.all(Array.from({ length: 100 }, async (_, index) => {
    const requestStarted = performance.now()
    const response = await fetch(baseUrl + paths[index % paths.length], { signal: AbortSignal.timeout(15_000) })
    await response.arrayBuffer()
    return { status: response.status, duration: performance.now() - requestStarted }
  }))
  assert.ok(results.every((result) => result.status === 200), "all concurrent reads should succeed")
  const durations = results.map((result) => result.duration).sort((a, b) => a - b)
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1]
  assert.ok(p95 < 8_000, `local p95 ${Math.round(p95)}ms exceeded the 8s regression ceiling`)
  console.log(JSON.stringify({ users: 100, totalMs: Math.round(performance.now() - started), p95Ms: Math.round(p95), maxMs: Math.round(durations.at(-1) ?? 0) }))
})
