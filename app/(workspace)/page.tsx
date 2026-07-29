import { auth } from "@/auth"
import { HomeDashboard } from "@/components/home-dashboard"
import type { ManagedEmployee } from "@/lib/people-types"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { listInboxItems, listPeople } from "@/lib/server/people"

export const dynamic = "force-dynamic"

function employeeFallback(employee: Awaited<ReturnType<typeof getWorkforceAnalytics>>["employees"][number]): ManagedEmployee {
  const displayName = `${employee.preferred_name || employee.first_name || "Employee"} ${employee.last_name || ""}`.trim()
  return {
    ...employee,
    display_name: displayName,
    initials: `${displayName.split(" ")[0]?.[0] ?? "E"}${displayName.split(" ")[1]?.[0] ?? ""}`.toUpperCase(),
    manager_name: employee.manager || null,
    direct_reports: 0,
  }
}

export default async function HomePage() {
  const [viewer, analytics, inbox, directory] = await Promise.all([
    auth(),
    getWorkforceAnalytics(),
    listInboxItems().catch(() => []),
    listPeople({ limit: 200 }).catch(() => null),
  ])

  return (
    <HomeDashboard
      viewer={{
        displayName: viewer?.user?.name ?? viewer?.user?.email?.split("@")[0] ?? "HR team",
        email: viewer?.user?.email ?? null,
      }}
      analytics={analytics}
      inbox={inbox}
      people={directory?.items ?? analytics.employees.map(employeeFallback)}
    />
  )
}
