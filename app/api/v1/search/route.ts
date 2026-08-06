import { NextRequest, NextResponse } from "next/server"

import { searchWorkspace } from "@/lib/server/global-search"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireRequestActor(request)
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? ""
    if (query.length < 2) return NextResponse.json({ results: [] })
    if (query.length > 120) return NextResponse.json({ error: "Search must be 120 characters or fewer." }, { status: 422 })
    return NextResponse.json({ results: await searchWorkspace(query, actor) })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Search is unavailable."
    return NextResponse.json(
      { error: detail === "AUTH_REQUIRED" ? "Sign in is required." : detail },
      { status: detail === "AUTH_REQUIRED" ? 401 : 500 },
    )
  }
}
