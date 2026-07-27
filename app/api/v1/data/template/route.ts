import { NextRequest, NextResponse } from "next/server"

import { hrDomains, importFields, type HrDomain } from "@/lib/hr-types"

export function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain") as HrDomain | null
  if (!domain || !hrDomains.includes(domain)) return NextResponse.json({ error: "Unknown domain." }, { status: 400 })
  const csv = `${importFields[domain].join(",")}\n`
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laidbackhr-${domain}-template.csv"`,
    },
  })
}
