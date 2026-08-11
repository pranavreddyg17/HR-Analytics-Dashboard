import { NextRequest, NextResponse } from "next/server"

import { cancelEmployeeExit, ExitAssetError, getEmployeeExit } from "@/lib/server/exit-assets"
import { requireRole } from "@/lib/server/request-user"

function failure(error: unknown) {
  if (error instanceof ExitAssetError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  if (error instanceof Error && error.message === "ROLE_REQUIRED") return NextResponse.json({ error: "Your role cannot manage employee exits." }, { status: 403 })
  return NextResponse.json({ error: error instanceof Error ? error.message : "Employee exit request failed." }, { status: 500 })
}

export async function GET(request: NextRequest, context: { params: Promise<{ exit_id: string }> }) {
  try {
    await requireRole(request, ["admin", "hr", "manager", "viewer"])
    const { exit_id: exitId } = await context.params
    return NextResponse.json(await getEmployeeExit(exitId))
  } catch (error) { return failure(error) }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ exit_id: string }> }) {
  try {
    const actor = await requireRole(request, ["admin", "hr"])
    const { exit_id: exitId } = await context.params
    const body = await request.json() as { action?: string }
    if (body.action !== "cancel") throw new ExitAssetError("Unsupported exit action.")
    return NextResponse.json(await cancelEmployeeExit(exitId, actor))
  } catch (error) { return failure(error) }
}
