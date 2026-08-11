import type { Metadata } from "next"

import { LearningWorkspace } from "@/components/learning-workspace"
import { listLearningOperations } from "@/lib/server/learning"
import { requireRequestActor } from "@/lib/server/request-user"
import { getWorkflowActorContext } from "@/lib/server/workflows"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  description: "Manage capability recommendations, assignments, and completion evidence.",
}

export default async function CoursesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireRequestActor()
  const params = await searchParams
  const department = typeof params.department === "string" ? params.department : undefined
  const location = typeof params.location === "string" ? params.location : undefined
  const [context, operations] = await Promise.all([
    getWorkflowActorContext(actor),
    listLearningOperations(actor, { department, location }),
  ])
  return <LearningWorkspace actor={context} initialData={operations} />
}
