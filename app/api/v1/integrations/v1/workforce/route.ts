import { filtersFromSearchParams, getWorkforceDashboardAnalytics } from "@/lib/server/hr-analytics"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "analytics:read")
    const analytics = await getWorkforceDashboardAnalytics(filtersFromSearchParams(new URL(request.url).searchParams))
    const response = integrationResponse(principal, analytics)
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(error, request, principal) }
}
