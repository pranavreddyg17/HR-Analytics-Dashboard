import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { InsightsWorkspace } from "@/components/insights-workspace"
import { searchParamsFromRecord } from "@/lib/navigation"
import { filtersFromSearchParams, getWorkforceDashboardAnalytics } from "@/lib/server/hr-analytics"

export const metadata: Metadata = {
  title: "Workforce insights",
  description: "Interactive employee, hiring, attrition, leave, training, and promotion analytics.",
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const view = typeof params.view === "string" ? params.view : undefined
  const destinations: Record<string, string> = { hiring: "/onboarding?view=talent", leave: "/leaves", training: "/courses", employees: "/people", attrition: "/attrition" }
  const destination = view ? destinations[view] : undefined
  if (destination) {
    const { view: _view, ...remaining } = params
    const query = searchParamsFromRecord(remaining)
    redirect(`${destination}${query ? `?${query}` : ""}`)
  }
  const query = searchParamsFromRecord(params)
  const filterParams = new URLSearchParams(query)
  if (!filterParams.has("from") || !filterParams.has("to")) {
    const to = new Date()
    const from = new Date(to)
    from.setUTCFullYear(from.getUTCFullYear() - 1)
    from.setUTCDate(from.getUTCDate() + 1)
    if (!filterParams.has("from")) filterParams.set("from", from.toISOString().slice(0, 10))
    if (!filterParams.has("to")) filterParams.set("to", to.toISOString().slice(0, 10))
  }
  if (!filterParams.has("period")) filterParams.set("period", "quarter")
  const initialData = await getWorkforceDashboardAnalytics(filtersFromSearchParams(filterParams))
  return <InsightsWorkspace initialData={initialData} />
}
