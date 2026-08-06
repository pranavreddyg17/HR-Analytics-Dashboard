import { InboxClient } from "@/components/inbox-client"
import { listPeople } from "@/lib/server/people"
import { getInboxOperations } from "@/lib/server/inbox"
import { requireRequestActor } from "@/lib/server/request-user"
import { getWorkflowActorContext } from "@/lib/server/workflows"

export const dynamic = "force-dynamic"

export default async function InboxPage() {
  const actor = await requireRequestActor()
  const [operations, context, directory] = await Promise.all([
    getInboxOperations(actor),
    getWorkflowActorContext(actor),
    ["admin", "hr", "manager"].includes(actor.role) ? listPeople({ limit: 250 }) : Promise.resolve(null),
  ])
  return <InboxClient initialData={operations} actor={context} people={directory?.items ?? []} />
}
