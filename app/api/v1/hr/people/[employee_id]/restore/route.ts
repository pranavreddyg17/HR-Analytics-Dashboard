import { NextRequest, NextResponse } from "next/server"

import { PeopleError, setPersonArchived } from "@/lib/server/people"
import { requireRole } from "@/lib/server/request-user"

export async function POST(request: NextRequest, context: { params: Promise<{ employee_id: string }> }) {
  try {
    const actor = await requireRole(request, ["admin", "hr"])
    const { employee_id: employeeId } = await context.params
    return NextResponse.json(await setPersonArchived(employeeId, false, actor))
  } catch (error) {
    const status = error instanceof PeopleError ? error.status : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : error instanceof Error && error.message === "ROLE_REQUIRED" ? 403 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "Restore failed." }, { status })
  }
}
