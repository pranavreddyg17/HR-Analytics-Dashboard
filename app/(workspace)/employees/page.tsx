import { redirect } from "next/navigation"
import { searchParamsFromRecord } from "@/lib/navigation"

export const dynamic = "force-dynamic"

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const query = searchParamsFromRecord({ q: params.q, department: params.department, location: params.location, status: params.status, employmentType: params.employmentType, tenure: params.tenure, archived: params.archived, returnTo: params.returnTo })
  redirect(`/people${query ? `?${query}` : ""}`)
}
