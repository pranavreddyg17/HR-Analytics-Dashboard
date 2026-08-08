import { NextRequest, NextResponse } from "next/server"

import { filtersFromSearchParams, getWorkforceDashboardAnalytics } from "@/lib/server/hr-analytics"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await getWorkforceDashboardAnalytics(filtersFromSearchParams(request.nextUrl.searchParams)), {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load workforce analytics." }, { status: 500 })
  }
}
