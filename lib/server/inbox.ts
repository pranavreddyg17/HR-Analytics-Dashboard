import type { InboxOperations } from "@/lib/inbox-types"
import { listInboxItems } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

function isInboxItemAssignedToActor(item: InboxOperations["items"][number], actorEmail: string): boolean {
  return !item.isCompleted && (item.actionable || item.ownerEmail?.toLowerCase() === actorEmail.toLowerCase())
}

export async function getInboxOperations(actor: RequestActor): Promise<InboxOperations> {
  const items = await listInboxItems(actor)
  const open = items.filter((item) => !item.isCompleted)
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      assignedToMe: open.filter((item) => isInboxItemAssignedToActor(item, actor.email)).length,
      decisions: open.filter((item) => item.requiresDecision && item.actionable).length,
      managerQueue: open.filter((item) => item.assignedTo === "manager").length,
      employeeQueue: open.filter((item) => item.assignedTo === "employee").length,
      overdue: open.filter((item) => item.slaStatus === "overdue").length,
      allOpen: open.length,
      completed: items.filter((item) => item.isCompleted).length,
      byDomain: {
        leave: open.filter((item) => item.type === "leave").length,
        hiring: open.filter((item) => item.type === "hiring").length,
        training: open.filter((item) => item.type === "training").length,
        insight: open.filter((item) => item.type === "insight").length,
        reimbursement: open.filter((item) => item.type === "reimbursement").length,
        case: open.filter((item) => item.type === "case").length,
        onboarding: open.filter((item) => item.type === "onboarding").length,
        offboarding: open.filter((item) => item.type === "offboarding").length,
      },
    },
    items,
  }
}
