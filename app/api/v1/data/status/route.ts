import { NextResponse } from "next/server"

import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"

export const dynamic = "force-dynamic"

export async function GET() {
  const analytics = await getWorkforceAnalytics()
  return NextResponse.json({ generatedAt: analytics.generatedAt, status: analytics.status })
}
