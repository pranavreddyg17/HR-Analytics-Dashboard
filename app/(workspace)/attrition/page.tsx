import Link from "next/link"

import { AttritionPredictor } from "@/components/attrition-predictor"
import { RetentionReviewButton } from "@/components/retention-review-button"
import { MetricStrip, WorkspaceHeader, WorkspacePage, WorkspaceSectionHeader } from "@/components/workspace-ui"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { withReturnTo } from "@/lib/navigation"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { getRetentionIntelligence } from "@/lib/server/retention-intelligence"
import { getDashboard, getPredictionSchema } from "@/lib/server/runtime"

export const dynamic = "force-dynamic"

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 1 })

function statusVariant(status: "Priority" | "Watch" | "Stable") {
  return status === "Priority" ? "destructive" as const : status === "Watch" ? "secondary" as const : "outline" as const
}

export default async function AttritionPage() {
  const to = new Date().toISOString().slice(0, 10)
  const fromDate = new Date(`${to}T12:00:00Z`)
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 1)
  const workforce = await getWorkforceAnalytics({ from: fromDate.toISOString().slice(0, 10), to, period: "quarter" })
  const [retention, dashboard] = await Promise.all([
    getRetentionIntelligence(workforce),
    Promise.resolve(getDashboard()),
  ])
  const schema = getPredictionSchema()
  const priorityCohorts = retention.cohortAlerts.filter((cohort) => cohort.priority === "Priority").length
  const replacementGaps = retention.continuity.filter((row) => row.replacementStatus === "Gap").length
  const openReviews = retention.cohortAlerts.filter((cohort) => ["pending", "in_progress"].includes(cohort.reviewStatus)).length
  const priorities = new Map(retention.priorities.map((priority) => [priority.cohort, priority]))
  const continuity = new Map(retention.continuity.map((row) => [row.department, row]))
  const voluntaryShare = workforce.attrition.totalExits
    ? (workforce.attrition.voluntary / workforce.attrition.totalExits) * 100
    : 0

  return (
    <WorkspacePage>
      <WorkspaceHeader
        title="Attrition and retention"
        description="Review 12-month retention signals and assign follow-up."
        meta={<>{workforce.calculationBasis.reportingWindow}</>}
        actions={(
          <Button nativeButton={false} render={<Link href={withReturnTo("/risk-review", "/attrition")} />}>
            Review model records
          </Button>
        )}
      />

      <MetricStrip metrics={[
        { label: "Recorded attrition", value: `${number.format(workforce.attrition.rate)}%`, detail: `${workforce.attrition.totalExits} exits · ${number.format(voluntaryShare)}% voluntary` },
        { label: "Priority departments", value: priorityCohorts, detail: `${retention.cohortAlerts.length} departments reviewed` },
        { label: "Open reviews", value: openReviews, detail: "Pending or in progress" },
        { label: "Coverage gaps", value: replacementGaps, detail: "Hiring and succession coverage" },
      ]} />

      <section aria-labelledby="department-review-heading">
        <WorkspaceSectionHeader
          title="Department review queue"
          description="Current evidence, operational exposure, and accountable follow-up."
        />
        <Card className="mt-3 gap-0 overflow-hidden py-0 shadow-none">
          <CardContent className="p-0">
            <div className="hidden grid-cols-[1fr_1fr_1fr_1.45fr_0.85fr] gap-4 border-b bg-muted/35 px-5 py-2.5 text-label text-muted-foreground lg:grid">
              <span>Department</span>
              <span>Evidence</span>
              <span>Exposure</span>
              <span>Recommended check</span>
              <span>Review</span>
            </div>
            {retention.cohortAlerts.map((cohort) => {
              const priority = priorities.get(cohort.department)
              const impact = continuity.get(cohort.department)
              return (
                <div key={cohort.department} className="grid gap-3 border-b px-5 py-4 last:border-b-0 lg:grid-cols-[1fr_1fr_1fr_1.45fr_0.85fr] lg:items-start lg:gap-4">
                  <div>
                    <p className="text-card-title font-semibold">{cohort.department}</p>
                    <Badge className="mt-1.5" variant={statusVariant(cohort.priority)}>{cohort.priority}</Badge>
                  </div>
                  <div>
                    <p className="text-body tabular-nums">{cohort.recordedAttritionRate}% · {cohort.recordedExits} exits</p>
                    <p className="mt-1 text-meta text-muted-foreground">{cohort.aboveThreshold} in model review · {cohort.leadingExitReason}</p>
                  </div>
                  <div>
                    <p className="text-body">{cohort.replacementStatus} coverage · {cohort.openRequisitions} open roles</p>
                    {impact && <p className="mt-1 text-meta text-muted-foreground">{impact.leadingRole} · {impact.leadingRoleCount} exposed</p>}
                  </div>
                  <div>
                    <p className="text-body">{priority?.action ?? "Continue quarterly monitoring."}</p>
                    {priority && <p className="mt-1 text-meta text-muted-foreground">Owner: {priority.owner}</p>}
                  </div>
                  <div>
                    {priority ? (
                      <RetentionReviewButton department={priority.cohort} reviewId={priority.reviewId} reviewStatus={priority.reviewStatus} />
                    ) : <span className="text-meta text-muted-foreground">No action due</span>}
                  </div>
                </div>
              )
            })}
            {!retention.cohortAlerts.length && <p className="px-5 py-8 text-center text-body text-muted-foreground">No cohorts meet the minimum reporting population.</p>}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="scenario-test-heading" className="rounded-lg border border-border bg-card">
        <WorkspaceSectionHeader
          title="Scenario test"
          description="Test the model without creating an employee record or HR action."
        />
        <div className="px-5 py-4">
          <AttritionPredictor schema={schema} />
        </div>
      </section>

      <details className="rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-card-title font-semibold marker:text-muted-foreground">Model details</summary>
        <div className="space-y-4 border-t border-border px-5 py-4">
          <div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-6">
            {dashboard.modelMetrics.map((metric) => (
              <div key={metric.label} className="bg-card px-3 py-3">
                <p className="text-meta text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-card-title font-semibold tabular-nums">{metric.value}</p>
                <p className="mt-1 text-status text-muted-foreground">{metric.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </details>
    </WorkspacePage>
  )
}
