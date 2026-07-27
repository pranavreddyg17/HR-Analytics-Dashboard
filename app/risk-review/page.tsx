import { EmployeesClient } from "@/components/employees-client"
import { getEmployees } from "@/lib/server/runtime"

export const dynamic = "force-dynamic"

export default function RiskReviewPage() {
  const response = getEmployees({ limit: 100 })
  return <div className="space-y-6">
    <div>
      <p className="eyebrow">Historical model governance</p>
      <h1 className="page-title">Scored-record review</h1>
      <p className="page-description">Audit the validated historical attrition model separately from your live employee directory. These anonymized rows are evidence for model review, never automatic employment decisions.</p>
    </div>
    <EmployeesClient employees={response.items} total={response.total} />
  </div>
}
