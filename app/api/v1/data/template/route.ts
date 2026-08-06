import { NextRequest, NextResponse } from "next/server"

import { hrDomains, importFields, type HrDomain } from "@/lib/hr-types"
import { requireRole } from "@/lib/server/request-user"

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"])
    const domain = request.nextUrl.searchParams.get("domain") as HrDomain | null
    if (!domain || !hrDomains.includes(domain)) return NextResponse.json({ error: "Unknown domain." }, { status: 400 })
    const csv = `${importFields[domain].join(",")}\n`
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="laidbackhr-${domain}-template.csv"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 403
    return NextResponse.json({ error: status === 401 ? "Sign in is required." : "HR or administrator access is required." }, { status })
  }
}
