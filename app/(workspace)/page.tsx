import { HomeDashboard } from "@/components/home-dashboard"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { getInboxOperations } from "@/lib/server/inbox"
import { listLearningOperations } from "@/lib/server/learning"
import { listLeaveOperations } from "@/lib/server/leave"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const actor = await requireRequestActor()
  const [analytics, inbox, leave, learning] = await Promise.all([
    getWorkforceAnalytics(),
    getInboxOperations(actor),
    listLeaveOperations(actor),
    listLearningOperations(actor),
  ])

  return <HomeDashboard analytics={analytics} inbox={inbox} leave={leave} learning={learning} actorEmail={actor.email} />
}
