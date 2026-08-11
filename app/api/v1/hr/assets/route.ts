import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { createAsset, ExitAssetError, listAssets } from "@/lib/server/exit-assets"
import { requireRole } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

function failure(error: unknown) {
  if (error instanceof ExitAssetError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid asset data.", issues: error.issues }, { status: 422 })
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  if (error instanceof Error && error.message === "ROLE_REQUIRED") return NextResponse.json({ error: "Your role cannot manage assets." }, { status: 403 })
  return NextResponse.json({ error: error instanceof Error ? error.message : "Asset request failed." }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr", "manager", "viewer"])
    const params = request.nextUrl.searchParams
    return NextResponse.json(await listAssets({
      search: params.get("search") ?? "",
      type: params.get("type") ?? "",
      status: params.get("status") ?? "",
      condition: params.get("condition") ?? "",
      lifecycle: params.get("lifecycle") ?? "",
      limit: Number(params.get("limit") ?? 100),
      offset: Number(params.get("offset") ?? 0),
    }))
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole(request, ["admin", "hr"])
    return NextResponse.json(await createAsset(await request.json(), actor), { status: 201 })
  } catch (error) { return failure(error) }
}
