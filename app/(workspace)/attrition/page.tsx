import Link from "next/link"

import { AttritionPredictor } from "@/components/attrition-predictor"
import { AttritionTrendChart } from "@/components/charts/attrition-trend-chart"
import { DepartmentRiskChart } from "@/components/charts/department-risk-chart"
import { FeatureImportanceChart } from "@/components/charts/feature-importance-chart"
import { RiskDistributionChart } from "@/components/charts/risk-distribution-chart"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { getDashboard, getPredictionSchema } from "@/lib/server/runtime"

export const dynamic = "force-dynamic"

const percentage = new Intl.NumberFormat("en", { maximumFractionDigits: 1 })

function share(value: number, total: number): number {
  return total ? (value / total) * 100 : 0
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  )
}

function DistributionList({
  rows,
  total,
}: {
  rows: Array<{ label: string; value: number }>
  total: number
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.value))
  return (
    <div className="divide-y divide-border">
      {rows.length ? rows.slice(0, 6).map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_112px_72px] items-center gap-4 py-3">
          <span className="truncate text-sm font-medium">{row.label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(4, (row.value / maximum) * 100)}%` }} />
          </span>
          <span className="text-right text-xs tabular-nums text-muted-foreground">
            {row.value} · {percentage.format(share(row.value, total))}%
          </span>
        </div>
      )) : <p className="py-8 text-center text-sm text-muted-foreground">No attrition records are available.</p>}
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
  const topModelDepartment = [...dashboard.departmentRisk].sort((left, right) => right.atRisk - left.atRisk)[0]
  const highestTenureCohort = [...dashboard.attritionTrend]
    .filter((row) => row.actual !== null)
    .sort((left, right) => (right.actual ?? 0) - (left.actual ?? 0))[0]
  const benchmarkGap = highestTenureCohort && highestTenureCohort.actual !== null
    ? highestTenureCohort.actual - highestTenureCohort.benchmark
    : 0
  const topCurrentDepartment = workforce.attrition.byDepartment[0]
  const reasonCounts = Object.entries(
    workforce.attrition.rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.exit_reason] = (counts[row.exit_reason] ?? 0) + 1
      return counts
    }, {}),
  ).sort((left, right) => right[1] - left[1])
  const topCurrentReason = reasonCounts[0]

  const priorities = [
    {
      priority: "Current",
      finding: topCurrentDepartment
        ? `${topCurrentDepartment.label} has the most recorded exits`
        : "No current department concentration",
      evidence: topCurrentDepartment
        ? `${topCurrentDepartment.value} exits · ${percentage.format(share(topCurrentDepartment.value, workforce.attrition.totalExits))}% of current records`
        : "Add or import attrition records to establish a baseline",
      nextStep: "Compare exit reasons, tenure, manager coverage, and role mix before selecting an intervention.",
    },
    {
      priority: "Current",
      finding: topCurrentReason ? `${topCurrentReason[0]} is the most common recorded exit reason` : "No current exit-reason pattern",
      evidence: topCurrentReason ? `${topCurrentReason[1]} of ${workforce.attrition.totalExits} recorded exits` : "Exit reasons are not yet available",
      nextStep: "Validate reason coding and review the related employee comments or exit-interview evidence.",
    },
    {
      priority: "Benchmark",
      finding: highestTenureCohort ? `${highestTenureCohort.month} is the highest-attrition tenure cohort` : "No tenure benchmark",
      evidence: highestTenureCohort && highestTenureCohort.actual !== null
        ? `${highestTenureCohort.actual.toFixed(1)}% observed · ${benchmarkGap >= 0 ? "+" : ""}${benchmarkGap.toFixed(1)} points vs overall rate`
        : "Historical cohort evidence is unavailable",
      nextStep: "Review onboarding, manager check-ins, role clarity, and early internal mobility for this cohort.",
    },
    {
      priority: "Model",
      finding: `${dashboard.highRiskCount.toLocaleString()} historical records exceed the review threshold`,
      evidence: `${percentage.format(reviewShare)}% of ${historicalRows.toLocaleString()} scored records · threshold ${(dashboard.threshold * 100).toFixed(0)}%`,
      nextStep: "Use the worklist to prioritize voluntary stay conversations, never as an automatic employment decision.",
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 pb-10">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attrition risk</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Review current attrition patterns, identify retention priorities, and evaluate explainable prediction scenarios.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/risk-review" />}>
            Review scored records
          </Button>
          <Button nativeButton={false} size="sm" render={<Link href="/insights" />}>
            Workforce insights
          </Button>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2" aria-label="Data scope">
        <div className="rounded-lg border border-border bg-card p-4">
            <div>
              <p className="text-sm font-semibold">Current workforce evidence</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Recorded attrition outcomes, exit reasons, departments, and tenure cohorts.
              </p>
            </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
            <div>
              <p className="text-sm font-semibold">Historical prediction benchmark</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {historicalRows.toLocaleString()} historical model records linked to employee profiles for joined analysis.
              </p>
            </div>
        </div>
      </section>

      <section aria-labelledby="attrition-summary-heading">
        <div className="mb-3">
          <h2 id="attrition-summary-heading" className="text-sm font-semibold">Attrition summary</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Current outcomes and historical prediction coverage are shown separately.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric label="Current attrition rate" value={`${percentage.format(workforce.attrition.rate)}%`} detail="Recorded exits divided by active employees plus exits" />
          <SummaryMetric label="Recorded exits" value={workforce.attrition.totalExits.toLocaleString()} detail={`${percentage.format(voluntaryShare)}% voluntary · ${workforce.attrition.involuntary} involuntary`} />
          <SummaryMetric label="Historical review population" value={dashboard.highRiskCount.toLocaleString()} detail={`${percentage.format(reviewShare)}% exceed the ${(dashboard.threshold * 100).toFixed(0)}% model threshold`} />
          <SummaryMetric label="Largest model cohort" value={topModelDepartment?.department ?? "—"} detail={topModelDepartment ? `${topModelDepartment.atRisk} records above threshold · ${topModelDepartment.riskScore.toFixed(1)}% mean risk` : "No model cohort available"} />
        </div>
      </section>

      <Card className="gap-0 rounded-lg py-0 shadow-none">
        <CardHeader className="border-b border-border px-5 py-4">
          <CardTitle className="text-base">Retention priorities</CardTitle>
          <CardDescription>Evidence to review, why it matters, and the appropriate HR follow-up.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/35 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Evidence type</th>
                  <th className="px-5 py-3 font-medium">Finding</th>
                  <th className="px-5 py-3 font-medium">Evidence</th>
                  <th className="px-5 py-3 font-medium">Recommended review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {priorities.map((item) => (
                  <tr key={`${item.priority}-${item.finding}`} className="align-top hover:bg-muted/20">
                    <td className="px-5 py-4">
                      <span className="text-xs font-medium text-muted-foreground">{item.priority}</span>
                    </td>
                    <td className="px-5 py-4 font-medium">{item.finding}</td>
                    <td className="px-5 py-4 text-muted-foreground">{item.evidence}</td>
                    <td className="px-5 py-4 text-muted-foreground">{item.nextStep}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="current-patterns-heading">
        <div className="mb-3">
          <h2 id="current-patterns-heading" className="text-sm font-semibold">Current attrition patterns</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Recorded exits in the HR database, not model predictions.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="gap-0 rounded-lg py-0 shadow-none">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle className="text-base">Exits by department</CardTitle>
              <CardDescription>Count and share of all recorded exits.</CardDescription>
            </CardHeader>
            <CardContent className="px-5 py-1">
              <DistributionList rows={workforce.attrition.byDepartment} total={workforce.attrition.totalExits} />
            </CardContent>
          </Card>
          <Card className="gap-0 rounded-lg py-0 shadow-none">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle className="text-base">Exits by tenure</CardTitle>
              <CardDescription>Use tenure concentration to target lifecycle improvements.</CardDescription>
            </CardHeader>
            <CardContent className="px-5 py-1">
              <DistributionList rows={workforce.attrition.byTenure} total={workforce.attrition.totalExits} />
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="benchmark-heading">
        <div className="mb-3">
          <h2 id="benchmark-heading" className="text-sm font-semibold">Historical prediction benchmark</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Model behavior across the historical validation cohorts and their linked employee profiles.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Department review concentration</CardTitle>
              <CardDescription>Mean predicted risk, records above threshold, and observed attrition.</CardDescription>
            </CardHeader>
            <CardContent><DepartmentRiskChart data={dashboard.departmentRisk} /></CardContent>
          </Card>
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Attrition by tenure cohort</CardTitle>
              <CardDescription>Observed attrition compared with mean predicted risk and the overall benchmark.</CardDescription>
            </CardHeader>
            <CardContent><AttritionTrendChart data={dashboard.attritionTrend} /></CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="scenario-heading">
        <div className="mb-3">
          <h2 id="scenario-heading" className="text-sm font-semibold">Scenario assessment</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Test an explainable profile against the deployed historical model.</p>
        </div>
        <AttritionPredictor schema={schema} />
      </section>

      <section aria-labelledby="governance-heading">
        <div className="mb-3">
          <h2 id="governance-heading" className="text-sm font-semibold">Model interpretation and governance</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Use these measures to understand model behavior and limitations.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Model feature importance</CardTitle>
              <CardDescription>Relative coefficient magnitude; importance does not establish causation.</CardDescription>
            </CardHeader>
            <CardContent><FeatureImportanceChart data={dashboard.featureImportance} /></CardContent>
          </Card>
          <div className="grid gap-4">
            <Card className="rounded-lg shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Risk score distribution</CardTitle>
                <CardDescription>All historical records grouped by predicted probability.</CardDescription>
              </CardHeader>
              <CardContent><RiskDistributionChart data={dashboard.riskDistribution} /></CardContent>
            </Card>
            <Card className="gap-0 rounded-lg py-0 shadow-none">
              <CardHeader className="border-b border-border px-5 py-4">
                <CardTitle className="text-base">Validation measures</CardTitle>
                <CardDescription>Quality measures for the historical model.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-px bg-border p-0 sm:grid-cols-3">
                {dashboard.modelMetrics.map((metric) => (
                  <div key={metric.label} className="bg-card px-4 py-3">
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">{metric.value}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{metric.hint}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Predicted risk is a statistical estimate for qualified human review. Do not use it as the sole basis for an employment decision. Historical payroll associated with records above threshold is approximately ${(dashboard.highRiskPayroll / 1_000_000).toFixed(1)}M; this is payroll exposure, not a replacement-cost or savings estimate.
      </div>
    </div>
  )
}
