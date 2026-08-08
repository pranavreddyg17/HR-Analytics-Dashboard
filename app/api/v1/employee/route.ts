import { ZodError } from "zod"

import { createEmployeeCase, createExpenseClaim, getEmployeePortal, submitSelfReview } from "@/lib/server/employee-portal"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

function errorResponse(error: unknown) {
  const status = error instanceof PeopleError ? error.status : error instanceof ZodError ? 422 : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
  const detail = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Employee service request failed."
  return Response.json({ error: detail }, { status })
}

export async function GET(request: Request) {
  try {
    return Response.json(await getEmployeePortal(await requireRequestActor(request)))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    const body = await request.json() as { action?: unknown; payload?: unknown }
    if (body.action === "submit_expense") return Response.json(await createExpenseClaim(body.payload, actor), { status: 201 })
    if (body.action === "open_case") return Response.json(await createEmployeeCase(body.payload, actor), { status: 201 })
    if (body.action === "submit_self_review") return Response.json(await submitSelfReview(body.payload, actor))
    return Response.json({ error: "Unsupported employee service action." }, { status: 422 })
  } catch (error) {
    return errorResponse(error)
  }
}
