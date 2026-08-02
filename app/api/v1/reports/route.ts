import { NextRequest, NextResponse } from "next/server"

import { filtersFromSearchParams, getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { createExecutivePdf, createWorkbook } from "@/lib/server/hr-export"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const analytics = await getWorkforceAnalytics(filtersFromSearchParams(request.nextUrl.searchParams))
  const format = request.nextUrl.searchParams.get("format") ?? "xlsx"
  if (format === "pdf") {
    const file = await createExecutivePdf(analytics)
    return new NextResponse(file as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="laidbackhr-executive-report.pdf"' } })
  }
  if (format !== "xlsx") return NextResponse.json({ error: "format must be pdf or xlsx." }, { status: 400 })
  const file = await createWorkbook(analytics)
  return new NextResponse(file as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="laidbackhr-workforce-report.xlsx"' } })
}
