import type { Metadata } from "next"

import { type AnalyticsView, WorkforceDashboard } from "@/components/workforce-dashboard"

export const metadata: Metadata = {
  title: "Workforce insights",
  description: "Interactive employee, hiring, attrition, leave, training, and promotion analytics.",
}

const validViews = new Set<AnalyticsView>(["executive", "employees", "hiring", "attrition", "leave", "training", "promotions"])

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams
  const requested = params.view as AnalyticsView | undefined
  const view = requested && validViews.has(requested) ? requested : "executive"

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Workforce intelligence</p>
        <h1 className="page-title">Insights that lead to action</h1>
        <p className="page-description">Explore every people domain, cross-filter the underlying records, and take the next step from the same workspace.</p>
      </div>
      <WorkforceDashboard key={view} initialView={view} />
    </div>
  )
}
