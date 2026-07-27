import { NextResponse } from "next/server"
import { addAccessUser, listAccessAudit, listAccessUsers } from "@/lib/server/access"
import { requireAdmin } from "@/lib/server/request-user"

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Access request failed."
  const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : /INVALID/.test(message) ? 422 : 500
  return NextResponse.json({ error: message }, { status })
}
export async function GET(request: Request) { try { await requireAdmin(request); return NextResponse.json({ users: await listAccessUsers(), audit: await listAccessAudit() }) } catch (error) { return failure(error) } }
export async function POST(request: Request) { try { const actor = await requireAdmin(request); return NextResponse.json(await addAccessUser(await request.json(), actor.email), { status: 201 }) } catch (error) { return failure(error) } }
