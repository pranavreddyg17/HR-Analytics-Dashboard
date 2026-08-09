import { NextRequest, NextResponse } from "next/server"

import { getWorkspaceDomainStatus } from "@/lib/server/hr-analytics"
import { getDataImportJobs, getDataImportSummary } from "@/lib/server/hr-repository"
import { requireRole } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"])
    const [domainStatus, imports, importSummary] = await Promise.all([getWorkspaceDomainStatus(), getDataImportJobs(), getDataImportSummary()])
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      status: domainStatus,
      imports,
      summary: {
        totalRecords: domainStatus.reduce((sum, item) => sum + item.count, 0),
        completedImports: importSummary.completedImports,
        failedImports: importSummary.failedImports,
        lastCompletedAt: importSummary.lastCompletedAt,
      },
    })
  } catch (error) {
    const status = error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 403
    return NextResponse.json({ error: status === 401 ? "Sign in is required." : "HR or administrator access is required." }, { status })
  }
}
