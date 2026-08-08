import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

import { findAccessUser, recordLogin } from "@/lib/server/access"
import { verifyGoogleIdToken } from "@/lib/server/google-id-token"
import { runtimeEnv } from "@/lib/server/runtime-env"

const runtime = runtimeEnv as { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; AUTH_SECRET?: string }
const sharedCookieDomain = runtimeEnv.AUTH_COOKIE_DOMAIN

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
    async signIn({ profile, user }) {
      const email = (profile?.email ?? user.email)?.toLowerCase()
      if (!email || profile?.email_verified === false) return false
      const access = await findAccessUser(email)
      if (!access || access.status !== "active") return "/login?error=AccessDenied"
      user.role = access.role
      await recordLogin(email, profile?.name ?? user.name ?? "")
      return true
    },
    async jwt({ token, account, user }) {
      if (account?.provider === "google") {
        const grantedScopes = new Set((account.scope ?? "").split(/\s+/).filter(Boolean))
        if ([...calendarScopes].some((scope) => grantedScopes.has(scope))) {
          token.googleCalendarAccessToken = account.access_token
          token.googleCalendarRefreshToken = account.refresh_token ?? token.googleCalendarRefreshToken
          token.googleCalendarAccessTokenExpiresAt = account.expires_at
          token.googleCalendarScope = account.scope
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
    async session({ session, token }) {
      if (session.user) session.user.role = token.role as string | undefined
      return session
    },
  },
})
