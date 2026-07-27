import type { AgentActionStatus } from "@/lib/types"
import { setActionStatus } from "@/lib/server/actions"
import { getActionTemplates } from "@/lib/server/runtime"

const allowedStatuses = new Set<AgentActionStatus>([
  "pending",
  "running",
  "completed",
  "needs_approval",
  "dismissed",
])

export async function POST(
  request: Request,
  context: { params: Promise<{ action_id: string }> },
) {
  try {
    const { action_id: actionId } = await context.params
    if (!getActionTemplates().some((action) => action.id === actionId)) {
      return Response.json({ detail: "Action not found." }, { status: 404 })
    }
    const body = await request.json() as { status?: unknown }
    if (typeof body.status !== "string" || !allowedStatuses.has(body.status as AgentActionStatus)) {
      return Response.json({ detail: "Invalid action status." }, { status: 422 })
    }
    await setActionStatus(actionId, body.status as AgentActionStatus)
    return Response.json({ id: actionId, status: body.status })
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Action update failed." },
      { status: error instanceof SyntaxError ? 422 : 503 },
    )
  }
}
