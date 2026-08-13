import { redirect } from "next/navigation"

import { AdminMonitor } from "@/components/admin-monitor"
import { getAdminMonitorUsage } from "@/lib/server/admin-monitor"
import { getRequestActor } from "@/lib/server/request-user"

export default async function AdminPage() {
  const actor = await getRequestActor()
  if (actor?.role !== "admin") redirect("/")
  return <AdminMonitor initialData={await getAdminMonitorUsage()} />
}
