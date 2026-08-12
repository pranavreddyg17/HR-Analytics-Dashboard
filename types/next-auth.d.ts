import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface User { role?: string }
  interface Session { user: { name?: string | null; email?: string | null; image?: string | null; role?: string } }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string
    googleAccessToken?: string
    googleRefreshToken?: string
    googleAccessTokenExpiresAt?: number
    googleCalendarAccessToken?: string
    googleCalendarRefreshToken?: string
    googleCalendarAccessTokenExpiresAt?: number
    googleCalendarScope?: string
    microsoftTeamsAccessToken?: string
    microsoftTeamsRefreshToken?: string
    microsoftTeamsAccessTokenExpiresAt?: number
    microsoftTeamsScope?: string
    microsoftTenantId?: string
  }
}
