import type { Metadata } from "next"

import { TimeOffWorkspace } from "@/components/time-off-workspace"
import { requireRequestActor } from "@/lib/server/request-user"
import { getWorkflowActorContext } from "@/lib/server/workflows"

export const metadata: Metadata = {
  title: "Time off",
  description: "Request, review, and analyze employee leave using live workspace records.",
}

export default async function TimeOffPage() {
  const actor = await requireRequestActor()
  const context = await getWorkflowActorContext(actor)
  return <TimeOffWorkspace canRequestLeave={Boolean(context.employeeId || ["admin", "hr"].includes(actor.role))} reviewer={{ role: actor.role, email: actor.email, employeeId: context.employeeId }} />
}
