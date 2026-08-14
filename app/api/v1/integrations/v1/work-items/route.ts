import { toIntegrationApiError } from "@/lib/server/integration-errors"
import { integrationPage, pageItems } from "@/lib/server/integration-pagination"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"
import { getInboxOperations } from "@/lib/server/inbox"

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "operations:read")
    const params = new URL(request.url).searchParams
    const result = await getInboxOperations(principal.actor)
    const type = params.get("type")
    const status = params.get("status")
    const items = result.items.filter((item) => (!type || item.type === type) && (!status || item.status.toLowerCase() === status.toLowerCase()))
    const response = integrationResponse(principal, { generatedAt: result.generatedAt, summary: result.summary, workItems: pageItems(items, integrationPage(params)) })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(toIntegrationApiError(error), request, principal) }
}
