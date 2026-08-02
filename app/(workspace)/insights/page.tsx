import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { InsightsWorkspace } from "@/components/insights-workspace"
import { searchParamsFromRecord } from "@/lib/navigation"

export const metadata: Metadata = {
  title: "Workforce insights",
  description: "Interactive employee, hiring, attrition, leave, training, and promotion analytics.",
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const view = typeof params.view === "string" ? params.view : undefined
  const destinations: Record<string, string> = { hiring: "/hiring", leave: "/leaves", training: "/courses", employees: "/people", attrition: "/attrition" }
  const destination = view ? destinations[view] : undefined
  if (destination) {
    const { view: _view, ...remaining } = params
    const query = searchParamsFromRecord(remaining)
    redirect(`${destination}${query ? `?${query}` : ""}`)
  }
  return <InsightsWorkspace />
}
