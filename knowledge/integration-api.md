# Workforce integration API

## Intended use

The integration API lets an approved service read workforce analytics, retention intelligence, and operational queues; invoke read-only workforce agents; or validate and apply governed imports. Each deployment represents one governed workforce workspace and uses PostgreSQL as its system of record.

## Authentication and scopes

An administrator creates a time-limited service credential under Data exchange. The credential is displayed once, stored only as a SHA-256 hash, and sent as an HTTP Bearer token. Scopes are analytics:read, retention:read, operations:read, agent:invoke, and data:write. Missing scopes fail closed. Revocation takes effect immediately.

## Stable endpoints

GET /api/v1/integrations/v1/workforce returns filtered workforce measures and decision support. GET /retention returns retention cohorts, model governance, and durable review state. GET /operations returns bounded onboarding, leave, learning, and work-queue records. POST /agents/{agentId}/invoke runs a read-only grounded agent. POST /data/import validates or applies a domain import. The OpenAPI 3.1 contract is available at /api/v1/integrations/openapi.

## Audit and response contract

Every authenticated service request records client, workspace, route, method, status, duration, and request ID. Invalid credentials fail before data access and are surfaced through platform request telemetry without storing the credential. Responses use a stable envelope with data and meta. Meta includes requestId, workspaceId, and generatedAt. Integration endpoints never expose workflow execution or bypass application approval controls.

## Customer data onboarding

Use the data import endpoint or the application import screen to validate employees, hiring, attrition, leave, training, and promotions before applying records. Merge updates by domain ID. Replace mode removes only previously imported rows and preserves manually managed records.
