import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"
import { agentCatalog } from "@/lib/server/agent-api"

const capabilities = {
  version: "v1",
  dataModel: "one governed workforce workspace per deployment",
  endpoints: [
    { method: "GET", path: "/api/v1/integrations/v1/workforce", scope: "analytics:read", purpose: "Filtered workforce measures and decision-support analytics" },
    { method: "GET", path: "/api/v1/integrations/v1/insights", scope: "analytics:read", purpose: "Bounded overview, workforce-impact, talent-supply, and capability projections" },
    { method: "GET", path: "/api/v1/integrations/v1/retention", scope: "retention:read", purpose: "Retention cohorts, model governance, and durable review state" },
    { method: "GET", path: "/api/v1/integrations/v1/retention/model", scope: "retention:read", purpose: "Prediction model metadata, input contract, and intended-use controls" },
    { method: "POST", path: "/api/v1/integrations/v1/retention/predict", scope: "model:invoke", purpose: "Explainable historical-model scenario assessment" },
    { method: "GET", path: "/api/v1/integrations/v1/operations", scope: "operations:read", purpose: "Actor-neutral operational counts for onboarding, leave, learning, and work queues" },
    { method: "GET", path: "/api/v1/integrations/v1/exits", scope: "operations:read", purpose: "Confirmed exit workflows, offboarding progress, asset recovery, and access-removal exceptions" },
    { method: "GET", path: "/api/v1/integrations/v1/assets", scope: "operations:read", purpose: "Equipment inventory, custody, condition, warranty, and lifecycle exceptions" },
    { method: "POST", path: "/api/v1/integrations/v1/agents/{agentId}/invoke", scope: "agent:invoke", purpose: "Read-only grounded agent invocation with evidence trace" },
    { method: "POST", path: "/api/v1/integrations/v1/data/import", scope: "data:write", purpose: "Validate or apply a governed domain import" },
  ],
  agents: agentCatalog,
  guarantees: ["PostgreSQL is the system of record", "service credentials are scoped, expiring, and revocable", "service clients are rate limited", "agent tools are read-only", "workflow side effects are not exposed through the integration API", "every authenticated service request is audited"],
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
