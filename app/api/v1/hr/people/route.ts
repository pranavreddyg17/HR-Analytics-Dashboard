import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { createPerson, listPeople, PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

function failure(error: unknown) {
  if (error instanceof PeopleError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid employee data.", issues: error.issues }, { status: 422 })
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  return NextResponse.json({ error: error instanceof Error ? error.message : "Employee request failed." }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    requireRequestActor(request)
    const params = request.nextUrl.searchParams
    return NextResponse.json(await listPeople({
      search: params.get("search") ?? "",
      department: params.get("department") ?? "",
      location: params.get("location") ?? "",
      status: params.get("status") ?? "",
      employmentType: params.get("employmentType") ?? "",
      includeArchived: params.get("includeArchived") === "true",
      limit: Number(params.get("limit") ?? 100),
      offset: Number(params.get("offset") ?? 0),
    }))
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  try {
    const actor = requireRequestActor(request)
    return NextResponse.json(await createPerson(await request.json(), actor), { status: 201 })
  } catch (error) { return failure(error) }
}
