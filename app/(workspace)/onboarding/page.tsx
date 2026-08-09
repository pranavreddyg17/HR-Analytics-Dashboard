import type { Metadata } from "next"

import { HiringWorkspace } from "@/components/hiring-workspace"
import { OnboardingWorkspace } from "@/components/onboarding-workspace"
import { listHiringOperations } from "@/lib/server/hiring"
import { listOnboardingOperations } from "@/lib/server/onboarding"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Onboarding", description: "Manage new-joiner readiness and talent acquisition handoffs." }

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireRequestActor()
  const params = await searchParams
  if (params.view === "talent") {
    const operations = await listHiringOperations(actor)
    return <HiringWorkspace canRequestHiring={["admin", "hr", "manager"].includes(actor.role)} basePath="/onboarding" initialData={operations} />
  }
  const operations = await listOnboardingOperations(actor)
  return <OnboardingWorkspace initialData={operations} canRequestHiring={["admin", "hr", "manager"].includes(actor.role)} />
}
