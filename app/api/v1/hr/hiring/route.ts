import { NextResponse } from "next/server"

import { listHiringOperations } from "@/lib/server/hiring"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export async function GET(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    return NextResponse.json(await listHiringOperations(actor))
  } catch (error) {
    const status = error instanceof PeopleError ? error.status : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load hiring operations." }, { status })
  }
}
