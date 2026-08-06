import { auth } from "@/auth"
import { headers } from "next/headers"
import type { AppRole } from "@/lib/server/access"
import { runtimeEnv } from "@/lib/server/runtime-env"

export type RequestActor = {
  email: string
  displayName: string
  role: AppRole
  localPreview?: boolean
}

const localPreviewActor: RequestActor = {
  email: "local-admin@laidbackhr.ai",
  displayName: "Local HR Admin",
  role: "admin",
  localPreview: true,
}

function isLocalHost(value: string): boolean {
  const hostname = value.split(",")[0]?.trim().split(":")[0]
  return hostname === "localhost" || hostname === "127.0.0.1"
}

async function getLocalPreviewActor(request?: Request): Promise<RequestActor | null> {
  const previewEnabled = runtimeEnv.LOCAL_UI_PREVIEW === "true"
  if (!previewEnabled) return null

  if (request) return isLocalHost(new URL(request.url).hostname) ? localPreviewActor : null

  const requestHeaders = await headers()
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? ""
  return isLocalHost(host) ? localPreviewActor : null
}

export async function getRequestActor(request?: Request): Promise<RequestActor | null> {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  const role = session?.user?.role as AppRole | undefined
  if (email && role) return { email, displayName: session?.user?.name ?? email.split("@")[0], role }
  return getLocalPreviewActor(request)
}

export async function requireRequestActor(request?: Request): Promise<RequestActor> {
  const actor = await getRequestActor(request)
  if (!actor) throw new Error("AUTH_REQUIRED")
  return actor
}

export async function requireAdmin(request?: Request): Promise<RequestActor> {
  const actor = await requireRequestActor(request)
  if (actor.role !== "admin") throw new Error("ADMIN_REQUIRED")
  return actor
}

export async function requireRole(request: Request | undefined, allowed: AppRole[]): Promise<RequestActor> {
  const actor = await requireRequestActor(request)
  if (!allowed.includes(actor.role)) throw new Error("ROLE_REQUIRED")
  return actor
}
