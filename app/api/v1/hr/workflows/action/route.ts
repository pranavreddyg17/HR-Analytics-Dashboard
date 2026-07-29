import { NextResponse } from "next/server"
import { ZodError } from "zod"

import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"
import { actOnWorkflow } from "@/lib/server/workflows"

export async function POST(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    return NextResponse.json(await actOnWorkflow(await request.json(), actor))
  } catch (error) {
    const status = error instanceof PeopleError ? error.status : error instanceof ZodError ? 422 : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
    const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Unable to update workflow."
    return NextResponse.json({ error: message }, { status })
  }
}
