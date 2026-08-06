import { NextResponse } from "next/server"
import { z, ZodError } from "zod"

import { updateRetentionReview } from "@/lib/server/retention-intelligence"
import { requireRequestActor } from "@/lib/server/request-user"

const inputSchema = z.object({
  action: z.enum(["start", "complete"]),
  note: z.string().trim().min(10, "Add a short review note.").max(1_000),
}).strict()

export async function PATCH(request: Request, { params }: { params: Promise<{ review_id: string }> }) {
  try {
    const actor = await requireRequestActor(request)
    const input = inputSchema.parse(await request.json())
    const { review_id: reviewId } = await params
    return NextResponse.json(await updateRetentionReview(reviewId, input.action, input.note, actor))
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message ?? "Invalid review update."
      : error instanceof Error ? error.message
        : "Unable to update retention review."
    const status = message === "AUTH_REQUIRED" ? 401
      : message === "ROLE_REQUIRED" ? 403
        : message === "REVIEW_NOT_FOUND" ? 404
          : message === "INVALID_REVIEW_TRANSITION" ? 409
            : error instanceof ZodError ? 422
              : 500
    return NextResponse.json({ error: message }, { status })
  }
}
