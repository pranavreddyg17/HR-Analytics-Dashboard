import { NextRequest, NextResponse } from "next/server"

import { decideLeave, PeopleError } from "@/lib/server/people"
import { requireRole } from "@/lib/server/request-user"

export async function POST(request: NextRequest, context: { params: Promise<{ leave_id: string }> }) {
  try {
    const actor = await requireRole(request, ["admin", "hr", "manager"])
    const body = await request.json() as { decision?: string }
    if (body.decision !== "Approved" && body.decision !== "Rejected") return NextResponse.json({ error: "Decision must be Approved or Rejected." }, { status: 422 })
    const { leave_id: leaveId } = await context.params
    await decideLeave(leaveId, body.decision, actor)
    return NextResponse.json({ id: leaveId, status: body.decision })
  } catch (error) {
    const status = error instanceof PeopleError ? error.status : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : error instanceof Error && error.message === "ROLE_REQUIRED" ? 403 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "Decision failed." }, { status })
  }
}
