import { ensureHrDatabase } from "@/lib/server/hr-database"
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
      database: { status: "ready", engine: database.dialect === "postgres" ? "postgresql" : "sqlite" },
      model: { status: "ready", runtime: "embedded", version: model.model_version },
      azureAi: azureAiConfiguration(),
    })
  } catch {
    return Response.json(
      { status: "unavailable", database: { status: "unavailable" }, model: { status: "ready", runtime: "embedded" } },
      { status: 503 },
    )
  }
}
