import { EmployeePortal } from "@/components/employee-portal"
import { EmployeeOnboarding } from "@/components/employee-onboarding"
import { EmployeeAccessEnded } from "@/components/employee-access-ended"
import { getEmployeeOnboardingState } from "@/lib/server/employee-onboarding"
import { getEmployeePortal } from "@/lib/server/employee-portal"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export default async function EmployeePage() {
  const actor = await requireRequestActor()
  const user = { name: actor.displayName, email: actor.email, authenticated: !actor.localPreview, workspaceAccess: actor.role !== "employee" }
  const onboarding = await getEmployeeOnboardingState(actor)
  if (onboarding.status === "employment_ended") return <EmployeeAccessEnded user={user} employmentStatus={onboarding.employmentStatus ?? "Terminated"} />
  if (onboarding.required) return <EmployeeOnboarding onboarding={onboarding} user={user} />
  const initialData = await getEmployeePortal(actor)
  return <EmployeePortal initialData={initialData} user={user} />
}
