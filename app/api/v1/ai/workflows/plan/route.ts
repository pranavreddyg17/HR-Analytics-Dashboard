import { NextResponse } from "next/server"
import { ZodError } from "zod"

import { planAiWorkflow } from "@/lib/server/ai-workflows"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    return NextResponse.json(await planAiWorkflow(await request.json(), actor))
  } catch (error) {
    if (error instanceof PeopleError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Describe the meeting you want to schedule." }, { status: 422 })
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
    return NextResponse.json({ error: error instanceof Error ? error.message : "The workflow plan could not be created." }, { status: 500 })
  }
}
