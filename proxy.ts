import { auth } from "@/auth"
import { runtimeEnv } from "@/lib/server/runtime-env"

const legacyRoutes: Record<string, string> = {
  "/hiring": "/onboarding",
  "/time-off": "/leaves",
  "/learning": "/courses",
  "/ai-agents": "/assistant",
  "/data": "/imports",
  "/employees": "/people",
}

export default auth((request) => {
  if (["/api/v1/health", "/api/v1/ready"].includes(request.nextUrl.pathname)) return
  // Integration routes authenticate scoped service credentials themselves.
  // The OpenAPI contract is intentionally public; all data routes remain protected.
  if (request.nextUrl.pathname.startsWith("/api/v1/integrations/")) return

  const publicHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host).split(":")[0].toLowerCase()
  if (publicHost === "laidbackhr-f61hno-web.azurewebsites.net" && ["/", "/login"].includes(request.nextUrl.pathname)) {
    const destination = new URL(request.nextUrl.pathname + request.nextUrl.search, "https://www.laidbackhr.cloud")
    return Response.redirect(destination, 308)
  }
  if (publicHost === "employee.laidbackhr.cloud" && request.nextUrl.pathname === "/") {
    const destination = new URL("/employee", `https://${publicHost}`)
    return Response.redirect(destination, 307)
  }

  const canonicalPath = legacyRoutes[request.nextUrl.pathname]
  if (canonicalPath) {
    const destination = request.nextUrl.clone()
    destination.pathname = canonicalPath
    if (request.nextUrl.pathname === "/hiring") destination.searchParams.set("view", "talent")
    return Response.redirect(destination, 308)
  }
  if (request.nextUrl.pathname === "/login") return
  const localPreview = runtimeEnv.LOCAL_UI_PREVIEW === "true"
    && ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)
  if (localPreview) return
  if (!request.auth?.user?.email || !request.auth.user.role) {
    if (request.nextUrl.pathname === "/" || request.nextUrl.pathname.startsWith("/employee")) {
      const destination = publicHost === "employee.laidbackhr.cloud"
        ? new URL("/login", `https://${publicHost}`)
        : request.nextUrl.clone()
      destination.pathname = "/login"
      destination.search = ""
      return Response.redirect(destination, 307)
    }
    return Response.json({ error: "Sign in is required." }, { status: 401 })
  }
})

export const config = { matcher: ["/", "/login", "/employee/:path*", "/api/v1/:path*", "/api/mcp", "/hiring", "/time-off", "/learning", "/ai-agents", "/data", "/employees"] }
