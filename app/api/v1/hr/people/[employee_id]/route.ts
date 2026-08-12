import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { deletePersonPermanently, getPerson, PeopleError, updatePerson } from "@/lib/server/people"
import { requireAdmin, requireRole } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

function failure(error: unknown) {
  if (error instanceof PeopleError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid employee data.", issues: error.issues }, { status: 422 })
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  if (error instanceof Error && error.message === "ROLE_REQUIRED") return NextResponse.json({ error: "Your role cannot change employee records." }, { status: 403 })
  if (error instanceof Error && error.message === "ADMIN_REQUIRED") return NextResponse.json({ error: "Only an administrator can permanently delete an employee record." }, { status: 403 })
  return NextResponse.json({ error: error instanceof Error ? error.message : "Employee request failed." }, { status: 500 })
}

export async function GET(request: NextRequest, context: { params: Promise<{ employee_id: string }> }) {
  try {
    const actor = await requireRole(request, ["admin", "hr", "manager", "viewer"])
    const { employee_id: employeeId } = await context.params
    return NextResponse.json(await getPerson(employeeId, actor))
  } catch (error) { return failure(error) }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ employee_id: string }> }) {
  try {
    const actor = await requireRole(request, ["admin", "hr"])
    const { employee_id: employeeId } = await context.params
    return NextResponse.json(await updatePerson(employeeId, await request.json(), actor))
  } catch (error) { return failure(error) }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ employee_id: string }> }) {
  try {
    const actor = await requireAdmin(request)
    const { employee_id: employeeId } = await context.params
    return NextResponse.json(await deletePersonPermanently(employeeId, actor))
  } catch (error) { return failure(error) }
}
