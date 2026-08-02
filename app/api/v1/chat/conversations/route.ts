import { listConversations } from "@/lib/server/ai-conversations"
import { requireRequestActor } from "@/lib/server/request-user"

export async function GET(request: Request) {
  try {
    return Response.json({ conversations: await listConversations(await requireRequestActor(request)) })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Conversation history is unavailable."
    return Response.json({ detail }, { status: detail === "AUTH_REQUIRED" ? 401 : 500 })
  }
}
