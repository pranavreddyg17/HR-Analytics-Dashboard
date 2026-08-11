import { NextRequest, NextResponse } from "next/server"

import { completeEmployeeExit, ExitAssetError } from "@/lib/server/exit-assets"
import { requireRole } from "@/lib/server/request-user"

function failure(error: unknown) {
  if (error instanceof ExitAssetError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  if (error instanceof Error && error.message === "ROLE_REQUIRED") return NextResponse.json({ error: "Your role cannot complete employee exits." }, { status: 403 })
  return NextResponse.json({ error: error instanceof Error ? error.message : "Exit completion failed." }, { status: 500 })
}

export async function POST(request: NextRequest, context: { params: Promise<{ exit_id: string }> }) {
  try {
    const actor = await requireRole(request, ["admin", "hr"])
    const { exit_id: exitId } = await context.params
    const body = await request.json() as { actualExitDate?: string }
    return NextResponse.json(await completeEmployeeExit(exitId, body.actualExitDate ?? "", actor))
  } catch (error) { return failure(error) }
}
