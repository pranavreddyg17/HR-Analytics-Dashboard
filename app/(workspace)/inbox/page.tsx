import { InboxClient } from "@/components/inbox-client"
import { listInboxItems, listPeople } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"
import { getWorkflowActorContext } from "@/lib/server/workflows"

export const dynamic = "force-dynamic"

export default async function InboxPage() {
  const actor = await requireRequestActor()
  const [items, context, directory] = await Promise.all([
    listInboxItems(actor),
    getWorkflowActorContext(actor),
    ["admin", "hr", "manager"].includes(actor.role) ? listPeople({ limit: 250 }) : Promise.resolve(null),
  ])
  return <InboxClient initialItems={items} actor={context} people={directory?.items ?? []} />
}
