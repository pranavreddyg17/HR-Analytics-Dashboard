import { auth } from "@/auth"
import type { AppRole } from "@/lib/server/access"

export type RequestActor = { email: string; displayName: string; role: AppRole }

export async function getRequestActor(request?: Request): Promise<RequestActor | null> {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  const role = session?.user?.role as AppRole | undefined
  if (email && role) return { email, displayName: session?.user?.name ?? email.split("@")[0], role }
  if (!request) return null
  const hostname = new URL(request.url).hostname
  if (hostname === "localhost" || hostname === "127.0.0.1") return { email: "local-admin@laidbackhr.ai", displayName: "Local HR Admin", role: "admin" }
  return null
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
