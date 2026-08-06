import { NextResponse } from "next/server"
import { z, ZodError } from "zod"

import { InsightActionError, updateInsightWorkItem } from "@/lib/server/insight-actions"
import { requireRequestActor } from "@/lib/server/request-user"

const inputSchema = z.object({
  action: z.enum(["start", "complete"]),
  note: z.string().trim().min(10, "Add a short work note.").max(1_000),
}).strict()

export async function PATCH(request: Request, { params }: { params: Promise<{ work_item_id: string }> }) {
  try {
    const actor = await requireRequestActor(request)
    const input = inputSchema.parse(await request.json())
    const { work_item_id: workItemId } = await params
    return NextResponse.json(await updateInsightWorkItem(workItemId, input.action, input.note, actor))
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message ?? "Invalid work-item update."
      : error instanceof Error ? error.message
        : "Unable to update insight work item."
    const status = error instanceof InsightActionError ? error.status
      : message === "AUTH_REQUIRED" ? 401
        : error instanceof ZodError ? 422
          : 500
    return NextResponse.json({ error: message }, { status })
  }
}
