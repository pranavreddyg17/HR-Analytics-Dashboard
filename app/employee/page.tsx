import { EmployeePortal } from "@/components/employee-portal"
import { EmployeeOnboarding } from "@/components/employee-onboarding"
import { getEmployeeOnboardingState } from "@/lib/server/employee-onboarding"
import { getEmployeePortal } from "@/lib/server/employee-portal"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export default async function EmployeePage() {
  const actor = await requireRequestActor()
  const onboarding = await getEmployeeOnboardingState(actor)
  if (onboarding.required) return <EmployeeOnboarding user={{ name: actor.displayName, email: actor.email, authenticated: !actor.localPreview }} />
  const initialData = await getEmployeePortal(actor)
  return <EmployeePortal initialData={initialData} user={{ name: actor.displayName, email: actor.email, authenticated: !actor.localPreview }} />
}
