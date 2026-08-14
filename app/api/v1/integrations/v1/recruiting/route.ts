import { toIntegrationApiError } from "@/lib/server/integration-errors"
import { integrationPage, pageItems } from "@/lib/server/integration-pagination"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"
import { listHiringOperations } from "@/lib/server/hiring"

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "operations:read")
    const page = integrationPage(new URL(request.url).searchParams)
    const result = await listHiringOperations(principal.actor)
    const response = integrationResponse(principal, {
      generatedAt: result.generatedAt,
      summary: result.summary,
      stageCounts: result.stageCounts,
      requisitions: pageItems(result.requisitions, page),
      candidates: pageItems(result.candidates, page),
      recentActivity: result.recentActivity.slice(0, 25),
      recentHires: result.recentHires,
    })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(toIntegrationApiError(error), request, principal) }
}
