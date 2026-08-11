import { invokeAgent, isAgentId } from "@/lib/server/agent-api"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse, IntegrationApiError } from "@/lib/server/integration-api"

export async function POST(request: Request, context: { params: Promise<{ agentId: string }> }) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "agent:invoke")
    const { agentId } = await context.params
    if (!isAgentId(agentId)) throw new IntegrationApiError("Unknown agent.", 404)
    const body = await request.json() as { objective?: unknown }
    if (typeof body.objective !== "string" || !body.objective.trim() || body.objective.length > 2_000) throw new IntegrationApiError("objective must contain between 1 and 2,000 characters.", 422)
    const answer = await invokeAgent(agentId, body.objective.trim(), principal.actor)
    const response = integrationResponse(principal, answer)
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(error, request, principal) }
}
