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

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "LaidbackHR Workforce Intelligence API",
      version: "1.1.0",
      description: "Versioned, scope-controlled access to workforce analytics, reporting projections, retention evidence and model scenarios, operations, governed imports, and read-only AI agents.",
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
      "/api/v1/integrations/v1/retention": operation("Read retention intelligence and review state", "retention:read", "get"),
      "/api/v1/integrations/v1/retention/model": operation("Read retention model metadata and input contract", "retention:read", "get"),
      "/api/v1/integrations/v1/retention/predict": {
        post: {
          ...operation("Run an explainable retention-model scenario", "model:invoke", "post").post,
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PredictionInput" } } } },
        },
      },
      "/api/v1/integrations/v1/operations": operation("Read operational queues and domain summaries", "operations:read", "get"),
      "/api/v1/integrations/v1/agents/{agentId}/invoke": {
        ...operation("Invoke a read-only workforce agent", "agent:invoke", "post"),
        parameters: [{ name: "agentId", in: "path", required: true, schema: { type: "string", enum: ["workforce-intelligence", "retention-planner", "recruiting-operations", "learning-compliance", "people-operations"] } }],
        post: {
          ...operation("Invoke a read-only workforce agent", "agent:invoke", "post").post,
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AgentInvocation" } } } },
        },
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
