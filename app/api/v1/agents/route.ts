import { agentCatalog, listAgentRuns } from "@/lib/server/agent-api"
import { requireRequestActor } from "@/lib/server/request-user"

export async function GET(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    if (actor.role === "employee") return Response.json({ error: "This API is available to HR workspace roles." }, { status: 403 })
    return Response.json({ agents: agentCatalog, recentRuns: await listAgentRuns(actor) })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Agent catalog is unavailable." }, { status: 500 })
  }
}
