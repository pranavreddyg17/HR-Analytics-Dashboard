import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { InsightsWorkspace } from "@/components/insights-workspace"

export const metadata: Metadata = {
  title: "Workforce insights",
  description: "Interactive employee, hiring, attrition, leave, training, and promotion analytics.",
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams
  if (params.view === "hiring") redirect("/hiring")
  if (params.view === "leave") redirect("/time-off")
  if (params.view === "training") redirect("/learning")
  if (params.view === "employees") redirect("/people")
  if (params.view === "attrition") redirect("/attrition")
  return <InsightsWorkspace />
}
