import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"
import { agentCatalog } from "@/lib/server/agent-api"

const capabilities = {
  version: "v1",
  dataModel: "one governed workforce workspace per deployment",
  endpoints: [
    { method: "GET", path: "/api/v1/integrations/v1/workforce", scope: "analytics:read", purpose: "Filtered workforce measures and decision-support analytics" },
    { method: "GET", path: "/api/v1/integrations/v1/insights", scope: "analytics:read", purpose: "Bounded overview, workforce-impact, talent-supply, and capability projections" },
    { method: "GET", path: "/api/v1/integrations/v1/people", scope: "people:read", purpose: "Paginated employee directory with operational profile fields" },
    { method: "GET", path: "/api/v1/integrations/v1/people/{employeeId}", scope: "people:read", purpose: "Minimum employee profile and linked operational counts" },
    { method: "GET", path: "/api/v1/integrations/v1/retention", scope: "retention:read", purpose: "Retention cohorts, model governance, and durable review state" },
    { method: "GET", path: "/api/v1/integrations/v1/retention/evidence", scope: "retention:read", purpose: "Explainable operational review signals from current HR records" },
    { method: "GET", path: "/api/v1/integrations/v1/retention/model", scope: "retention:read", purpose: "Prediction model metadata, input contract, and intended-use controls" },
    { method: "POST", path: "/api/v1/integrations/v1/retention/predict", scope: "model:invoke", purpose: "Explainable historical-model scenario assessment" },
    { method: "GET", path: "/api/v1/integrations/v1/operations", scope: "operations:read", purpose: "Actor-neutral operational counts for onboarding, leave, learning, and work queues" },
    { method: "GET", path: "/api/v1/integrations/v1/onboarding", scope: "operations:read", purpose: "Paginated onboarding readiness and employee handoffs" },
    { method: "GET", path: "/api/v1/integrations/v1/recruiting", scope: "operations:read", purpose: "Paginated requisition and candidate pipeline operations" },
    { method: "GET", path: "/api/v1/integrations/v1/leave", scope: "operations:read", purpose: "Filtered leave register, schedule, and coverage" },
    { method: "GET", path: "/api/v1/integrations/v1/learning", scope: "operations:read", purpose: "Learning assignments, capability evidence, and cohort recommendations" },
    { method: "GET", path: "/api/v1/integrations/v1/work-items", scope: "operations:read", purpose: "Paginated operational work queue and durable status" },
    { method: "GET", path: "/api/v1/integrations/v1/work-items/priority-policy", scope: "operations:read", purpose: "Versioned priority factors, thresholds, and decision controls" },
    { method: "GET", path: "/api/v1/integrations/v1/exits", scope: "operations:read", purpose: "Confirmed exit workflows, offboarding progress, asset recovery, and access-removal exceptions" },
    { method: "GET", path: "/api/v1/integrations/v1/assets", scope: "operations:read", purpose: "Equipment inventory, custody, condition, warranty, and lifecycle exceptions" },
    { method: "GET", path: "/api/v1/integrations/v1/assistant/conversations", scope: "assistant:use", purpose: "List service-client-owned assistant conversations" },
    { method: "POST", path: "/api/v1/integrations/v1/assistant/conversations", scope: "assistant:use", purpose: "Start a grounded, context-aware assistant conversation" },
    { method: "GET/DELETE", path: "/api/v1/integrations/v1/assistant/conversations/{conversationId}", scope: "assistant:use", purpose: "Read or delete service-client-owned conversation memory" },
    { method: "POST", path: "/api/v1/integrations/v1/assistant/conversations/{conversationId}/messages", scope: "assistant:use", purpose: "Continue a grounded conversation with persisted context" },
    { method: "POST", path: "/api/v1/integrations/v1/agents/{agentId}/invoke", scope: "agent:invoke", purpose: "Read-only grounded agent invocation with evidence trace" },
    { method: "GET", path: "/api/v1/integrations/v1/workflows/catalog", scope: "workflows:read", purpose: "Discover supported workflow types and execution controls" },
    { method: "POST", path: "/api/v1/integrations/v1/workflows/plan", scope: "workflows:write", purpose: "Convert a natural-language HR objective into a validated non-persisted plan" },
    { method: "GET/POST", path: "/api/v1/integrations/v1/workflows", scope: "workflows:read or workflows:write", purpose: "List or create durable reviewed workflow drafts" },
    { method: "GET", path: "/api/v1/integrations/v1/workflows/{workflowId}", scope: "workflows:read", purpose: "Read a service-client-owned workflow draft and execution status" },
    { method: "POST", path: "/api/v1/integrations/v1/workflows/{workflowId}/execute", scope: "workflows:write", purpose: "Execute a confirmed idempotent internal workflow" },
    { method: "POST", path: "/api/v1/integrations/v1/workflows/requests", scope: "workflows:write", purpose: "Create a confirmed idempotent leave or hiring request in the normal approval queue" },
    { method: "POST", path: "/api/v1/integrations/v1/data/import", scope: "data:write", purpose: "Validate or apply a governed domain import" },
  ],
  agents: agentCatalog,
  guarantees: ["PostgreSQL is the system of record", "service credentials are scoped, expiring, and revocable", "service clients are rate limited", "assistant conversations are isolated per service client", "agent tools are read-only", "work priority is explainable and never makes a decision", "workflow mutations require explicit confirmation and idempotency", "approval and employment decisions are not exposed to service credentials", "every authenticated service request is audited"],
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
