import { EmployeesClient } from "@/components/employees-client"
import { getEmployees } from "@/lib/server/runtime"

export const dynamic = "force-dynamic"

export default function RiskReviewPage() {
  const response = getEmployees({ limit: 2000 })
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 pb-10">
      <header className="border-b border-border pb-5">
        <h1 className="text-2xl font-semibold">Model review</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review historical model scores linked to synthetic demo employee IDs. Operational employees remain separate.</p>
      </header>
      <EmployeesClient employees={response.items} total={response.total} />
    </div>
  )
}
