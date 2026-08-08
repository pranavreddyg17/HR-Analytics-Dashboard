import { invokeAgent, isAgentId } from "@/lib/server/agent-api"
import { requireRequestActor } from "@/lib/server/request-user"

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  try {
    const actor = await requireRequestActor(request)
    if (actor.role === "employee") return Response.json({ error: "This API is available to HR workspace roles." }, { status: 403 })
    const { agentId } = await context.params
    if (!isAgentId(agentId)) return Response.json({ error: "Unknown agent." }, { status: 404 })
    const body = await request.json() as { objective?: unknown }
    if (typeof body.objective !== "string" || !body.objective.trim() || body.objective.length > 2_000) {
      return Response.json({ error: "objective must contain between 1 and 2,000 characters." }, { status: 422 })
    }
    return Response.json(await invokeAgent(agentId, body.objective.trim(), actor))
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Agent invocation failed."
    return Response.json({ error: detail }, { status: detail === "AUTH_REQUIRED" ? 401 : 500 })
  }
}
