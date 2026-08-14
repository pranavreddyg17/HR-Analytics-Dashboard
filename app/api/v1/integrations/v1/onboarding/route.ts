import { toIntegrationApiError } from "@/lib/server/integration-errors"
import { integrationPage, pageItems } from "@/lib/server/integration-pagination"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"
import { listOnboardingOperations } from "@/lib/server/onboarding"

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "operations:read")
    const result = await listOnboardingOperations(principal.actor)
    const response = integrationResponse(principal, { generatedAt: result.generatedAt, summary: result.summary, joiners: pageItems(result.joiners, integrationPage(new URL(request.url).searchParams)) })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(toIntegrationApiError(error), request, principal) }
}
