import { NextResponse } from "next/server"
import { ZodError } from "zod"

import { createAiWorkflowDraft, listAiWorkflowDrafts } from "@/lib/server/ai-workflows"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

function failure(error: unknown) {
  if (error instanceof PeopleError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid workflow details." }, { status: 422 })
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  return NextResponse.json({ error: error instanceof Error ? error.message : "The workflow could not be prepared." }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listAiWorkflowDrafts(await requireRequestActor(request)))
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    return NextResponse.json(await createAiWorkflowDraft(await request.json(), actor), { status: 201 })
  } catch (error) {
    return failure(error)
  }
}
