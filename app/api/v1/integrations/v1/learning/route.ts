import { toIntegrationApiError } from "@/lib/server/integration-errors"
import { integrationPage, pageItems } from "@/lib/server/integration-pagination"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"
import { listLearningOperations } from "@/lib/server/learning"

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "operations:read")
    const params = new URL(request.url).searchParams
    const result = await listLearningOperations(principal.actor, {
      department: params.get("department") ?? undefined,
      location: params.get("location") ?? undefined,
    })
    const response = integrationResponse(principal, {
      generatedAt: result.generatedAt,
      summary: result.summary,
      dimensions: result.dimensions,
      courses: result.courses,
      skills: result.skills,
      assignments: pageItems(result.assignments, integrationPage(params)),
      departmentCoverage: result.departmentCoverage,
      recommendations: result.recommendations,
    })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(toIntegrationApiError(error), request, principal) }
}
