import { NextRequest, NextResponse } from "next/server"

import { getInboxOperations } from "@/lib/server/inbox"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireRequestActor(request)
    return NextResponse.json(await getInboxOperations(actor))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Inbox unavailable." }, { status: error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500 })
  }
}
