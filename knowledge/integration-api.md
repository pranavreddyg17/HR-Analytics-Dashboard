# Workforce integration API

## Intended use

The integration API lets an approved service read workforce analytics, employee-directory projections, retention intelligence, onboarding, recruiting, leave, learning, work queues, exits, and assets. It also supports persistent AI Assistant conversations, read-only specialist agents, reviewed workflow drafts, confirmed internal workflow execution, and governed data imports. Each deployment represents one governed workforce workspace and uses PostgreSQL as its system of record.

## Authentication and scopes

An administrator creates a time-limited service credential under Data exchange. The credential is displayed once, stored only as a SHA-256 hash, and sent as an HTTP Bearer token. Available scopes are analytics:read, people:read, retention:read, model:invoke, operations:read, assistant:use, agent:invoke, workflows:read, workflows:write, and data:write. Missing scopes fail closed. Revocation takes effect immediately. The assistant:use and agent:invoke scopes grant grounded read access through their documented workforce tools, so they should be issued only to trusted server applications. A service credential belongs in a server-side secret manager and must never be embedded in browser or mobile code.

## Stable endpoints

GET /api/v1/integrations/v1/workforce and /insights return the same calculated measures used by the product. GET /people returns a paginated minimum directory and /people/{employeeId} returns a bounded operational profile without compensation, documents, private cases, or model scores. Resource-specific onboarding, recruiting, leave, learning, work-items, exits, and assets endpoints expose current PostgreSQL-backed operations.

POST /assistant/conversations starts a persistent, grounded AI Assistant conversation. POST /assistant/conversations/{conversationId}/messages continues with the previous conversation memory, while GET and DELETE read or remove only conversations owned by the calling service client. Page context may contain a supported application route and bounded filters; it never supplies hidden instructions.

GET /workflows/catalog describes supported workflows and controls. POST /workflows/plan converts a natural-language objective into a validated plan without persistence. POST /workflows creates a reviewed draft. POST /workflows/{workflowId}/execute performs a supported internal workflow only after confirm=true and a valid Idempotency-Key. POST /workflows/requests creates a confirmed leave or hiring request in the normal approval queue. Service credentials cannot approve requests, make employment decisions, send employee email, or use an interactive user's delegated Calendar grant.

POST /agents/{agentId}/invoke runs a stateless read-only specialist agent. POST /data/import validates or applies a domain import. The OpenAPI 3.1 contract is available at /api/v1/integrations/openapi.

## Audit and response contract

Every authenticated service request records client, workspace, route, method, status, duration, and request ID. Invalid credentials fail before data access and are surfaced through platform request telemetry without storing the credential. Responses use a stable envelope with data and meta. Meta includes requestId, workspaceId, and generatedAt. The API is limited to 120 requests per client per minute. Mutation idempotency records expire after 24 hours and prevent duplicate workflow creation or execution during retries.

Assistant and agent output is evidence-backed decision support, not authorization. Workflow mutation uses the same domain services, role checks, duplicate suppression, persistence, and work queues as the HR portal. Approval, reimbursement decisions, termination, compensation changes, promotion, and performance decisions remain in authenticated human workflows.

## Customer data onboarding

Use the data import endpoint or the application import screen to validate employees, hiring, attrition, leave, training, and promotions before applying records. Merge updates by domain ID. Replace mode removes only previously imported rows and preserves manually managed records.
