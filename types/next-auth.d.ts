import "next-auth"
import "@auth/core/jwt"

declare module "next-auth" {
  interface User { role?: string }
  interface Session { user: { name?: string | null; email?: string | null; image?: string | null; role?: string } }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: string
    googleAccessToken?: string
    googleRefreshToken?: string
    googleAccessTokenExpiresAt?: number
    googleCalendarAccessToken?: string
    googleCalendarRefreshToken?: string
    googleCalendarAccessTokenExpiresAt?: number
    googleCalendarScope?: string
  }
}
