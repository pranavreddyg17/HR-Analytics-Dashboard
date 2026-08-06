import type { Metadata } from "next"

import { LearningWorkspace } from "@/components/learning-workspace"
import { requireRequestActor } from "@/lib/server/request-user"
import { getWorkflowActorContext } from "@/lib/server/workflows"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Assign courses",
  description: "Assign training and resolve overdue or mandatory requirements.",
}

export default async function CoursesPage() {
  const actor = await requireRequestActor()
  const context = await getWorkflowActorContext(actor)
  return <LearningWorkspace actor={context} />
}
