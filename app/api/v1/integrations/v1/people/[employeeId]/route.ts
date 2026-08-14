import { toIntegrationApiError } from "@/lib/server/integration-errors"
import {
  auditedIntegrationFailure,
  auditIntegrationRequest,
  authorizeIntegrationRequest,
  integrationResponse,
  IntegrationApiError,
} from "@/lib/server/integration-api"
import { getPerson } from "@/lib/server/people"

export async function GET(request: Request, context: { params: Promise<{ employeeId: string }> }) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "people:read")
    const { employeeId } = await context.params
    if (!employeeId || employeeId.length > 80) throw new IntegrationApiError("Invalid employee ID.", 422)
    const profile = await getPerson(employeeId, principal.actor)
    const employee = profile.employee
    const response = integrationResponse(principal, {
      employee: {
        employeeId: employee.employee_id,
        displayName: employee.display_name,
        preferredName: employee.preferred_name,
        workEmail: employee.work_email,
        department: employee.department,
        jobTitle: employee.job_title,
        location: employee.location,
        managerId: employee.manager_id,
        managerName: profile.manager?.display_name ?? employee.manager,
        hireDate: employee.hire_date,
        employmentType: employee.employment_type,
        employmentStatus: employee.employment_status,
        tenureYears: employee.tenure_years,
        directReports: profile.directReports.length,
      },
      operations: {
        leaveRequests: profile.leave.length,
        learningAssignments: profile.training.length,
        promotions: profile.promotions.length,
        assignedAssets: profile.assets.length,
        exitWorkflows: profile.exits.length,
      },
    })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(toIntegrationApiError(error), request, principal)
  }
}
