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
import { createWorkflow } from "@/lib/server/workflows"

export async function POST(request: Request) {
  let principal
  let claim: IntegrationIdempotencyClaim | undefined
  try {
    principal = await authorizeIntegrationRequest(request, "workflows:write")
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? ""
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new IntegrationApiError("Idempotency-Key must contain between 8 and 200 characters.", 422)
    }
    let body: unknown
    try { body = await request.json() } catch { throw new IntegrationApiError("A JSON workflow request is required.", 422) }
    if (!body || typeof body !== "object" || (body as { confirm?: unknown }).confirm !== true) {
      throw new IntegrationApiError("Set confirm to true after reviewing the workflow request.", 422)
    }
    const workflowRequest = (body as { request?: unknown }).request
    if (!workflowRequest || typeof workflowRequest !== "object") {
      throw new IntegrationApiError("request must contain a supported leave or hiring workflow.", 422)
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
    const result = await createWorkflow(workflowRequest, principal.actor)
    await completeIntegrationIdempotency(claim, 201, result)
    const response = integrationResponse(principal, result, {
      status: 201,
      headers: { "cache-control": "no-store", "idempotency-key": idempotencyKey },
    })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    await releaseIntegrationIdempotency(claim).catch(() => undefined)
    return auditedIntegrationFailure(toIntegrationApiError(error), request, principal)
  }
}
