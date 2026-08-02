import { auth } from "@/auth"
import { env } from "cloudflare:workers"

export default auth((request) => {
  const localPreview = (env as unknown as { LOCAL_UI_PREVIEW?: string }).LOCAL_UI_PREVIEW === "true"
    && ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)
  if (localPreview) return
  if (!request.auth?.user?.email || !request.auth.user.role) {
    return Response.json({ error: "Sign in is required." }, { status: 401 })
  }
})

export const config = { matcher: ["/api/v1/:path*", "/api/mcp"] }
