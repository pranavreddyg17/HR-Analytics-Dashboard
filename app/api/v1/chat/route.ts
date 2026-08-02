import { runHrAgent } from "@/lib/server/hr-agent"
import { appendConversationMessage, createConversation, getConversationContext } from "@/lib/server/ai-conversations"
import { requireRequestActor } from "@/lib/server/request-user"

export async function POST(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    const body = await request.json() as { message?: unknown; conversationId?: unknown }
    if (body.conversationId !== undefined && (typeof body.conversationId !== "string" || body.conversationId.length > 100)) {
      return Response.json({ detail: "Invalid conversation." }, { status: 422 })
    }
    if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 2000) {
      return Response.json({ detail: "message must contain between 1 and 2,000 characters." }, { status: 422 })
    }

    const existingId = typeof body.conversationId === "string" && body.conversationId ? body.conversationId : null
    const history = existingId ? await getConversationContext(actor, existingId) : []
    const answer = await runHrAgent({ message: body.message, history })
    const conversation = existingId
      ? { id: existingId }
      : await createConversation(actor, body.message)

    await appendConversationMessage(actor, conversation.id, { role: "user", content: body.message.trim() })
    await appendConversationMessage(actor, conversation.id, {
      role: "assistant",
      content: answer.answer,
      tools: answer.tools.map(({ tool, status, input }) => ({ tool, status, input })),
      context: answer.context,
      dataMode: answer.dataMode,
      provider: answer.provider,
    })
    return Response.json({ ...answer, conversationId: conversation.id })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid analytics request."
    return Response.json(
      { detail },
      { status: detail === "AUTH_REQUIRED" ? 401 : detail === "CONVERSATION_NOT_FOUND" ? 404 : error instanceof SyntaxError || /message must|Invalid conversation/.test(detail) ? 422 : 500 },
    )
  }
}
