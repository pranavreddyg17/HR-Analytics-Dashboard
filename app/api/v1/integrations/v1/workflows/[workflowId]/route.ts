import { getAiWorkflowDraft } from "@/lib/server/ai-workflows"
import { toIntegrationApiError } from "@/lib/server/integration-errors"
import {
  auditedIntegrationFailure,
  auditIntegrationRequest,
  authorizeIntegrationRequest,
  integrationResponse,
  IntegrationApiError,
} from "@/lib/server/integration-api"

export async function GET(request: Request, context: { params: Promise<{ workflowId: string }> }) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "workflows:read")
    const { workflowId } = await context.params
    if (!workflowId || workflowId.length > 100) throw new IntegrationApiError("Invalid workflow ID.", 422)
    const response = integrationResponse(principal, { workflow: await getAiWorkflowDraft(workflowId, principal.actor) })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(toIntegrationApiError(error), request, principal)
  }
}
