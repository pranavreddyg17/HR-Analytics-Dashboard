const bearer = { type: "http", scheme: "bearer", bearerFormat: "LaidbackHR service credential" }

const operation = (summary: string, scope: string, method: "get" | "post") => ({
  [method]: {
    summary,
    security: [{ serviceCredential: [] }],
    "x-required-scope": scope,
    responses: {
      "200": { description: "Successful response", content: { "application/json": { schema: { $ref: "#/components/schemas/Envelope" } } } },
      "401": { description: "Missing, invalid, expired, or revoked credential" },
      "403": { description: "Credential does not grant the required scope" },
      "422": { description: "Request validation failed" },
    },
  },
})

const workforceParameters = [
  { name: "from", in: "query", schema: { type: "string", format: "date" }, description: "Inclusive reporting start date" },
  { name: "to", in: "query", schema: { type: "string", format: "date" }, description: "Inclusive reporting end date" },
  { name: "department", in: "query", schema: { type: "string" } },
  { name: "jobTitle", in: "query", schema: { type: "string" } },
  { name: "location", in: "query", schema: { type: "string" } },
  { name: "period", in: "query", schema: { type: "string", enum: ["month", "quarter", "year"], default: "month" } },
]

const paginationParameters = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
  { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
]

const identifier = (name: string) => ({ name, in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 100 } })

const jsonBody = (schema: string) => ({ required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } } })

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "LaidbackHR Workforce Intelligence API",
      version: "1.3.0",
      description: "Versioned, scope-controlled access to workforce analytics, operational resources, persisted AI Assistant conversations, governed workflows, retention evidence, model scenarios, imports, and read-only specialist agents.",
    },
    servers: [{ url: origin }],
    paths: {
      "/api/v1/integrations/v1/capabilities": operation("List integration capabilities", "analytics:read", "get"),
      "/api/v1/integrations/v1/workforce": {
        ...operation("Read filtered workforce analytics", "analytics:read", "get"),
        parameters: workforceParameters,
      },
      "/api/v1/integrations/v1/insights": {
        ...operation("Read a bounded reporting projection", "analytics:read", "get"),
        parameters: [...workforceParameters, { name: "view", in: "query", schema: { type: "string", enum: ["overview", "workforce-impact", "talent-supply", "capability"], default: "overview" } }],
      },
      "/api/v1/integrations/v1/people": {
        ...operation("Search the employee directory", "people:read", "get"),
        parameters: [...paginationParameters, ...["search", "department", "location", "status", "employmentType", "tenure", "population"].map((name) => ({ name, in: "query", schema: { type: "string" } }))],
      },
      "/api/v1/integrations/v1/people/{employeeId}": {
        ...operation("Read a minimum employee operational profile", "people:read", "get"),
        parameters: [identifier("employeeId")],
      },
      "/api/v1/integrations/v1/retention": operation("Read retention intelligence and review state", "retention:read", "get"),
      "/api/v1/integrations/v1/retention/evidence": {
        ...operation("Read explainable operational retention evidence", "retention:read", "get"),
        parameters: [{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } }],
      },
      "/api/v1/integrations/v1/retention/model": operation("Read retention model metadata and input contract", "retention:read", "get"),
      "/api/v1/integrations/v1/retention/predict": {
        post: {
          ...operation("Run an explainable retention-model scenario", "model:invoke", "post").post,
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PredictionInput" } } } },
        },
      },
      "/api/v1/integrations/v1/operations": operation("Read operational queues and domain summaries", "operations:read", "get"),
      "/api/v1/integrations/v1/onboarding": { ...operation("Read onboarding readiness", "operations:read", "get"), parameters: paginationParameters },
      "/api/v1/integrations/v1/recruiting": { ...operation("Read requisition and candidate operations", "operations:read", "get"), parameters: paginationParameters },
      "/api/v1/integrations/v1/leave": {
        ...operation("Read the filtered leave register", "operations:read", "get"),
        parameters: [...paginationParameters, ...["id", "from", "to", "department", "location", "leaveType", "status"].map((name) => ({ name, in: "query", schema: { type: "string" } }))],
      },
      "/api/v1/integrations/v1/learning": {
        ...operation("Read learning assignments and capability recommendations", "operations:read", "get"),
        parameters: [...paginationParameters, ...["department", "location"].map((name) => ({ name, in: "query", schema: { type: "string" } }))],
      },
      "/api/v1/integrations/v1/work-items": {
        ...operation("Read the operational work queue", "operations:read", "get"),
        parameters: [...paginationParameters, ...["type", "status"].map((name) => ({ name, in: "query", schema: { type: "string" } }))],
      },
      "/api/v1/integrations/v1/work-items/priority-policy": operation("Read the versioned work-priority policy", "operations:read", "get"),
      "/api/v1/integrations/v1/exits": operation("Read confirmed employee exits and offboarding progress", "operations:read", "get"),
      "/api/v1/integrations/v1/assets": operation("Read asset inventory, custody, and lifecycle status", "operations:read", "get"),
      "/api/v1/integrations/v1/assistant/conversations": {
        ...operation("List service-client-owned assistant conversations", "assistant:use", "get"),
        post: { ...operation("Start a grounded assistant conversation", "assistant:use", "post").post, requestBody: jsonBody("AssistantTurn") },
      },
      "/api/v1/integrations/v1/assistant/conversations/{conversationId}": {
        ...operation("Read a service-client-owned assistant conversation", "assistant:use", "get"),
        parameters: [identifier("conversationId")],
        delete: {
          summary: "Delete a service-client-owned assistant conversation",
          security: [{ serviceCredential: [] }],
          "x-required-scope": "assistant:use",
          responses: operation("Delete conversation", "assistant:use", "post").post.responses,
        },
      },
      "/api/v1/integrations/v1/assistant/conversations/{conversationId}/messages": {
        parameters: [identifier("conversationId")],
        post: { ...operation("Continue a grounded assistant conversation", "assistant:use", "post").post, requestBody: jsonBody("AssistantTurn") },
      },
      "/api/v1/integrations/v1/agents/{agentId}/invoke": {
        ...operation("Invoke a read-only workforce agent", "agent:invoke", "post"),
        parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", enum: ["workforce-intelligence", "retention-planner", "recruiting-operations", "learning-compliance", "people-operations"] } }],
        post: {
          ...operation("Invoke a read-only workforce agent", "agent:invoke", "post").post,
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AgentInvocation" } } } },
        },
      },
      "/api/v1/integrations/v1/workflows/catalog": operation("List supported workflow types and controls", "workflows:read", "get"),
      "/api/v1/integrations/v1/workflows/plan": {
        post: { ...operation("Plan a validated HR workflow without persisting it", "workflows:write", "post").post, requestBody: jsonBody("WorkflowPlanRequest") },
      },
      "/api/v1/integrations/v1/workflows": {
        ...operation("List service-client-owned workflow drafts", "workflows:read", "get"),
        post: { ...operation("Create a reviewed workflow draft", "workflows:write", "post").post, requestBody: jsonBody("WorkflowDraft") },
      },
      "/api/v1/integrations/v1/workflows/{workflowId}": {
        ...operation("Read a workflow draft and execution state", "workflows:read", "get"),
        parameters: [identifier("workflowId")],
      },
      "/api/v1/integrations/v1/workflows/{workflowId}/execute": {
        parameters: [identifier("workflowId"), { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8, maxLength: 200 } }],
        post: { ...operation("Execute a confirmed internal workflow", "workflows:write", "post").post, requestBody: jsonBody("WorkflowConfirmation") },
      },
      "/api/v1/integrations/v1/workflows/requests": {
        parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8, maxLength: 200 } }],
        post: { ...operation("Create a confirmed leave or hiring request", "workflows:write", "post").post, requestBody: jsonBody("WorkflowRequest") },
      },
      "/api/v1/integrations/v1/data/import": {
        post: {
          ...operation("Validate or apply a governed HR-domain import", "data:write", "post").post,
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ImportRequest" } } } },
        },
      },
    },
    components: {
      securitySchemes: { serviceCredential: bearer },
      schemas: {
        Envelope: {
          type: "object",
          required: ["data", "meta"],
          properties: {
            data: {},
            meta: {
              type: "object",
              required: ["requestId", "workspaceId", "generatedAt"],
              properties: { requestId: { type: "string" }, workspaceId: { type: "string" }, generatedAt: { type: "string", format: "date-time" } },
            },
          },
        },
        AgentInvocation: {
          type: "object",
          additionalProperties: false,
          required: ["objective"],
          properties: { objective: { type: "string", minLength: 1, maxLength: 2_000, description: "Purpose-limited workforce question for the selected read-only agent" } },
        },
        AssistantTurn: {
          type: "object",
          additionalProperties: false,
          required: ["message"],
          properties: {
            message: { type: "string", minLength: 1, maxLength: 2_000 },
            pageContext: {
              type: "object",
              additionalProperties: false,
              required: ["route"],
              properties: { route: { type: "string", pattern: "^/", maxLength: 180 }, filters: { type: "object", additionalProperties: { type: "string" } } },
            },
          },
        },
        WorkflowPlanRequest: {
          type: "object",
          additionalProperties: false,
          required: ["prompt"],
          properties: { prompt: { type: "string", minLength: 10, maxLength: 1_200 } },
        },
        WorkflowDraft: {
          oneOf: [
            { type: "object", required: ["type", "targetType", "courseId", "dueDate"], properties: { type: { const: "learning_assignment" }, targetType: { type: "string", enum: ["department", "job_title", "job_level", "manager_team", "job_profile"] }, targetValue: { type: "string" }, courseId: { type: "string" }, dueDate: { type: "string", format: "date" }, hours: { type: "number" }, note: { type: "string" } } },
            { type: "object", required: ["type", "position", "department", "location", "employmentType", "justification"], properties: { type: { const: "hiring_requisition" }, position: { type: "string" }, department: { type: "string" }, location: { type: "string" }, employmentType: { type: "string" }, justification: { type: "string" } } },
            { type: "object", required: ["type", "department"], properties: { type: { const: "retention_review" }, department: { type: "string" } } },
            { type: "object", required: ["type", "employeeIds", "title", "start", "end", "timezone", "agenda"], properties: { type: { const: "calendar_invite" }, calendarProvider: { type: "string", enum: ["google", "microsoft_teams"] }, employeeIds: { type: "array", maxItems: 20, items: { type: "string" } }, title: { type: "string" }, start: { type: "string" }, end: { type: "string" }, timezone: { type: "string" }, agenda: { type: "string" } } },
            { type: "object", required: ["type", "employeeIds", "subject", "message"], properties: { type: { const: "employee_email" }, employeeIds: { type: "array", maxItems: 20, items: { type: "string" } }, subject: { type: "string" }, message: { type: "string" } } },
          ],
        },
        WorkflowConfirmation: { type: "object", additionalProperties: false, required: ["confirm"], properties: { confirm: { const: true } } },
        WorkflowRequest: {
          type: "object",
          additionalProperties: false,
          required: ["confirm", "request"],
          properties: {
            confirm: { const: true },
            request: { type: "object", description: "A browser-workflow-compatible leave or hiring request. Use the workflow catalog for supported fields." },
          },
        },
        PredictionInput: {
          type: "object",
          additionalProperties: false,
          required: ["Department", "EducationField", "DistanceFromHome", "MonthlyIncome", "Education", "EnvironmentSatisfaction", "JobSatisfaction", "WorkLifeBalance", "NumCompaniesWorked", "YearsAtCompany"],
          properties: {
            Department: { type: "string", enum: ["Human Resources", "Research & Development", "Sales"] },
            EducationField: { type: "string" },
            DistanceFromHome: { type: "integer", minimum: 1, maximum: 29 },
            MonthlyIncome: { type: "integer", minimum: 1009, maximum: 19999 },
            Education: { type: "integer", minimum: 1, maximum: 5 },
            EnvironmentSatisfaction: { type: "integer", minimum: 1, maximum: 4 },
            JobSatisfaction: { type: "integer", minimum: 1, maximum: 4 },
            WorkLifeBalance: { type: "integer", minimum: 1, maximum: 4 },
            NumCompaniesWorked: { type: "integer", minimum: 0, maximum: 9 },
            YearsAtCompany: { type: "integer", minimum: 0, maximum: 40 },
          },
        },
        ImportRequest: {
          type: "object",
          additionalProperties: false,
          required: ["action", "domain", "rows"],
          properties: {
            action: { type: "string", enum: ["validate", "apply"] },
            domain: { type: "string", enum: ["employees", "hiring", "attrition", "leave", "training", "promotions"] },
            filename: { type: "string" },
            mode: { type: "string", enum: ["merge", "replace_imported"], default: "merge" },
            rows: { type: "array", maxItems: 5_000, items: { type: "object", additionalProperties: true } },
          },
        },
      },
    },
  }, { headers: { "cache-control": "public, max-age=300" } })
}
