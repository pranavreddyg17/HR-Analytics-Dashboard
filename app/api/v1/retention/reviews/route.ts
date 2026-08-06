import { NextResponse } from "next/server"
import { z, ZodError } from "zod"

import { createRetentionReview } from "@/lib/server/retention-intelligence"
import { requireRequestActor } from "@/lib/server/request-user"

const inputSchema = z.object({ department: z.string().trim().min(1).max(120) }).strict()

export async function POST(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    const input = inputSchema.parse(await request.json())
    return NextResponse.json(await createRetentionReview(input.department, actor), { status: 201 })
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message ?? "Invalid retention review request."
      : error instanceof Error ? error.message
        : "Unable to create retention review."
    const status = message === "AUTH_REQUIRED" ? 401
      : message === "ROLE_REQUIRED" ? 403
        : message === "COHORT_NOT_ELIGIBLE" ? 422
          : error instanceof ZodError ? 422
            : 500
    return NextResponse.json({ error: message }, { status })
  }
}
