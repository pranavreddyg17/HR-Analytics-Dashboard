import { DataManager } from "@/components/data-manager"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export default async function ImportsPage() {
  const actor = await requireRequestActor()
  return <DataManager canManageApi={actor.role === "admin"} />
}
