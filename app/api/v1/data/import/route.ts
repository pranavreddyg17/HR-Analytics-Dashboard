import { NextRequest, NextResponse } from "next/server"

import { hrDomains, type HrDomain } from "@/lib/hr-types"
import type { ImportAction, ImportMode, ImportPreview } from "@/lib/data-import-types"
import { importHrData, validateHrImport } from "@/lib/server/hr-repository"
import { requireRole } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole(request, ["admin", "hr"])
    const body = await request.json() as {
      action?: ImportAction
      domain?: string
      rows?: unknown[]
      filename?: string
      mode?: ImportMode
      replace?: boolean
    }
    if (!body.domain || !hrDomains.includes(body.domain as HrDomain)) {
      return NextResponse.json({ error: "domain must be one of: employees, hiring, attrition, leave, training, promotions." }, { status: 400 })
    }
    const mode: ImportMode = body.mode ?? (body.replace === true ? "replace_imported" : "merge")
    const input = {
      domain: body.domain as HrDomain,
      rows: body.rows ?? [],
      filename: body.filename ?? `${body.domain}.csv`,
      mode,
    }
    if ((body.action ?? "apply") === "validate") {
      return NextResponse.json({ preview: await validateHrImport(input) })
    }
    const result = await importHrData({ ...input, actorEmail: actor.email })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : error instanceof Error && error.message === "ROLE_REQUIRED" ? 403 : 400
    const preview = error && typeof error === "object" && "preview" in error ? (error as { preview: ImportPreview }).preview : undefined
    return NextResponse.json({ error: status === 401 ? "Sign in is required." : error instanceof Error ? error.message : "Import failed.", preview }, { status })
  }
}
