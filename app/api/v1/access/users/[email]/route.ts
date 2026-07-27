import { NextResponse } from "next/server"
import { removeAccessUser, updateAccessUser } from "@/lib/server/access"
import { requireAdmin } from "@/lib/server/request-user"

export async function PATCH(request: Request, { params }: { params: Promise<{ email: string }> }) {
  try { const actor = await requireAdmin(request); const { email } = await params; return NextResponse.json(await updateAccessUser(decodeURIComponent(email), await request.json(), actor.email)) }
  catch (error) { const message = error instanceof Error ? error.message : "Access update failed."; return NextResponse.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : /NOT_FOUND/.test(message) ? 404 : 422 }) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ email: string }> }) {
  try { const actor = await requireAdmin(request); const { email } = await params; return NextResponse.json(await removeAccessUser(decodeURIComponent(email), actor.email)) }
  catch (error) { const message = error instanceof Error ? error.message : "Access removal failed."; return NextResponse.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : /NOT_FOUND/.test(message) ? 404 : 422 }) }
}
