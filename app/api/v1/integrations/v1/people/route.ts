import { toIntegrationApiError } from "@/lib/server/integration-errors"
import { integrationPage } from "@/lib/server/integration-pagination"
import {
  auditedIntegrationFailure,
  auditIntegrationRequest,
  authorizeIntegrationRequest,
  integrationResponse,
} from "@/lib/server/integration-api"
import { listPeople } from "@/lib/server/people"

function directoryEmployee(employee: Awaited<ReturnType<typeof listPeople>>["items"][number]) {
  return {
    employeeId: employee.employee_id,
    displayName: employee.display_name,
    preferredName: employee.preferred_name,
    workEmail: employee.work_email,
    department: employee.department,
    jobTitle: employee.job_title,
    location: employee.location,
    managerId: employee.manager_id,
    managerName: employee.manager_name ?? employee.manager,
    hireDate: employee.hire_date,
    employmentType: employee.employment_type,
    employmentStatus: employee.employment_status,
    tenureYears: employee.tenure_years,
  }
}

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "people:read")
    const params = new URL(request.url).searchParams
    const page = integrationPage(params, 250)
    const population = params.get("population") ?? "current"
    const result = await listPeople({
      search: params.get("search") ?? "",
      department: params.get("department") ?? "",
      location: params.get("location") ?? "",
      status: params.get("status") ?? "",
      employmentType: params.get("employmentType") ?? "",
      tenure: params.get("tenure") ?? "",
      population: (["current", "former", "all"].includes(population) ? population : "current") as "current" | "former" | "all",
      limit: page.limit,
      offset: page.offset,
    })
    const response = integrationResponse(principal, {
      total: result.total,
      limit: page.limit,
      offset: page.offset,
      hasMore: page.offset + result.items.length < result.total,
      items: result.items.map(directoryEmployee),
      dimensions: result.dimensions,
    })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(toIntegrationApiError(error), request, principal)
  }
}
