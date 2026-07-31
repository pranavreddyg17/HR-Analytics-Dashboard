import { NextResponse } from "next/server"

import { getGoogleCalendarConnection } from "@/lib/server/google-calendar"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireRequestActor(request)
    return NextResponse.json(await getGoogleCalendarConnection(request))
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
    }
    return NextResponse.json({ error: "Google Calendar connection status is unavailable." }, { status: 500 })
  }
}
