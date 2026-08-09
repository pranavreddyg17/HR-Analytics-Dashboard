import { NextResponse } from "next/server"

import { executeAiWorkflow } from "@/lib/server/ai-workflows"
import { GoogleCalendarError } from "@/lib/server/google-calendar"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function POST(request: Request, context: { params: Promise<{ workflow_id: string }> }) {
  try {
    const actor = await requireRequestActor(request)
    const { workflow_id: workflowId } = await context.params
    return NextResponse.json(await executeAiWorkflow(workflowId, actor, request))
  } catch (error) {
    if (error instanceof GoogleCalendarError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    if (error instanceof PeopleError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
    return NextResponse.json({ error: error instanceof Error ? error.message : "The workflow could not be completed." }, { status: 500 })
  }
}
