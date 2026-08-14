import { normalizeAssistantPageContext } from "@/lib/assistant-page-context"
import {
  appendConversationMessage,
  createConversation,
  getConversationContext,
} from "@/lib/server/ai-conversations"
import { runHrAgent } from "@/lib/server/hr-agent"
import { IntegrationApiError } from "@/lib/server/integration-api"
import type { RequestActor } from "@/lib/server/request-user"

type AssistantTurnInput = {
  message?: unknown
  pageContext?: unknown
}

export async function runIntegrationAssistantTurn(
  value: AssistantTurnInput,
  actor: RequestActor,
  conversationId?: string,
) {
  if (typeof value.message !== "string" || !value.message.trim() || value.message.length > 2_000) {
    throw new IntegrationApiError("message must contain between 1 and 2,000 characters.", 422)
  }
  const pageContext = value.pageContext === undefined ? undefined : normalizeAssistantPageContext(value.pageContext)
  if (value.pageContext !== undefined && !pageContext) {
    throw new IntegrationApiError("pageContext must contain a supported workspace route and optional string filters.", 422)
  }

  let history: Awaited<ReturnType<typeof getConversationContext>> = []
  let resolvedConversationId = conversationId
  try {
    history = conversationId ? await getConversationContext(actor, conversationId) : []
    if (!resolvedConversationId) resolvedConversationId = (await createConversation(actor, value.message)).id
  } catch (error) {
    if (error instanceof Error && error.message === "CONVERSATION_NOT_FOUND") {
      throw new IntegrationApiError("Conversation not found.", 404)
    }
    throw error
  }

  await appendConversationMessage(actor, resolvedConversationId, { role: "user", content: value.message.trim() })
  const answer = await runHrAgent({
    message: value.message.trim(),
    history,
    actor,
    conversationId: resolvedConversationId,
    pageContext,
  })
  await appendConversationMessage(actor, resolvedConversationId, {
    role: "assistant",
    content: answer.answer,
    tools: answer.tools.map(({ tool, status, input, resultContext, iteration }) => ({ tool, status, input, resultContext, iteration })),
    context: answer.context,
    dataMode: answer.dataMode,
    provider: answer.provider,
    workflow: answer.workflow,
  })

  return { conversationId: resolvedConversationId, ...answer }
}
