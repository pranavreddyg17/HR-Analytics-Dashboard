import type { Metadata } from "next"

import { HiringWorkspace } from "@/components/hiring-workspace"
import { requireRequestActor } from "@/lib/server/request-user"

export const metadata: Metadata = {
  title: "Hiring",
  description: "Manage hiring requisitions and analyze recruiting performance from live workspace data.",
}

export default async function HiringPage() {
  const actor = await requireRequestActor()
  return <HiringWorkspace canRequestHiring={["admin", "hr", "manager"].includes(actor.role)} />
}
