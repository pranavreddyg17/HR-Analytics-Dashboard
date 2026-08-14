import { planAiWorkflow } from "@/lib/server/ai-workflows"
import { toIntegrationApiError } from "@/lib/server/integration-errors"
import {
  auditedIntegrationFailure,
  auditIntegrationRequest,
  authorizeIntegrationRequest,
  integrationResponse,
  IntegrationApiError,
} from "@/lib/server/integration-api"

export async function POST(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "workflows:write")
    let body: unknown
    try { body = await request.json() } catch { throw new IntegrationApiError("A JSON workflow objective is required.", 422) }
    const response = integrationResponse(
      principal,
      { plan: await planAiWorkflow(body, principal.actor), persisted: false },
      { headers: { "cache-control": "no-store" } },
    )
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(toIntegrationApiError(error), request, principal)
  }
}
