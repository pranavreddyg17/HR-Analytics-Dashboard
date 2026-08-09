import { runHrAgent } from "@/lib/server/hr-agent"
import { appendConversationMessage, createConversation, getConversationContext } from "@/lib/server/ai-conversations"
import { requireRequestActor } from "@/lib/server/request-user"

export async function POST(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    const body = await request.json() as { message?: unknown; conversationId?: unknown; stream?: unknown; pageContext?: unknown }
    if (body.conversationId !== undefined && (typeof body.conversationId !== "string" || body.conversationId.length > 100)) {
      return Response.json({ detail: "Invalid conversation." }, { status: 422 })
    }
    if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 2000) {
      return Response.json({ detail: "message must contain between 1 and 2,000 characters." }, { status: 422 })
    }
    if (body.pageContext !== undefined && (typeof body.pageContext !== "string" || body.pageContext.length > 200)) return Response.json({ detail: "Invalid page context." }, { status: 422 })

    const existingId = typeof body.conversationId === "string" && body.conversationId ? body.conversationId : null
    const history = existingId ? await getConversationContext(actor, existingId) : []
    const conversation = existingId
      ? { id: existingId }
      : await createConversation(actor, body.message)

    await appendConversationMessage(actor, conversation.id, { role: "user", content: body.message.trim() })
    const wantsStream = body.stream === true || request.headers.get("accept")?.includes("text/event-stream")

    if (wantsStream) {
      const encoder = new TextEncoder()
      const event = (name: string, payload: unknown) => encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`)
      const responseStream = new ReadableStream<Uint8Array>({
        start(controller) {
          void (async () => {
            try {
              controller.enqueue(event("conversation", { conversationId: conversation.id }))
              const answer = await runHrAgent({
                message: body.message,
                history,
                actorEmail: actor.email,
                conversationId: conversation.id,
                pageContext: typeof body.pageContext === "string" ? body.pageContext : undefined,
                onProgress: (progress) => { controller.enqueue(event("progress", progress)) },
              })
              const chunks = answer.answer.match(/[\s\S]{1,72}/g) ?? [answer.answer]
              for (const chunk of chunks) {
                controller.enqueue(event("delta", { text: chunk }))
              }
              await appendConversationMessage(actor, conversation.id, {
                role: "assistant",
                content: answer.answer,
                tools: answer.tools.map(({ tool, status, input, resultContext, iteration }) => ({ tool, status, input, resultContext, iteration })),
                context: answer.context,
                dataMode: answer.dataMode,
                provider: answer.provider,
              })
              controller.enqueue(event("metadata", {
                tools: answer.tools,
                context: answer.context,
                dataMode: answer.dataMode,
                provider: answer.provider,
                groundedAt: answer.groundedAt,
              }))
              controller.enqueue(event("done", { conversationId: conversation.id }))
            } catch (error) {
              controller.enqueue(event("error", { detail: error instanceof Error ? error.message : "The assistant is unavailable." }))
            } finally {
              controller.close()
            }
          })()
        },
      })
      return new Response(responseStream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        },
      })
    }

    const answer = await runHrAgent({ message: body.message, history, actorEmail: actor.email, conversationId: conversation.id, pageContext: typeof body.pageContext === "string" ? body.pageContext : undefined })
    await appendConversationMessage(actor, conversation.id, {
      role: "assistant",
      content: answer.answer,
      tools: answer.tools.map(({ tool, status, input, resultContext, iteration }) => ({ tool, status, input, resultContext, iteration })),
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
