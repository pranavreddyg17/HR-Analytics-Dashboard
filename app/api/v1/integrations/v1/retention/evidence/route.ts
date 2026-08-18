import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"
import { getOperationalRetentionEvidence } from "@/lib/server/operational-retention"

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "retention:read")
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100)
    const response = integrationResponse(principal, await getOperationalRetentionEvidence(limit))
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(error, request, principal)
  }
}
