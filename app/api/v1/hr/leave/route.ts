import { NextResponse } from "next/server"

import { listLeaveOperations } from "@/lib/server/leave"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export async function GET(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    const params = new URL(request.url).searchParams
    return NextResponse.json(await listLeaveOperations(actor, {
      id: params.get("id") || undefined,
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
      department: params.get("department") || undefined,
      location: params.get("location") || undefined,
      leaveType: params.get("leaveType") || undefined,
      status: params.get("status") || undefined,
    }))
  } catch (error) {
    const status = error instanceof PeopleError ? error.status : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load leave operations." }, { status })
  }
}
