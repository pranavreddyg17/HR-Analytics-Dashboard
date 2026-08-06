import { EmployeesClient } from "@/components/employees-client"
import type { Employee } from "@/lib/types"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { predict } from "@/lib/server/runtime"
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"

export const dynamic = "force-dynamic"

export default async function RiskReviewPage() {
  const workforce = await getWorkforceAnalytics()
  const employees: Employee[] = workforce.attrition.employeeRecords.map((record) => {
    const explanation = predict({
      Department: record.department,
      DistanceFromHome: record.distanceFromHome,
      Education: record.educationLevel,
      EducationField: record.educationField,
      EnvironmentSatisfaction: record.environmentSatisfaction,
      JobSatisfaction: record.jobSatisfaction,
      MonthlyIncome: record.monthlyIncome,
      NumCompaniesWorked: record.priorCompanies,
      WorkLifeBalance: record.workLifeBalance,
      YearsAtCompany: record.yearsAtCompany,
    })
    return {
      id: record.employeeId,
      name: record.name,
      role: record.jobTitle,
      department: record.department,
      tenure: `${record.tenureYears} years`,
      riskScore: record.riskScore,
      riskLevel: record.riskLevel,
      topDriver: record.topDriver,
      suggestion: explanation.recommendation,
      monthlyIncome: record.monthlyIncome,
      distanceFromHome: record.distanceFromHome,
      educationLevel: record.educationLevel,
      educationField: record.educationField,
      environmentSatisfaction: record.environmentSatisfaction,
      jobSatisfaction: record.jobSatisfaction,
      priorCompanies: record.priorCompanies,
      workLifeBalance: record.workLifeBalance,
      yearsAtCompany: record.yearsAtCompany,
      observedAttrition: record.observedAttrition,
    }
  })
  return (
    <WorkspacePage>
      <WorkspaceHeader title="Model record review" description="Audit historical scores, contributors, and outcomes from the persisted validation dataset." meta={<>{employees.length.toLocaleString()} scored records</>} />
      <EmployeesClient employees={employees} total={employees.length} />
    </WorkspacePage>
  )
}
