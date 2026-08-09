import { ZodError } from "zod"

import { getEmployeeOnboardingState, submitEmployeeOnboarding } from "@/lib/server/employee-onboarding"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

function errorResponse(error: unknown) {
  const status = error instanceof PeopleError ? error.status : error instanceof ZodError ? 422 : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
  const detail = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Onboarding request failed."
  return Response.json({ error: detail }, { status })
}

export async function GET(request: Request) {
  try { return Response.json(await getEmployeeOnboardingState(await requireRequestActor(request))) }
  catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try { return Response.json(await submitEmployeeOnboarding(await request.json(), await requireRequestActor(request)), { status: 201 }) }
  catch (error) { return errorResponse(error) }
}
