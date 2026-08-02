import { deleteConversation, getConversation } from "@/lib/server/ai-conversations"
import { requireRequestActor } from "@/lib/server/request-user"

export async function GET(request: Request, { params }: { params: Promise<{ conversation_id: string }> }) {
  try {
    const actor = await requireRequestActor(request)
    const { conversation_id: conversationId } = await params
    return Response.json(await getConversation(actor, conversationId))
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Conversation history is unavailable."
    return Response.json({ detail }, { status: detail === "AUTH_REQUIRED" ? 401 : detail === "CONVERSATION_NOT_FOUND" ? 404 : 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ conversation_id: string }> }) {
  try {
    const actor = await requireRequestActor(request)
    const { conversation_id: conversationId } = await params
    const conversation = await deleteConversation(actor, conversationId)
    return Response.json({ deleted: true, conversation })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The conversation could not be deleted."
    return Response.json({ detail }, { status: detail === "AUTH_REQUIRED" ? 401 : detail === "CONVERSATION_NOT_FOUND" ? 404 : 500 })
  }
}
