import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"
import { agentCatalog } from "@/lib/server/agent-api"

const capabilities = {
  version: "v1",
  dataModel: "one governed workforce workspace per deployment",
  endpoints: [
    { method: "GET", path: "/api/v1/integrations/v1/workforce", scope: "analytics:read", purpose: "Filtered workforce measures and decision-support analytics" },
    { method: "GET", path: "/api/v1/integrations/v1/retention", scope: "retention:read", purpose: "Retention cohorts, model governance, and durable review state" },
    { method: "GET", path: "/api/v1/integrations/v1/operations", scope: "operations:read", purpose: "Actor-neutral operational counts for onboarding, leave, learning, and work queues" },
    { method: "POST", path: "/api/v1/integrations/v1/agents/{agentId}/invoke", scope: "agent:invoke", purpose: "Read-only grounded agent invocation with evidence trace" },
    { method: "POST", path: "/api/v1/integrations/v1/data/import", scope: "data:write", purpose: "Validate or apply a governed domain import" },
  ],
  agents: agentCatalog,
  guarantees: ["PostgreSQL is the system of record", "service credentials are scoped and revocable", "agent tools are read-only", "workflow side effects are not exposed through the integration API", "every authenticated service request is audited"],
}

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "analytics:read")
    const response = integrationResponse(principal, capabilities)
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(error, request, principal) }
}
