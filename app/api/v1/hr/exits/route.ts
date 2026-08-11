import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { createEmployeeExit, ExitAssetError, listEmployeeExits } from "@/lib/server/exit-assets"
import { requireRole } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

function failure(error: unknown) {
  if (error instanceof ExitAssetError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid exit data.", issues: error.issues }, { status: 422 })
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  if (error instanceof Error && error.message === "ROLE_REQUIRED") return NextResponse.json({ error: "Your role cannot manage employee exits." }, { status: 403 })
  return NextResponse.json({ error: error instanceof Error ? error.message : "Employee exit request failed." }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr", "manager", "viewer"])
    const params = request.nextUrl.searchParams
    return NextResponse.json(await listEmployeeExits({ search: params.get("search") ?? "", status: params.get("status") ?? "", horizon: Number(params.get("horizon") ?? 0), limit: Number(params.get("limit") ?? 100), offset: Number(params.get("offset") ?? 0) }))
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole(request, ["admin", "hr"])
    return NextResponse.json(await createEmployeeExit(await request.json(), actor), { status: 201 })
  } catch (error) { return failure(error) }
}
