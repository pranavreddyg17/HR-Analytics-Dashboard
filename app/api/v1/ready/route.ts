import { ensureHrDatabase } from "@/lib/server/hr-database"
import { runtimeEnv } from "@/lib/server/runtime-env"

export async function GET() {
  try {
    const database = await ensureHrDatabase()
    if (!database) throw new Error("Database binding is unavailable.")
    await database.prepare("SELECT 1 AS ready").first()

    const modelUrl = runtimeEnv.MODEL_API_URL
    if (!modelUrl) throw new Error("Model service URL is unavailable.")
    const response = await fetch(new URL("/api/v1/health", modelUrl), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error("Model service is unavailable.")

    return Response.json({ status: "ready", database: "ready", model: "ready" })
  } catch {
    return Response.json(
      { status: "unavailable", database: "unavailable", model: "unavailable" },
      { status: 503 },
    )
  }
}
