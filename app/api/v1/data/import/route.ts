import { NextRequest, NextResponse } from "next/server"

import { hrDomains, type HrDomain } from "@/lib/hr-types"
import { importHrData } from "@/lib/server/hr-database"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { domain?: string; rows?: unknown[]; filename?: string; replace?: boolean }
    if (!body.domain || !hrDomains.includes(body.domain as HrDomain)) {
      return NextResponse.json({ error: "domain must be one of: employees, hiring, attrition, leave, training, promotions." }, { status: 400 })
    }
    const result = await importHrData({
      domain: body.domain as HrDomain,
      rows: body.rows ?? [],
      filename: body.filename ?? `${body.domain}.csv`,
      replace: body.replace === true,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed." }, { status: 400 })
  }
}
