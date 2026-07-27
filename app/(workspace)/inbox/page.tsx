import { InboxClient } from "@/components/inbox-client"
import { listInboxItems } from "@/lib/server/people"

export const dynamic = "force-dynamic"

export default async function InboxPage() {
  const items = await listInboxItems()
  return <InboxClient initialItems={items} />
}
