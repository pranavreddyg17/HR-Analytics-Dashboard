import { NextResponse } from "next/server"
import { ZodError } from "zod"

import { updateHiringCandidate } from "@/lib/server/hiring"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export async function PATCH(request: Request, context: { params: Promise<{ candidate_id: string }> }) {
  try {
    const actor = await requireRequestActor(request)
    const { candidate_id: candidateId } = await context.params
    return NextResponse.json(await updateHiringCandidate(decodeURIComponent(candidateId), await request.json(), actor))
  } catch (error) {
    const status = error instanceof PeopleError ? error.status : error instanceof ZodError ? 422 : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
    const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Unable to update candidate."
    return NextResponse.json({ error: message }, { status })
  }
}
