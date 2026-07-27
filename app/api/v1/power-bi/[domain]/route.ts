import { NextRequest, NextResponse } from "next/server"

import { hrDomains, type HrDomain } from "@/lib/hr-types"
import { filtersFromSearchParams, getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { getAnalyticsDomainRows, rowsToCsv } from "@/lib/server/hr-export"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, context: { params: Promise<{ domain: string }> }) {
  const { domain: requestedDomain } = await context.params
  const domain = requestedDomain as HrDomain
  if (!hrDomains.includes(domain)) return NextResponse.json({ error: "Unknown domain." }, { status: 404 })
  const analytics = await getWorkforceAnalytics(filtersFromSearchParams(request.nextUrl.searchParams))
  const csv = rowsToCsv(getAnalyticsDomainRows(analytics, domain))
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `inline; filename="laidbackhr-${domain}.csv"`,
      "Cache-Control": "no-store",
      "X-LaidbackHR-Generated-At": analytics.generatedAt,
    },
  })
}
