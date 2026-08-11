import type { Metadata } from "next"

import { TimeOffWorkspace } from "@/components/time-off-workspace"
import { listLeaveOperations } from "@/lib/server/leave"
import { requireRequestActor } from "@/lib/server/request-user"
import { getWorkflowActorContext } from "@/lib/server/workflows"

export const metadata: Metadata = {
  description: "Request, review, and coordinate employee leave using workspace records.",
}

export default async function LeavesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireRequestActor()
  const params = await searchParams
  const stringParam = (key: string) => typeof params[key] === "string" ? params[key] as string : undefined
  const [context, operations] = await Promise.all([
    getWorkflowActorContext(actor),
    listLeaveOperations(actor, {
      from: stringParam("from"),
      to: stringParam("to"),
      department: stringParam("department"),
      location: stringParam("location"),
      leaveType: stringParam("leaveType"),
    }),
  ])
  return <TimeOffWorkspace canRequestLeave={Boolean(context.employeeId || ["admin", "hr"].includes(actor.role))} initialData={operations} />
}
