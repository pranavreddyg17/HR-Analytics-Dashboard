import { toIntegrationApiError } from "@/lib/server/integration-errors"
import { integrationPage, pageItems } from "@/lib/server/integration-pagination"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"
import { listLeaveOperations } from "@/lib/server/leave"

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "operations:read")
    const params = new URL(request.url).searchParams
    const result = await listLeaveOperations(principal.actor, {
      id: params.get("id") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
      department: params.get("department") ?? undefined,
      location: params.get("location") ?? undefined,
      leaveType: params.get("leaveType") ?? undefined,
      status: params.get("status") ?? undefined,
    })
    const response = integrationResponse(principal, {
      generatedAt: result.generatedAt,
      summary: result.summary,
      dimensions: result.dimensions,
      requests: pageItems(result.requests, integrationPage(params)),
      awayToday: result.awayToday,
      upcoming: result.upcoming,
    })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(toIntegrationApiError(error), request, principal) }
}
