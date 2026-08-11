import { ExitManagementWorkspace } from "@/components/exit-management"
import { getEmployeeExit, listEmployeeExits } from "@/lib/server/exit-assets"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export default async function ExitsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [actor, params] = await Promise.all([requireRequestActor(), searchParams])
  const exitId = typeof params.exit === "string" ? params.exit : ""
  const [initialData, initialDetail] = await Promise.all([
    listEmployeeExits({ limit: 250 }),
    exitId ? getEmployeeExit(exitId).catch(() => null) : Promise.resolve(null),
  ])
  return <ExitManagementWorkspace initialData={initialData} initialDetail={initialDetail} canManage={["admin", "hr"].includes(actor.role)} />
}
