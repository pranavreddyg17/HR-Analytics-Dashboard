import { HomeDashboard } from "@/components/home-dashboard"
import { getHomeSnapshot } from "@/lib/server/home"
import { getInboxOperations } from "@/lib/server/inbox"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const actor = await requireRequestActor()
  const [snapshot, inbox] = await Promise.all([
    getHomeSnapshot(actor),
    getInboxOperations(actor),
  ])

  return <HomeDashboard snapshot={snapshot} inbox={inbox} actorEmail={actor.email} />
}
