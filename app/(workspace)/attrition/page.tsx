import Link from "next/link"

import { AttritionPredictor } from "@/components/attrition-predictor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { getDashboard, getPredictionSchema } from "@/lib/server/runtime"
import { MetricStrip, WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import { withReturnTo } from "@/lib/navigation"

export const dynamic = "force-dynamic"

const percentage = new Intl.NumberFormat("en", { maximumFractionDigits: 1 })

function share(value: number, total: number): number {
  return total ? (value / total) * 100 : 0
}

function DistributionList({ rows, total }: { rows: Array<{ label: string; value: number }>; total: number }) {
  const maximum = Math.max(1, ...rows.map((row) => row.value))
  return (
    <div className="divide-y divide-border/70">
      {rows.length ? rows.slice(0, 6).map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_96px_72px] items-center gap-3 py-2.5">
          <span className="truncate text-body font-normal">{row.label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (row.value / maximum) * 100)}%` }} />
          </span>
          <span className="text-right text-meta tabular-nums text-muted-foreground">
            {row.value} · {percentage.format(share(row.value, total))}%
          </span>
        </div>
      )) : <p className="py-8 text-center text-body text-muted-foreground">No attrition records are available.</p>}
    </div>
  )
}

function ReviewItem({ finding, evidence, action }: { finding: string; evidence: string; action: string }) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <p className="text-card-title font-semibold">{finding}</p>
      <p className="mt-1 text-meta tabular-nums text-muted-foreground">{evidence}</p>
      <p className="mt-2 text-body">{action}</p>
    </div>
  )
}

export default async function AttritionPage() {
  const [workforce, dashboard] = await Promise.all([
    getWorkforceAnalytics(),
    Promise.resolve(getDashboard()),
  ])
  const schema = getPredictionSchema()
  const historicalRows = dashboard.riskDistribution.reduce((sum, bucket) => sum + bucket.count, 0)
  const reviewShare = share(dashboard.highRiskCount, historicalRows)
  const voluntaryShare = share(workforce.attrition.voluntary, workforce.attrition.totalExits)
  const topDepartment = workforce.attrition.byDepartment[0]
  const topTenure = workforce.attrition.byTenure[0]
  const reasonCounts = Object.entries(
    workforce.attrition.rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.exit_reason] = (counts[row.exit_reason] ?? 0) + 1
      return counts
    }, {}),
  ).sort((left, right) => right[1] - left[1])
  const topReason = reasonCounts[0]

  return (
    <WorkspacePage>
      <WorkspaceHeader title="Attrition risk" description="Recorded exits, retention priorities, and model scenarios." actions={<Button nativeButton={false} render={<Link href={withReturnTo("/risk-review", "/attrition")} />}>
          Review employee risk
        </Button>}/>

      <MetricStrip metrics={[
        { label: "Attrition rate", value: `${percentage.format(workforce.attrition.rate)}%`, detail: "Recorded workforce outcomes" },
        { label: "Recorded exits", value: workforce.attrition.totalExits.toLocaleString(), detail: `${percentage.format(voluntaryShare)}% voluntary · ${workforce.attrition.involuntary} involuntary` },
        { label: "Risk review queue", value: dashboard.highRiskCount.toLocaleString(), detail: `${percentage.format(reviewShare)}% above the ${(dashboard.threshold * 100).toFixed(0)}% review threshold` },
      ]}/>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]" aria-label="Attrition review workspace">
        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle>Current attrition</CardTitle>
            <CardDescription>Recorded exits, separate from predicted risk.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 px-5 py-4 lg:grid-cols-2 lg:divide-x lg:divide-border">
            <div className="lg:pr-6">
              <h2 className="text-subsection font-semibold">By department</h2>
              <DistributionList rows={workforce.attrition.byDepartment} total={workforce.attrition.totalExits} />
            </div>
            <div className="lg:pl-6">
              <h2 className="text-subsection font-semibold">By tenure</h2>
              <DistributionList rows={workforce.attrition.byTenure} total={workforce.attrition.totalExits} />
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 shadow-none">
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle>Review next</CardTitle>
            <CardDescription>Recommended HR checks.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border/70 px-5 py-4">
            <ReviewItem
              finding={topDepartment ? `${topDepartment.label} exit concentration` : "Department concentration"}
              evidence={topDepartment ? `${topDepartment.value} exits · ${percentage.format(share(topDepartment.value, workforce.attrition.totalExits))}% of recorded exits` : "No department evidence available"}
              action="Compare roles, managers, tenure, and exit reasons before choosing an intervention."
            />
            <ReviewItem
              finding={topReason ? `${topReason[0]} exit reasons` : "Exit-reason quality"}
              evidence={topReason ? `${topReason[1]} of ${workforce.attrition.totalExits} recorded exits` : "No exit reasons available"}
              action="Check coding consistency and the supporting exit-interview evidence."
            />
            <ReviewItem
              finding={topTenure ? `${topTenure.label} tenure cohort` : "Tenure concentration"}
              evidence={topTenure ? `${topTenure.value} exits · ${percentage.format(share(topTenure.value, workforce.attrition.totalExits))}% of recorded exits` : "No tenure evidence available"}
              action="Review career stage, manager check-ins, mobility, and role clarity for this cohort."
            />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="predictor-heading">
        <div className="mb-3">
          <h2 id="predictor-heading" className="text-section font-semibold">Risk predictor</h2>
          <p className="mt-0.5 text-description text-muted-foreground">Test a profile and review the model signals behind the estimate.</p>
        </div>
        <AttritionPredictor schema={schema} />
      </section>

      <details className="rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-card-title font-semibold marker:text-muted-foreground">
          Model reference
        </summary>
        <div className="border-t border-border px-5 py-4">
          <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
            {dashboard.modelMetrics.map((metric) => (
              <div key={metric.label} className="bg-card px-3 py-3">
                <p className="text-meta text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-card-title font-semibold tabular-nums">{metric.value}</p>
                <p className="mt-1 text-status text-muted-foreground">{metric.hint}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-meta text-muted-foreground">
            The score is a review signal, not a decision. Confirm current evidence with the employee and an appropriate HR reviewer.
          </p>
        </div>
      </details>
    </WorkspacePage>
  )
}
