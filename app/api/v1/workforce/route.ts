import { NextRequest, NextResponse } from "next/server"

import { filtersFromSearchParams, getWorkforceAnalytics } from "@/lib/server/hr-analytics"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await getWorkforceAnalytics(filtersFromSearchParams(request.nextUrl.searchParams)))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load workforce analytics." }, { status: 500 })
  }
}
