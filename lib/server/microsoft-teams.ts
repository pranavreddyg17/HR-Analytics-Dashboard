import { getToken } from "next-auth/jwt"

import { runtimeEnv } from "@/lib/server/runtime-env"

const runtime = runtimeEnv as {
  AUTH_SECRET?: string
  MICROSOFT_ENTRA_ENABLED?: string
  MICROSOFT_ENTRA_CLIENT_ID?: string
  MICROSOFT_ENTRA_CLIENT_SECRET?: string
  MICROSOFT_ENTRA_TENANT_ID?: string
}

const localAuthSecret = "laidbackhr-local-development-secret-change-me"
const graphScopes = "openid profile email offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Calendars.ReadWrite"

const graphTimeZones: Record<string, string> = {
  "America/Los_Angeles": "Pacific Standard Time",
  "America/New_York": "Eastern Standard Time",
  "Europe/London": "GMT Standard Time",
  "Asia/Kolkata": "India Standard Time",
  UTC: "UTC",
}

type TeamsToken = {
  microsoftTeamsAccessToken?: string
  microsoftTeamsRefreshToken?: string
  microsoftTeamsAccessTokenExpiresAt?: number
  microsoftTenantId?: string
}

type TeamsMeetingInput = {
  workflowId: string
  title: string
  start: string
  end: string
  timezone: string
  location?: string
  agenda: string
  attendees: Array<{ email: string; name: string }>
}

type GraphError = { error?: { code?: string; message?: string } }

export class MicrosoftTeamsError extends Error {
  constructor(message: string, public status = 500, public code = "MICROSOFT_TEAMS_ERROR") {
    super(message)
  }
}

function configured(): boolean {
  return runtime.MICROSOFT_ENTRA_ENABLED === "true"
    && Boolean(runtime.MICROSOFT_ENTRA_CLIENT_ID && runtime.MICROSOFT_ENTRA_CLIENT_SECRET && runtime.MICROSOFT_ENTRA_TENANT_ID)
}

async function readTeamsToken(request: Request): Promise<TeamsToken | null> {
  const cookieNames = [
    "__Secure-authjs.session-token",
    "authjs.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
  ]
  let token: TeamsToken | null = null
  for (const cookieName of cookieNames) {
    const candidate = await getToken({
      req: request,
      secret: runtime.AUTH_SECRET ?? localAuthSecret,
      cookieName,
      secureCookie: cookieName.startsWith("__Secure-"),
    }) as TeamsToken | null
    if (candidate?.microsoftTeamsAccessToken || candidate?.microsoftTeamsRefreshToken) return candidate
    if (!token && candidate) token = candidate
  }
  return token
}

async function refreshAccessToken(refreshToken: string, tenantId: string): Promise<string> {
  if (!configured()) throw new MicrosoftTeamsError("Microsoft Teams is not configured for this workspace.", 503, "MICROSOFT_TEAMS_NOT_CONFIGURED")
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: runtime.MICROSOFT_ENTRA_CLIENT_ID!,
      client_secret: runtime.MICROSOFT_ENTRA_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: graphScopes,
    }),
  })
  const body = await response.json() as { access_token?: string }
  if (!response.ok || !body.access_token) {
    throw new MicrosoftTeamsError("Connect Microsoft Teams again to renew calendar access.", 409, "MICROSOFT_TEAMS_CONNECT_REQUIRED")
  }
  return body.access_token
}

async function teamsAccessToken(request: Request): Promise<string> {
  if (!configured()) throw new MicrosoftTeamsError("Microsoft Teams is not configured for this workspace.", 503, "MICROSOFT_TEAMS_NOT_CONFIGURED")
  const token = await readTeamsToken(request)
  if (!token?.microsoftTeamsAccessToken) {
    throw new MicrosoftTeamsError("Connect Microsoft Teams before creating a meeting.", 409, "MICROSOFT_TEAMS_CONNECT_REQUIRED")
  }
  const expiresAt = Number(token.microsoftTeamsAccessTokenExpiresAt ?? 0) * 1000
  if (!expiresAt || expiresAt > Date.now() + 60_000) return token.microsoftTeamsAccessToken
  if (!token.microsoftTeamsRefreshToken) {
    throw new MicrosoftTeamsError("Connect Microsoft Teams again to renew calendar access.", 409, "MICROSOFT_TEAMS_CONNECT_REQUIRED")
  }
  return refreshAccessToken(token.microsoftTeamsRefreshToken, token.microsoftTenantId ?? runtime.MICROSOFT_ENTRA_TENANT_ID!)
}

export async function getMicrosoftTeamsConnection(request: Request) {
  if (!configured()) return { configured: false, connected: false, expiresAt: null, canRefresh: false }
  const token = await readTeamsToken(request)
  return {
    configured: true,
    connected: Boolean(token?.microsoftTeamsAccessToken || token?.microsoftTeamsRefreshToken),
    expiresAt: token?.microsoftTeamsAccessTokenExpiresAt ? new Date(token.microsoftTeamsAccessTokenExpiresAt * 1000).toISOString() : null,
    canRefresh: Boolean(token?.microsoftTeamsRefreshToken),
  }
}

export async function createMicrosoftTeamsMeeting(request: Request, input: TeamsMeetingInput) {
  const accessToken = await teamsAccessToken(request)
  const response = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      Prefer: `outlook.timezone="${graphTimeZones[input.timezone] ?? "UTC"}"`,
    },
    body: JSON.stringify({
      subject: input.title,
      body: { contentType: "text", content: input.agenda },
      start: { dateTime: `${input.start}:00`, timeZone: graphTimeZones[input.timezone] ?? "UTC" },
      end: { dateTime: `${input.end}:00`, timeZone: graphTimeZones[input.timezone] ?? "UTC" },
      location: input.location ? { displayName: input.location } : undefined,
      attendees: input.attendees.map((attendee) => ({
        emailAddress: { address: attendee.email, name: attendee.name },
        type: "required",
      })),
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      allowNewTimeProposals: true,
      transactionId: input.workflowId,
    }),
  })
  const body = await response.json() as GraphError & {
    id?: string
    webLink?: string
    onlineMeeting?: { joinUrl?: string }
    showAs?: string
  }
  if (!response.ok || !body.id) {
    const code = body.error?.code ?? ""
    const message = body.error?.message ?? ""
    const needsAuth = response.status === 401 || /InvalidAuthenticationToken|ErrorAccessDenied/i.test(code)
    const unavailable = /MailboxNotEnabledForRESTAPI|not.*online meeting provider|teamsForBusiness/i.test(`${code} ${message}`)
    throw new MicrosoftTeamsError(
      needsAuth
        ? "Connect Microsoft Teams again to authorize meeting creation."
        : unavailable
          ? "This Microsoft account does not have an Exchange Online mailbox with Teams meeting support."
          : message || "Microsoft Teams could not create the meeting.",
      needsAuth ? 409 : unavailable ? 422 : 502,
      needsAuth ? "MICROSOFT_TEAMS_CONNECT_REQUIRED" : unavailable ? "MICROSOFT_TEAMS_UNAVAILABLE" : "MICROSOFT_TEAMS_CREATE_FAILED",
    )
  }
  return {
    eventId: body.id,
    eventUrl: body.webLink ?? body.onlineMeeting?.joinUrl ?? null,
    joinUrl: body.onlineMeeting?.joinUrl ?? null,
    status: body.showAs ?? "confirmed",
  }
}
