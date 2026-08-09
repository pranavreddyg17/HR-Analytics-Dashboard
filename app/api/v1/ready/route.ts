import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { azureAiConfiguration } from "@/lib/server/azure-ai"
import { getModelMetadata } from "@/lib/server/runtime"

export async function GET() {
  try {
    const database = await ensureHrDatabase()
    if (!database) throw new Error("Database binding is unavailable.")
    await database.prepare("SELECT 1 AS ready").first()

    const model = getModelMetadata()
    return Response.json({
      status: "ready",
      version: process.env.APP_VERSION ?? "development",
      database: { status: "ready", engine: "postgresql" },
      model: { status: "ready", runtime: "embedded", version: model.model_version },
      azureAi: azureAiConfiguration(),
    })
  } catch (error) {
    console.error("Readiness check failed", error)
    return Response.json(
      { status: "unavailable", version: process.env.APP_VERSION ?? "development", database: { status: "unavailable" }, model: { status: "ready", runtime: "embedded" } },
      { status: 503 },
    )
  }
}
