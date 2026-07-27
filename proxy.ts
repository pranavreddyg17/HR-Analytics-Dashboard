import { auth } from "@/auth"

export default auth((request) => {
  if (!request.auth?.user?.email || !request.auth.user.role) {
    return Response.json({ error: "Sign in is required." }, { status: 401 })
  }
})

export const config = { matcher: ["/api/v1/:path*", "/api/mcp"] }
