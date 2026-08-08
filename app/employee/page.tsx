import { EmployeePortal } from "@/components/employee-portal"
import { getEmployeePortal } from "@/lib/server/employee-portal"
import { requireRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

export default async function EmployeePage() {
  const actor = await requireRequestActor()
  const initialData = await getEmployeePortal(actor)
  return <EmployeePortal initialData={initialData} user={{ name: actor.displayName, email: actor.email }} />
}
