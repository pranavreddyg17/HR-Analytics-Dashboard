import { NextResponse } from "next/server"
import { ZodError } from "zod"

import { completeLearningAssignment } from "@/lib/server/learning"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export async function PATCH(request: Request, context: { params: Promise<{ assignment_id: string }> }) {
  try {
    const actor = await requireRequestActor(request)
    const { assignment_id: assignmentId } = await context.params
    return NextResponse.json(await completeLearningAssignment(decodeURIComponent(assignmentId), await request.json(), actor))
  } catch (error) {
    const status = error instanceof PeopleError ? error.status : error instanceof ZodError ? 422 : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
    const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Unable to complete assignment."
    return NextResponse.json({ error: message }, { status })
  }
}
