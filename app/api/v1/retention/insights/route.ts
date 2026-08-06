import { NextResponse } from "next/server"

import { getRetentionIntelligence } from "@/lib/server/retention-intelligence"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireRequestActor(request)
    return NextResponse.json(await getRetentionIntelligence())
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build retention insights." }, { status })
  }
}
