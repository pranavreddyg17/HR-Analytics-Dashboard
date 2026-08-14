import { runIntegrationAssistantTurn } from "@/lib/server/integration-assistant"
import {
  auditedIntegrationFailure,
  auditIntegrationRequest,
  authorizeIntegrationRequest,
  integrationResponse,
  IntegrationApiError,
} from "@/lib/server/integration-api"

export async function POST(request: Request, context: { params: Promise<{ conversationId: string }> }) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "assistant:use")
    const { conversationId } = await context.params
    if (!conversationId || conversationId.length > 100) throw new IntegrationApiError("Invalid conversation ID.", 422)
    let body: unknown
    try { body = await request.json() } catch { throw new IntegrationApiError("A JSON assistant request is required.", 422) }
    const response = integrationResponse(
      principal,
      await runIntegrationAssistantTurn(body as Record<string, unknown>, principal.actor, conversationId),
      { headers: { "cache-control": "no-store" } },
    )
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(error, request, principal)
  }
}
