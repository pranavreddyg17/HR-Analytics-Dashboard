import { getAdminMonitor } from "@/lib/server/admin-monitor"
import { requireAdmin } from "@/lib/server/request-user"

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    return Response.json(await getAdminMonitor(), { headers: { "cache-control": "private, max-age=30, stale-while-revalidate=30" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin monitor could not be loaded."
    const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : 500
    return Response.json({ error: message }, { status })
  }
}
