import { listEmployeeExits } from "@/lib/server/exit-assets"
import { auditIntegrationRequest, auditedIntegrationFailure, authorizeIntegrationRequest, integrationResponse, type IntegrationPrincipal } from "@/lib/server/integration-api"

export async function GET(request: Request) {
  let principal: IntegrationPrincipal | undefined
  try {
    principal = await authorizeIntegrationRequest(request, "operations:read")
    const url = new URL(request.url)
    const data = await listEmployeeExits({
      search: url.searchParams.get("q") ?? "",
      status: url.searchParams.get("status") ?? "",
      horizon: Math.min(365, Math.max(0, Number(url.searchParams.get("horizon") ?? 0) || 0)),
      limit: Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50)),
      offset: Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0),
    })
    await auditIntegrationRequest(principal, request, 200)
    return integrationResponse(principal, data)
  } catch (error) { return auditedIntegrationFailure(error, request, principal) }
}
