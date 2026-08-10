import { NextRequest, NextResponse } from "next/server"

import { hrDomains, type HrDomain } from "@/lib/hr-types"
import { filtersFromSearchParams, getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { analyticsDomainToCsv } from "@/lib/server/hr-export"
import { requireRole } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, context: { params: Promise<{ domain: string }> }) {
  try {
    await requireRole(request, ["admin", "hr", "manager", "viewer"])
    const { domain: requestedDomain } = await context.params
    const domain = requestedDomain as HrDomain
    if (!hrDomains.includes(domain)) return NextResponse.json({ error: "Unknown domain." }, { status: 404 })
    const analytics = await getWorkforceAnalytics(filtersFromSearchParams(request.nextUrl.searchParams))
    const csv = analyticsDomainToCsv(analytics, domain)
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `inline; filename="laidbackhr-${domain}.csv"`,
        "Cache-Control": "private, no-store",
        "X-LaidbackHR-Generated-At": analytics.generatedAt,
      },
    })
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 403
    return NextResponse.json({ error: status === 401 ? "Sign in is required." : "Workspace access is required." }, { status })
  }
}
