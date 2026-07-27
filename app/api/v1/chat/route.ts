import { runHrAgent } from "@/lib/server/hr-agent"

export async function POST(request: Request) {
  try {
    const body = await request.json() as { message?: unknown }
    const url = new URL(request.url)
    const headers: Record<string, string> = {}
    const cookie = request.headers.get("cookie")
    const authorization = request.headers.get("authorization")
    const sitesAuthorization = request.headers.get("oai-sites-authorization")
    if (cookie) headers.cookie = cookie
    if (authorization) headers.authorization = authorization
    if (sitesAuthorization) headers["oai-sites-authorization"] = sitesAuthorization
    return Response.json(await runHrAgent({ message: body.message, origin: url.origin, forwardedHeaders: headers }))
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid analytics request."
    return Response.json(
      { detail },
      { status: error instanceof SyntaxError || /message must/.test(detail) ? 422 : 500 },
    )
  }
}
