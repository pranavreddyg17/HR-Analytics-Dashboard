import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { ExitAssetError, getAsset, updateAsset } from "@/lib/server/exit-assets"
import { requireRole } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

function failure(error: unknown) {
  if (error instanceof ExitAssetError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid asset data.", issues: error.issues }, { status: 422 })
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  if (error instanceof Error && error.message === "ROLE_REQUIRED") return NextResponse.json({ error: "Your role cannot manage assets." }, { status: 403 })
  return NextResponse.json({ error: error instanceof Error ? error.message : "Asset request failed." }, { status: 500 })
}

export async function GET(request: NextRequest, context: { params: Promise<{ asset_id: string }> }) {
  try {
    await requireRole(request, ["admin", "hr", "manager", "viewer"])
    const { asset_id: assetId } = await context.params
    return NextResponse.json(await getAsset(assetId))
  } catch (error) { return failure(error) }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ asset_id: string }> }) {
  try {
    await requireRole(request, ["admin", "hr"])
    const { asset_id: assetId } = await context.params
    return NextResponse.json(await updateAsset(assetId, await request.json()))
  } catch (error) { return failure(error) }
}
