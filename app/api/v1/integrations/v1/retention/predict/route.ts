import { predict, RequestValidationError } from "@/lib/server/runtime"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, IntegrationApiError, integrationResponse } from "@/lib/server/integration-api"

export async function POST(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "model:invoke")
    let body: unknown
    try { body = await request.json() } catch { throw new IntegrationApiError("A JSON prediction profile is required.", 422) }
    let result
    try { result = predict(body) } catch (error) {
      if (error instanceof RequestValidationError) throw new IntegrationApiError(error.message, 422)
      throw error
    }
    const response = integrationResponse(principal, result, { headers: { "cache-control": "no-store" } })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(error, request, principal) }
}
