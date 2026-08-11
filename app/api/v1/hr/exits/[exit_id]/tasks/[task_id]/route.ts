import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { ExitAssetError, updateOffboardingTask } from "@/lib/server/exit-assets"
import { requireRole } from "@/lib/server/request-user"

function failure(error: unknown) {
  if (error instanceof ExitAssetError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid task update." }, { status: 422 })
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  if (error instanceof Error && error.message === "ROLE_REQUIRED") return NextResponse.json({ error: "Your role cannot update offboarding tasks." }, { status: 403 })
  return NextResponse.json({ error: error instanceof Error ? error.message : "Task update failed." }, { status: 500 })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ exit_id: string; task_id: string }> }) {
  try {
    const actor = await requireRole(request, ["admin", "hr"])
    const { exit_id: exitId, task_id: taskId } = await context.params
    return NextResponse.json(await updateOffboardingTask(exitId, taskId, await request.json(), actor))
  } catch (error) { return failure(error) }
}
