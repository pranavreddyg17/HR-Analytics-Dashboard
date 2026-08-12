import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id"

import { ensureEmployeeAccessUser, findAccessUser, recordLogin } from "@/lib/server/access"
import { verifyGoogleIdToken } from "@/lib/server/google-id-token"
import { runtimeEnv } from "@/lib/server/runtime-env"

const runtime = runtimeEnv as {
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  AUTH_SECRET?: string
  AUTH_URL?: string
  AUTH_ALLOWED_ORIGINS?: string
  EMPLOYEE_PORTAL_URL?: string
  MICROSOFT_ENTRA_ENABLED?: string
  MICROSOFT_ENTRA_CLIENT_ID?: string
  MICROSOFT_ENTRA_CLIENT_SECRET?: string
  MICROSOFT_ENTRA_TENANT_ID?: string
}
const sharedCookieDomain = runtimeEnv.AUTH_COOKIE_DOMAIN
const microsoftConfigured = runtime.MICROSOFT_ENTRA_ENABLED === "true"
  && Boolean(runtime.MICROSOFT_ENTRA_CLIENT_ID && runtime.MICROSOFT_ENTRA_CLIENT_SECRET && runtime.MICROSOFT_ENTRA_TENANT_ID)

const googleScopes = [
  "openid",
  "email",
  "profile",
].join(" ")

const calendarScopes = new Set([
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar",
])

const microsoftCalendarScopes = new Set(["Calendars.ReadWrite", "https://graph.microsoft.com/Calendars.ReadWrite"])

type FederatedProfile = {
  email?: string
  email_verified?: boolean
  preferred_username?: string
  name?: string
  sub?: string
  oid?: string
  tid?: string
}

function accessEmail(profile: unknown, fallback?: string | null): string | null {
  const claims = (profile ?? {}) as FederatedProfile
  return (claims.email ?? claims.preferred_username ?? fallback)?.trim().toLowerCase() ?? null
}

function allowedRedirectOrigins(baseUrl: string): Set<string> {
  const candidates = [baseUrl, runtime.AUTH_URL, runtime.EMPLOYEE_PORTAL_URL, ...(runtime.AUTH_ALLOWED_ORIGINS ?? "").split(",")]
  return new Set(candidates.flatMap((value) => {
    try { return value?.trim() ? [new URL(value.trim()).origin] : [] } catch { return [] }
  }))
}

export const { handlers, auth } = NextAuth({
  providers: [
    Credentials({
      id: "google-id-token",
      name: "Google",
      credentials: { credential: { label: "Google credential", type: "text" } },
      authorize: async (credentials) => verifyGoogleIdToken(credentials.credential),
    }),
    Google({
      clientId: runtime.GOOGLE_CLIENT_ID ?? "missing",
      clientSecret: runtime.GOOGLE_CLIENT_SECRET ?? "missing",
      authorization: {
        params: {
          scope: googleScopes,
        },
      },
    }),
    ...(microsoftConfigured ? [MicrosoftEntraID({
      clientId: runtime.MICROSOFT_ENTRA_CLIENT_ID!,
      clientSecret: runtime.MICROSOFT_ENTRA_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${runtime.MICROSOFT_ENTRA_TENANT_ID}/v2.0`,
      authorization: { params: { scope: "openid profile email User.Read" } },
      async profile(profile, tokens) {
        const graphProfile = tokens.access_token
          ? await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
              headers: { authorization: `Bearer ${tokens.access_token}` },
            }).then((response) => response.ok ? response.json() as Promise<{ id?: string; displayName?: string; mail?: string; userPrincipalName?: string }> : null).catch(() => null)
          : null
        const email = (graphProfile?.mail ?? graphProfile?.userPrincipalName ?? accessEmail(profile))?.trim().toLowerCase() ?? null
        return {
          id: graphProfile?.id ?? profile.oid ?? profile.sub,
          name: graphProfile?.displayName ?? profile.name ?? email,
          email,
          image: null,
        }
      },
    })] : []),
  ],
  secret: runtime.AUTH_SECRET ?? "laidbackhr-local-development-secret-change-me",
  trustHost: true,
  ...(sharedCookieDomain ? {
    cookies: {
      sessionToken: {
        name: "__Secure-authjs.session-token",
        options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: true, domain: sharedCookieDomain },
      },
    },
  } : {}),
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 10 },
  callbacks: {
    async signIn({ profile, user, account }) {
      const claims = (profile ?? {}) as FederatedProfile
      const email = accessEmail(profile, user.email)
      if (!email || ((account?.provider === "google" || account?.provider === "google-id-token") && claims.email_verified === false)) return false
      const access = await findAccessUser(email) ?? await ensureEmployeeAccessUser(email, profile?.name ?? user.name ?? "")
      if (access.status !== "active") return "/login?error=AccessDenied"
      user.role = access.role
      const provider = account?.provider === "microsoft-entra-id" ? "microsoft" : account ? "google" : null
      const subject = account?.providerAccountId ?? claims.oid ?? claims.sub ?? user.id
      await recordLogin(email, claims.name ?? user.name ?? "", provider && subject ? {
        provider,
        subject,
        tenantId: provider === "microsoft" ? claims.tid ?? runtime.MICROSOFT_ENTRA_TENANT_ID : null,
      } : undefined)
      return true
    },
    async jwt({ token, account, user, profile }) {
      if (account?.provider === "google") {
        const grantedScopes = new Set((account.scope ?? "").split(/\s+/).filter(Boolean))
        if ([...calendarScopes].some((scope) => grantedScopes.has(scope))) {
          token.googleCalendarAccessToken = account.access_token
          token.googleCalendarRefreshToken = account.refresh_token ?? token.googleCalendarRefreshToken
          token.googleCalendarAccessTokenExpiresAt = account.expires_at
          token.googleCalendarScope = account.scope
        }
      }
      if (account?.provider === "microsoft-entra-id") {
        const grantedScopes = new Set((account.scope ?? "").split(/\s+/).filter(Boolean))
        if ([...microsoftCalendarScopes].some((scope) => grantedScopes.has(scope))) {
          token.microsoftTeamsAccessToken = account.access_token
          token.microsoftTeamsRefreshToken = account.refresh_token ?? token.microsoftTeamsRefreshToken
          token.microsoftTeamsAccessTokenExpiresAt = account.expires_at
          token.microsoftTeamsScope = account.scope
          token.microsoftTenantId = (profile as FederatedProfile | undefined)?.tid ?? runtime.MICROSOFT_ENTRA_TENANT_ID
        }
      }
      if (user?.role) {
        token.role = user.role
      } else if (!token.role && token.email) {
        const access = await findAccessUser(token.email)
        token.role = access?.status === "active" ? access.role : undefined
      }
      return token
    },
    redirect({ url, baseUrl }) {
      try {
        const destination = url.startsWith("/") ? new URL(url, baseUrl) : new URL(url)
        return allowedRedirectOrigins(baseUrl).has(destination.origin) ? destination.toString() : baseUrl
      } catch {
        return baseUrl
      }
    },
    async session({ session, token }) {
      if (session.user) session.user.role = token.role as string | undefined
      return session
    },
  },
})
