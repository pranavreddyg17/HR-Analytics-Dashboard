import { NextRequest, NextResponse } from "next/server"

import { filtersFromSearchParams } from "@/lib/server/hr-analytics"
import { getEmployeeImpactScenario, searchEmployeeImpactPeople } from "@/lib/server/employee-impact"
import { requireRole } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Employee impact data is unavailable."
  if (message === "AUTH_REQUIRED") return NextResponse.json({ error: "Sign in is required." }, { status: 401 })
  if (message === "ROLE_REQUIRED") return NextResponse.json({ error: "This report is available to workspace reporting roles." }, { status: 403 })
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr", "manager", "viewer"])
    const params = request.nextUrl.searchParams
    const filters = filtersFromSearchParams(params)
    const mode = params.get("mode")
    if (mode === "search") {
      const query = params.get("q")?.trim() ?? ""
      if (query.length > 120) return NextResponse.json({ error: "Search must be 120 characters or fewer." }, { status: 422 })
      return NextResponse.json({ results: await searchEmployeeImpactPeople(query, filters) }, {
        headers: { "Cache-Control": "private, max-age=15" },
      })
    }

    const employeeId = params.get("employeeId")?.trim() ?? ""
    if (!employeeId || employeeId.length > 100) return NextResponse.json({ error: "Select a valid employee." }, { status: 422 })
    const scenario = await getEmployeeImpactScenario(employeeId, filters)
    if (!scenario) return NextResponse.json({ error: "The employee is not active or is outside the current reporting scope." }, { status: 404 })
    return NextResponse.json({ scenario }, { headers: { "Cache-Control": "private, max-age=15" } })
  } catch (error) {
    return failure(error)
  }
}
