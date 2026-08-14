import { listConversations } from "@/lib/server/ai-conversations"
import { runIntegrationAssistantTurn } from "@/lib/server/integration-assistant"
import {
  auditedIntegrationFailure,
  auditIntegrationRequest,
  authorizeIntegrationRequest,
  integrationResponse,
  IntegrationApiError,
} from "@/lib/server/integration-api"

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "assistant:use")
    const response = integrationResponse(principal, { conversations: await listConversations(principal.actor) })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(error, request, principal)
  }
}

export async function POST(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "assistant:use")
    let body: unknown
    try { body = await request.json() } catch { throw new IntegrationApiError("A JSON assistant request is required.", 422) }
    const response = integrationResponse(
      principal,
      await runIntegrationAssistantTurn(body as Record<string, unknown>, principal.actor),
      { status: 201, headers: { "cache-control": "no-store" } },
    )
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(error, request, principal)
  }
}
