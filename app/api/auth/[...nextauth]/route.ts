import { handlers } from "@/auth"
import { runtimeEnv } from "@/lib/server/runtime-env"
import { NextRequest } from "next/server"

function publicAuthRequest(request: NextRequest): NextRequest {
  const configuredUrl = runtimeEnv.AUTH_URL ?? runtimeEnv.NEXTAUTH_URL
  if (!configuredUrl) return request

  const incoming = request.nextUrl.clone()
  const publicOrigin = new URL(configuredUrl)
  incoming.protocol = publicOrigin.protocol
  incoming.host = publicOrigin.host
  return new NextRequest(incoming, request)
}

export function GET(request: NextRequest) {
  return handlers.GET(publicAuthRequest(request))
}

export function POST(request: NextRequest) {
  return handlers.POST(publicAuthRequest(request))
}
