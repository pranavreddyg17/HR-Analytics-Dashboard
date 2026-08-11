import { hrDomains, type HrDomain } from "@/lib/hr-types"
import { importHrData, validateHrImport } from "@/lib/server/hr-repository"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse, IntegrationApiError } from "@/lib/server/integration-api"

export async function POST(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "data:write")
    const body = await request.json() as { action?: unknown; domain?: unknown; rows?: unknown; filename?: unknown; mode?: unknown }
    if (body.action !== "validate" && body.action !== "apply") throw new IntegrationApiError("action must be validate or apply.", 422)
    if (typeof body.domain !== "string" || !hrDomains.includes(body.domain as HrDomain)) throw new IntegrationApiError("Unsupported HR data domain.", 422)
    if (!Array.isArray(body.rows)) throw new IntegrationApiError("rows must be an array.", 422)
    const input = {
      domain: body.domain as HrDomain,
      rows: body.rows,
      filename: typeof body.filename === "string" ? body.filename : `${body.domain}.json`,
      mode: body.mode === "replace_imported" ? "replace_imported" as const : "merge" as const,
    }
    const data = body.action === "validate"
      ? await validateHrImport(input)
      : await importHrData({ ...input, actorEmail: principal.actor.email })
    const response = integrationResponse(principal, data, { status: body.action === "apply" ? 201 : 200 })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(error, request, principal) }
}
