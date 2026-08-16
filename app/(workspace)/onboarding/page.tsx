import type { Metadata } from "next"

import { HiringWorkspace } from "@/components/hiring-workspace"
import { OnboardingWorkspace } from "@/components/onboarding-workspace"
import { listHiringOperations } from "@/lib/server/hiring"
import { listOnboardingOperations, OnboardingUnavailableError } from "@/lib/server/onboarding"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { description: "Manage new-joiner readiness and talent acquisition handoffs." }

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireRequestActor()
  const params = await searchParams
  if (params.view === "talent") {
    const operations = await listHiringOperations(actor)
    return <HiringWorkspace canRequestHiring={["admin", "hr", "manager"].includes(actor.role)} basePath="/onboarding" initialData={operations} />
  }
  let operations
  let initialError = ""
  try {
    operations = await listOnboardingOperations(actor)
  } catch (error) {
    if (!(error instanceof OnboardingUnavailableError)) throw error
    console.error("[onboarding] Initial new-joiner load failed.", error)
    operations = { generatedAt: new Date().toISOString(), summary: { preboarding: 0, awaitingVerification: 0, startingNext30Days: 0, missingManager: 0 }, joiners: [] }
    initialError = "New joiners could not be loaded. Select Refresh to try the read again."
  }
  return <OnboardingWorkspace initialData={operations} initialError={initialError} canRequestHiring={["admin", "hr", "manager"].includes(actor.role)} />
}
