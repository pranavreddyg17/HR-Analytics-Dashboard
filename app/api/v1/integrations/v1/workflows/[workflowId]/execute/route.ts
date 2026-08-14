import { executeAiWorkflow, getAiWorkflowDraft } from "@/lib/server/ai-workflows"
import { toIntegrationApiError } from "@/lib/server/integration-errors"
import {
  auditedIntegrationFailure,
  auditIntegrationRequest,
  authorizeIntegrationRequest,
  claimIntegrationIdempotency,
  completeIntegrationIdempotency,
  integrationResponse,
  IntegrationApiError,
  releaseIntegrationIdempotency,
  type IntegrationIdempotencyClaim,
} from "@/lib/server/integration-api"

export async function POST(request: Request, context: { params: Promise<{ workflowId: string }> }) {
  let principal
  let claim: IntegrationIdempotencyClaim | undefined
  try {
    principal = await authorizeIntegrationRequest(request, "workflows:write")
    const { workflowId } = await context.params
    if (!workflowId || workflowId.length > 100) throw new IntegrationApiError("Invalid workflow ID.", 422)
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? ""
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new IntegrationApiError("Idempotency-Key must contain between 8 and 200 characters.", 422)
    }
    let body: unknown
    try { body = await request.json() } catch { throw new IntegrationApiError("A JSON confirmation is required.", 422) }
    if (!body || typeof body !== "object" || (body as { confirm?: unknown }).confirm !== true) {
      throw new IntegrationApiError("Set confirm to true after reviewing the workflow draft.", 422)
    }
    claim = await claimIntegrationIdempotency(principal, request, idempotencyKey, body)
    if (claim.replay) {
      const replay = integrationResponse(principal, claim.replay.data, {
        status: claim.replay.status,
        headers: { "cache-control": "no-store", "idempotency-key": idempotencyKey, "x-idempotent-replay": "true" },
      })
      await auditIntegrationRequest(principal, request, replay.status)
      return replay
    }
    const draft = await getAiWorkflowDraft(workflowId, principal.actor)
    if (principal.kind === "service" && draft.type === "calendar_invite") {
      throw new IntegrationApiError("Calendar execution requires an interactive user with a delegated Google Calendar or Microsoft Teams connection.", 409)
    }
    const result = await executeAiWorkflow(workflowId, principal.actor, request)
    await completeIntegrationIdempotency(claim, 200, result)
    const response = integrationResponse(
      principal,
      result,
      { headers: { "cache-control": "no-store", "idempotency-key": idempotencyKey } },
    )
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    await releaseIntegrationIdempotency(claim).catch(() => undefined)
    return auditedIntegrationFailure(toIntegrationApiError(error), request, principal)
  }
}
