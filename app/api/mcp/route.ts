import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { createHrMcpServer } from "@/lib/server/hr-mcp"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin")
  const ownOrigin = new URL(request.url).origin
  return {
  ...(origin === ownOrigin ? { "Access-Control-Allow-Origin": origin } : {}),
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, mcp-session-id, Last-Event-ID, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
  "Vary": "Origin",
  }
}

async function handle(request: Request): Promise<Response> {
  try {
    const actor = await requireRequestActor(request)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    const server = createHrMcpServer(actor)
    await server.connect(transport)
    const response = await transport.handleRequest(request)
    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(corsHeaders(request))) headers.set(key, value)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  } catch (error) {
    const detail = error instanceof Error ? error.message : "MCP request failed."
    return Response.json({ error: detail }, { status: detail === "AUTH_REQUIRED" ? 401 : 500, headers: corsHeaders(request) })
  }
}

export const GET = handle
export const POST = handle
export const DELETE = handle

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}
