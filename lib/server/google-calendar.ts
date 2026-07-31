import { env } from "cloudflare:workers"
import { getToken } from "next-auth/jwt"

const runtime = env as unknown as {
  AUTH_SECRET?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

const localAuthSecret = "laidbackhr-local-development-secret-change-me"

export class GoogleCalendarError extends Error {
  constructor(message: string, public status = 500, public code = "GOOGLE_CALENDAR_ERROR") {
    super(message)
  }
}

type CalendarEventInput = {
  title: string
  start: string
  end: string
  timezone: string
  location?: string
  agenda: string
  attendees: Array<{ email: string; name: string }>
}

type GoogleToken = {
  googleAccessToken?: string
  googleRefreshToken?: string
  googleAccessTokenExpiresAt?: number
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  if (!runtime.GOOGLE_CLIENT_ID || !runtime.GOOGLE_CLIENT_SECRET) {
    throw new GoogleCalendarError("Google Calendar is not configured for this workspace.", 503, "GOOGLE_CALENDAR_NOT_CONFIGURED")
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: runtime.GOOGLE_CLIENT_ID,
      client_secret: runtime.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })
  const body = await response.json() as { access_token?: string; error?: string }
  if (!response.ok || !body.access_token) {
    throw new GoogleCalendarError("Reconnect your Google account to authorize Calendar events.", 409, "GOOGLE_CALENDAR_REAUTHORIZE")
  }
  return body.access_token
}

async function googleAccessToken(request: Request): Promise<string> {
  // Auth.js can choose its cookie prefix from the public request URL. Behind a
  // reverse proxy/custom domain that can differ from the URL seen while the
  // cookie is issued, so resolve the supported Auth.js cookie names explicitly.
  const cookieNames = [
    "__Secure-authjs.session-token",
    "authjs.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.session-token",
  ]
  let token: GoogleToken | null = null
  for (const cookieName of cookieNames) {
    const candidate = await getToken({
      req: request,
      secret: runtime.AUTH_SECRET ?? localAuthSecret,
      cookieName,
      secureCookie: cookieName.startsWith("__Secure-"),
    }) as GoogleToken | null
    if (candidate?.googleAccessToken) {
      token = candidate
      break
    }
    if (!token && candidate) token = candidate
  }

  if (!token?.googleAccessToken) {
    throw new GoogleCalendarError("Reconnect your Google account to authorize Calendar events.", 409, "GOOGLE_CALENDAR_REAUTHORIZE")
  }
  const expiresAt = Number(token.googleAccessTokenExpiresAt ?? 0) * 1000
  if (!expiresAt || expiresAt > Date.now() + 60_000) return token.googleAccessToken
  if (!token.googleRefreshToken) {
    throw new GoogleCalendarError("Reconnect your Google account to renew Calendar access.", 409, "GOOGLE_CALENDAR_REAUTHORIZE")
  }
  return refreshAccessToken(token.googleRefreshToken)
}

export async function createGoogleCalendarEvent(request: Request, input: CalendarEventInput) {
  const accessToken = await googleAccessToken(request)
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      summary: input.title,
      description: input.agenda,
      location: input.location || undefined,
      start: { dateTime: `${input.start}:00`, timeZone: input.timezone },
      end: { dateTime: `${input.end}:00`, timeZone: input.timezone },
      attendees: input.attendees.map((attendee) => ({ email: attendee.email, displayName: attendee.name })),
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      guestsCanSeeOtherGuests: true,
    }),
  })
  const body = await response.json() as { id?: string; htmlLink?: string; status?: string; error?: { message?: string; status?: string } }
  if (!response.ok || !body.id) {
    const needsAuth = response.status === 401 || response.status === 403
    throw new GoogleCalendarError(
      needsAuth ? "Reconnect your Google account to authorize Calendar events." : body.error?.message ?? "Google Calendar could not create the event.",
      needsAuth ? 409 : 502,
      needsAuth ? "GOOGLE_CALENDAR_REAUTHORIZE" : "GOOGLE_CALENDAR_CREATE_FAILED",
    )
  }
  return { eventId: body.id, eventUrl: body.htmlLink ?? null, status: body.status ?? "confirmed" }
}
