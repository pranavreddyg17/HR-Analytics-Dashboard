import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { type AnalyticsView, WorkforceDashboard } from "@/components/workforce-dashboard"

export const metadata: Metadata = {
  title: "Workforce insights",
  description: "Interactive employee, hiring, attrition, leave, training, and promotion analytics.",
}

const validViews = new Set<AnalyticsView>(["executive", "employees", "hiring", "attrition", "leave", "training", "promotions"])

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams
  if (params.view === "hiring") redirect("/hiring")
  const requested = params.view as AnalyticsView | undefined
  const view = requested && validViews.has(requested) ? requested : "executive"

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Analytics</p>
        <h1 className="page-title">Workforce insights</h1>
        <p className="page-description">Filter company-wide metrics, compare operating trends, and drill into the underlying records.</p>
      </div>
      <WorkforceDashboard key={view} initialView={view} />
    </div>
  )
}
