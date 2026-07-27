import { NextRequest, NextResponse } from "next/server"

import { listInboxItems } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    requireRequestActor(request)
    return NextResponse.json({ items: await listInboxItems() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Inbox unavailable." }, { status: error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500 })
  }
}
