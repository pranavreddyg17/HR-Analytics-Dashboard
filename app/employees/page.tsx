import { EmployeesClient } from "@/components/employees-client"
import { getEmployees } from "@/lib/server/runtime"

export const dynamic = "force-dynamic"

export default async function EmployeesPage() {
  const response = getEmployees({ limit: 100 })
  return <EmployeesClient employees={response.items} total={response.total} />
}
