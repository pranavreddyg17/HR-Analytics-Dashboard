import { auth } from "@/auth"
import { env } from "cloudflare:workers"

const legacyRoutes: Record<string, string> = {
  "/time-off": "/leaves",
  "/learning": "/courses",
  "/ai-agents": "/assistant",
  "/data": "/imports",
  "/employees": "/people",
}

export default auth((request) => {
  const canonicalPath = legacyRoutes[request.nextUrl.pathname]
  if (canonicalPath) {
    const destination = request.nextUrl.clone()
    destination.pathname = canonicalPath
    return Response.redirect(destination, 308)
  }
  const localPreview = (env as unknown as { LOCAL_UI_PREVIEW?: string }).LOCAL_UI_PREVIEW === "true"
    && ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)
  if (localPreview) return
  if (!request.auth?.user?.email || !request.auth.user.role) {
    return Response.json({ error: "Sign in is required." }, { status: 401 })
  }
})

export const config = { matcher: ["/api/v1/:path*", "/api/mcp", "/time-off", "/learning", "/ai-agents", "/data", "/employees"] }
