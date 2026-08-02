import type { Metadata } from "next"

import { LearningWorkspace } from "@/components/learning-workspace"
import { listPeople } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"
import { getWorkflowActorContext } from "@/lib/server/workflows"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Assign Courses",
  description: "Assign training, manage compliance work, and review learning progress.",
}

export default async function LearningPage() {
  const actor = await requireRequestActor()
  const [context, directory] = await Promise.all([
    getWorkflowActorContext(actor),
    listPeople({ limit: 500 }),
  ])
  return <LearningWorkspace actor={context} people={directory.items}/>
}
