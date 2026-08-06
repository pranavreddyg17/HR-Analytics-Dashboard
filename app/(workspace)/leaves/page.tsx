import type { Metadata } from "next"

import { TimeOffWorkspace } from "@/components/time-off-workspace"
import { requireRequestActor } from "@/lib/server/request-user"
import { getWorkflowActorContext } from "@/lib/server/workflows"

export const metadata: Metadata = {
  title: "Leaves",
  description: "Request, review, and coordinate employee leave using workspace records.",
}

export default async function LeavesPage() {
  const actor = await requireRequestActor()
  const context = await getWorkflowActorContext(actor)
  return <TimeOffWorkspace canRequestLeave={Boolean(context.employeeId || ["admin", "hr"].includes(actor.role))} />
}
