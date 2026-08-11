import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { ExitAssetError, returnAsset } from "@/lib/server/exit-assets"
import { requireRole } from "@/lib/server/request-user"

function failure(error: unknown) {
  if (error instanceof ExitAssetError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid return data." }, { status: 422 })
  if (error instanceof Error && error.message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  if (error instanceof Error && error.message === "ROLE_REQUIRED") return NextResponse.json({ error: "Your role cannot return assets." }, { status: 403 })
  return NextResponse.json({ error: error instanceof Error ? error.message : "Asset return failed." }, { status: 500 })
}

export async function POST(request: NextRequest, context: { params: Promise<{ asset_id: string }> }) {
  try {
    const actor = await requireRole(request, ["admin", "hr"])
    const { asset_id: assetId } = await context.params
    return NextResponse.json(await returnAsset(assetId, await request.json(), actor))
  } catch (error) { return failure(error) }
}
