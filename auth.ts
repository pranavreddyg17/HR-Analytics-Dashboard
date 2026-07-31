import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { env } from "cloudflare:workers"

import { findAccessUser, recordLogin } from "@/lib/server/access"

const runtime = env as unknown as { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; AUTH_SECRET?: string }

const googleScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ")

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({
    clientId: runtime.GOOGLE_CLIENT_ID ?? "missing",
    clientSecret: runtime.GOOGLE_CLIENT_SECRET ?? "missing",
    authorization: {
      params: {
        scope: googleScopes,
        access_type: "offline",
        prompt: "consent",
      },
    },
  })],
  secret: runtime.AUTH_SECRET ?? "laidbackhr-local-development-secret-change-me",
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 10 },
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase()
      if (!email || profile?.email_verified === false) return false
      const access = await findAccessUser(email)
      if (!access || access.status !== "active") return "/login?error=AccessDenied"
      await recordLogin(email, profile?.name ?? "")
      return true
    },
    async jwt({ token, account }) {
      if (account?.provider === "google") {
        token.googleAccessToken = account.access_token
        token.googleRefreshToken = account.refresh_token ?? token.googleRefreshToken
        token.googleAccessTokenExpiresAt = account.expires_at
      }
      if (token.email) {
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
