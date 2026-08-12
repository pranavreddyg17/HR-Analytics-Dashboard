import { NextResponse } from "next/server"

import { getMicrosoftTeamsConnection } from "@/lib/server/microsoft-teams"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireRequestActor(request)
    return NextResponse.json(await getMicrosoftTeamsConnection(request))
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
    }
    return NextResponse.json({ error: "Microsoft Teams connection status is unavailable." }, { status: 500 })
  }
}
