import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { getRequestActor, type RequestActor } from "@/lib/server/request-user"

const integrationScopes = [
  "analytics:read",
  "retention:read",
  "model:invoke",
  "operations:read",
  "agent:invoke",
  "data:write",
] as const

export type IntegrationScope = typeof integrationScopes[number]

const SERVICE_RATE_LIMIT = 120

export type IntegrationPrincipal = {
  kind: "session" | "service"
  actor: RequestActor
  organizationId: string
  clientId: string | null
  scopes: IntegrationScope[]
  requestId: string
  startedAt: number
}

type ClientRow = {
  id: string
  organization_id: string
  name: string
  key_hash: string
  key_prefix: string
  scopes_json: string
  status: string
  expires_at: string
  last_used_at: string | null
  created_by_email: string
  created_at: string
}

export class IntegrationApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

function keyHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8")
  const b = Buffer.from(right, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}

function parseScopes(value: string): IntegrationScope[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((scope): scope is IntegrationScope => integrationScopes.includes(scope)) : []
  } catch { return [] }
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim() ?? ""
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : null
}

export async function authorizeIntegrationRequest(request: Request, required: IntegrationScope): Promise<IntegrationPrincipal> {
  const requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID()
  const token = bearerToken(request)
  if (!token) {
    const sessionActor = await getRequestActor(request)
    if (sessionActor && ["admin", "hr"].includes(sessionActor.role)) {
      return { kind: "session", actor: sessionActor, organizationId: "org:laidbackhr", clientId: null, scopes: [...integrationScopes], requestId, startedAt: Date.now() }
    }
    throw new IntegrationApiError("A valid Bearer service credential is required.", 401)
  }
  const parts = token?.split(".") ?? []
  if (parts.length !== 3 || parts[0] !== "lbh" || !/^IC-[A-Z0-9]{12}$/.test(parts[1])) {
    throw new IntegrationApiError("A valid Bearer service credential is required.", 401)
  }
  const database = await ensureHrDatabase()
  const row = await database.prepare("SELECT * FROM integration_clients WHERE id=?")
    .bind(parts[1]).first<ClientRow>()
  if (!row || row.status !== "active" || new Date(row.expires_at).getTime() <= Date.now() || !secureEqual(row.key_hash, keyHash(token!))) {
    throw new IntegrationApiError("The service credential is invalid, expired, or revoked.", 401)
  }
  const scopes = parseScopes(row.scopes_json)
  const principal: IntegrationPrincipal = {
    kind: "service",
    actor: { email: `service:${row.id}@laidbackhr.internal`, displayName: row.name, role: "hr" },
    organizationId: row.organization_id,
    clientId: row.id,
    scopes,
    requestId,
    startedAt: Date.now(),
  }
  if (!scopes.includes(required)) {
    await auditIntegrationRequest(principal, request, 403)
    throw new IntegrationApiError(`The service credential does not grant ${required}.`, 403)
  }
  const recent = await database.prepare(`SELECT COUNT(*) AS count FROM integration_api_audit
    WHERE client_id=? AND created_at::timestamptz >= CURRENT_TIMESTAMP - INTERVAL '1 minute'`).bind(row.id).first<{ count: number }>()
  if (Number(recent?.count ?? 0) >= SERVICE_RATE_LIMIT) {
    await auditIntegrationRequest(principal, request, 429)
    throw new IntegrationApiError("The client rate limit was exceeded. Retry after 60 seconds.", 429)
  }
  await database.prepare("UPDATE integration_clients SET last_used_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run()
  return principal
}

export async function auditIntegrationRequest(principal: IntegrationPrincipal, request: Request, statusCode: number): Promise<void> {
  const database = await ensureHrDatabase()
  await database.prepare(`INSERT INTO integration_api_audit(id, client_id, organization_id, actor_email, method, route, status_code, duration_ms, request_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), principal.clientId, principal.organizationId, principal.actor.email, request.method, new URL(request.url).pathname, statusCode, Date.now() - principal.startedAt, principal.requestId).run()
}

export async function listIntegrationClients(): Promise<Array<Record<string, unknown>>> {
  const database = await ensureHrDatabase()
  const result = await database.prepare(`SELECT id, name, key_prefix AS "keyPrefix", scopes_json AS "scopesJson", status,
    expires_at AS "expiresAt", last_used_at AS "lastUsedAt", created_by_email AS "createdByEmail", created_at AS "createdAt"
    FROM integration_clients ORDER BY created_at DESC`).all<Record<string, unknown>>()
  return (result.results ?? []).map((row) => ({ ...row, scopes: parseScopes(String(row.scopesJson ?? "[]")), scopesJson: undefined }))
}

export async function createIntegrationClient(value: unknown, actor: RequestActor): Promise<{ client: Record<string, unknown>; apiKey: string }> {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
  const scopes = Array.isArray(body.scopes)
    ? [...new Set(body.scopes.filter((scope): scope is IntegrationScope => typeof scope === "string" && integrationScopes.includes(scope as IntegrationScope)))]
    : []
  if (name.length < 3) throw new IntegrationApiError("Client name must contain at least 3 characters.", 422)
  if (!scopes.length) throw new IntegrationApiError("Select at least one API scope.", 422)
  const requestedDays = Number(body.expiresInDays ?? 90)
  const expiresInDays = Number.isFinite(requestedDays) ? Math.min(365, Math.max(1, Math.round(requestedDays))) : 90
  const id = `IC-${randomBytes(6).toString("hex").toUpperCase()}`
  const secret = randomBytes(32).toString("base64url")
  const apiKey = `lbh.${id}.${secret}`
  const keyPrefix = `lbh.${id}.${secret.slice(0, 6)}…`
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
  const database = await ensureHrDatabase()
  await database.prepare(`INSERT INTO integration_clients(id, organization_id, name, key_hash, key_prefix, scopes_json, expires_at, created_by_email)
    VALUES (?, 'org:laidbackhr', ?, ?, ?, ?, ?, ?)`)
    .bind(id, name, keyHash(apiKey), keyPrefix, JSON.stringify(scopes), expiresAt, actor.email).run()
  return { client: { id, name, keyPrefix, scopes, status: "active", expiresAt, lastUsedAt: null }, apiKey }
}

export async function revokeIntegrationClient(id: string): Promise<{ id: string; status: "revoked" }> {
  if (!/^IC-[A-Z0-9]{12}$/.test(id)) throw new IntegrationApiError("API client was not found.", 404)
  const database = await ensureHrDatabase()
  const row = await database.prepare("SELECT id FROM integration_clients WHERE id=?").bind(id).first<{ id: string }>()
  if (!row) throw new IntegrationApiError("API client was not found.", 404)
  await database.prepare("UPDATE integration_clients SET status='revoked', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run()
  return { id, status: "revoked" }
}

export function integrationFailure(error: unknown): Response {
  const status = error instanceof IntegrationApiError ? error.status : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
  return Response.json({ error: { code: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 429 ? "rate_limited" : status === 422 ? "invalid_request" : status === 404 ? "not_found" : "internal_error", message: error instanceof Error ? error.message : "Integration request failed." } }, { status, headers: status === 429 ? { "retry-after": "60" } : undefined })
}

export async function auditedIntegrationFailure(error: unknown, request: Request, principal?: IntegrationPrincipal): Promise<Response> {
  const response = integrationFailure(error)
  if (principal) {
    try { await auditIntegrationRequest(principal, request, response.status) } catch { /* Preserve the original API response if audit storage is unavailable. */ }
  }
  return response
}

export function integrationResponse(principal: IntegrationPrincipal, data: unknown, init?: ResponseInit): Response {
  return Response.json({ data, meta: { requestId: principal.requestId, workspaceId: principal.organizationId, generatedAt: new Date().toISOString() } }, {
    ...init,
    headers: { "cache-control": "private, max-age=30", "x-request-id": principal.requestId, ...(init?.headers ?? {}) },
  })
}
