import { NextRequest, NextResponse } from "next/server"

import { filtersFromSearchParams, getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { createExecutivePdf, createWorkbook } from "@/lib/server/hr-export"
import { requireRole } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"])
    const analytics = await getWorkforceAnalytics(filtersFromSearchParams(request.nextUrl.searchParams), { rowLimit: null })
    const format = request.nextUrl.searchParams.get("format") ?? "xlsx"
    if (format === "pdf") {
      const file = await createExecutivePdf(analytics)
      return new NextResponse(file as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="laidbackhr-workforce-decision-brief.pdf"' } })
    }
    if (format !== "xlsx") return NextResponse.json({ error: "format must be pdf or xlsx." }, { status: 400 })
    const file = await createWorkbook(analytics)
    return new NextResponse(file as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="laidbackhr-workforce-analysis.xlsx"' } })
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : error instanceof Error && error.message === "ROLE_REQUIRED" ? 403 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate the report." }, { status })
  }
}
