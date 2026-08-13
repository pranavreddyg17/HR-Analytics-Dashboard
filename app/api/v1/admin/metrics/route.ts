import { getAdminMonitor, getAdminMonitorProviders, getAdminMonitorUsage } from "@/lib/server/admin-monitor"
import { requireAdmin } from "@/lib/server/request-user"

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const section = new URL(request.url).searchParams.get("section")
    const data = section === "usage"
      ? await getAdminMonitorUsage()
      : section === "providers"
        ? await getAdminMonitorProviders()
        : await getAdminMonitor()
    return Response.json(data, { headers: { "cache-control": "private, max-age=30, stale-while-revalidate=30" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin monitor could not be loaded."
    const status = message === "AUTH_REQUIRED" ? 401 : message === "ADMIN_REQUIRED" ? 403 : 500
    return Response.json({ error: message }, { status })
  }
}
