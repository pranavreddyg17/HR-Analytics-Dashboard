import { EmployeesClient } from "@/components/employees-client"
import { getEmployees } from "@/lib/server/runtime"
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"

export const dynamic = "force-dynamic"

export default function RiskReviewPage() {
  const response = getEmployees({ limit: 2000 })
  return (
    <WorkspacePage>
      <WorkspaceHeader title="Model review" description="Review historical attrition scores and the employee profiles linked to the validation dataset." meta={<>{response.total.toLocaleString()} scored records</>} />
      <EmployeesClient employees={response.items} total={response.total} />
    </WorkspacePage>
  )
}
