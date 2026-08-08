import { ZodError } from "zod"

import { manageEmployee } from "@/lib/server/employee-management"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export async function POST(request: Request, context: { params: Promise<{ employee_id: string }> }) {
  try {
    const actor = await requireRequestActor(request)
    const { employee_id: employeeId } = await context.params
    return Response.json(await manageEmployee(employeeId, await request.json(), actor), { status: 201 })
  } catch (error) {
    const status = error instanceof PeopleError ? error.status : error instanceof ZodError ? 422 : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
    const detail = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Employee management request failed."
    return Response.json({ error: detail }, { status })
  }
}
