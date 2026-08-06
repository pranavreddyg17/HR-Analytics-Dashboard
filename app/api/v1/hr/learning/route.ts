import { NextResponse } from "next/server"
import { ZodError } from "zod"

import { assignLearningCourse, listLearningOperations } from "@/lib/server/learning"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export async function GET(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    const url = new URL(request.url)
    return NextResponse.json(await listLearningOperations(actor, { department: url.searchParams.get("department") || undefined, location: url.searchParams.get("location") || undefined }))
  } catch (error) {
    const status = error instanceof PeopleError ? error.status : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load learning operations." }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    return NextResponse.json(await assignLearningCourse(await request.json(), actor), { status: 201 })
  } catch (error) {
    const status = error instanceof PeopleError ? error.status : error instanceof ZodError ? 422 : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
    const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Unable to assign course."
    return NextResponse.json({ error: message }, { status })
  }
}
