import { createAiWorkflowDraft, listAiWorkflowDrafts } from "@/lib/server/ai-workflows"
import { toIntegrationApiError } from "@/lib/server/integration-errors"
import {
  auditedIntegrationFailure,
  auditIntegrationRequest,
  authorizeIntegrationRequest,
  integrationResponse,
  IntegrationApiError,
} from "@/lib/server/integration-api"

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "workflows:read")
    const response = integrationResponse(principal, await listAiWorkflowDrafts(principal.actor))
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(toIntegrationApiError(error), request, principal)
  }
}

export async function POST(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "workflows:write")
    let body: unknown
    try { body = await request.json() } catch { throw new IntegrationApiError("A JSON workflow draft is required.", 422) }
    const response = integrationResponse(
      principal,
      await createAiWorkflowDraft(body, principal.actor),
      { status: 201, headers: { "cache-control": "no-store" } },
    )
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(toIntegrationApiError(error), request, principal)
  }
}
