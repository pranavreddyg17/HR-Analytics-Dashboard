import { deleteConversation, getConversation } from "@/lib/server/ai-conversations"
import {
  auditedIntegrationFailure,
  auditIntegrationRequest,
  authorizeIntegrationRequest,
  integrationResponse,
  IntegrationApiError,
} from "@/lib/server/integration-api"

type Context = { params: Promise<{ conversationId: string }> }

async function conversationId(context: Context): Promise<string> {
  const value = (await context.params).conversationId
  if (!value || value.length > 100) throw new IntegrationApiError("Invalid conversation ID.", 422)
  return value
}

function normalizeError(error: unknown): unknown {
  return error instanceof Error && error.message === "CONVERSATION_NOT_FOUND"
    ? new IntegrationApiError("Conversation not found.", 404)
    : error
}

export async function GET(request: Request, context: Context) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "assistant:use")
    const response = integrationResponse(principal, await getConversation(principal.actor, await conversationId(context)))
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(normalizeError(error), request, principal)
  }
}

export async function DELETE(request: Request, context: Context) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "assistant:use")
    const response = integrationResponse(
      principal,
      { deleted: true, conversation: await deleteConversation(principal.actor, await conversationId(context)) },
      { headers: { "cache-control": "no-store" } },
    )
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(normalizeError(error), request, principal)
  }
}
