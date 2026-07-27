import { Brain, Info, ShieldCheck } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { AttritionTrendChart } from "@/components/charts/attrition-trend-chart"
import { FeatureImportanceChart } from "@/components/charts/feature-importance-chart"
import { RiskDistributionChart } from "@/components/charts/risk-distribution-chart"
import { AttritionPredictor } from "@/components/attrition-predictor"
import { getDashboard, getPredictionSchema } from "@/lib/server/runtime"

export const dynamic = "force-dynamic"

export default async function AttritionPage() {
  const dashboard = getDashboard()
  const schema = getPredictionSchema()

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-4 p-4">
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          <p className="text-sm font-medium">Prediction model</p>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            <ShieldCheck className="size-3" /> API healthy
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {dashboard.modelMetrics.map((metric) => (
            <div key={metric.label} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{metric.label}</span>
              <span className="font-mono text-lg font-semibold tabular-nums">{metric.value}</span>
              <span className="text-[11px] text-muted-foreground">{metric.hint}</span>
            </div>
          ))}
        </div>
      </Card>

      <AttritionPredictor schema={schema} />

      <Card>
        <CardHeader>
          <CardTitle>Observed vs predicted attrition by tenure</CardTitle>
          <CardDescription>
            The uploaded CSV has no dates, so a time-series forecast would be fabricated. This uses real tenure cohorts instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AttritionTrendChart data={dashboard.attritionTrend} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What drives the model</CardTitle>
            <CardDescription>Normalised absolute logistic-regression coefficients</CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureImportanceChart data={dashboard.featureImportance} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Risk score distribution</CardTitle>
              <CardDescription>All 1,470 historical records scored by the deployed model</CardDescription>
            </CardHeader>
            <CardContent>
              <RiskDistributionChart data={dashboard.riskDistribution} />
            </CardContent>
          </Card>

          <Card className="gap-2 p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground text-pretty">
                <span className="font-medium text-foreground">{dashboard.highRiskCount.toLocaleString()} records</span> are above the {(dashboard.threshold * 100).toFixed(0)}% review threshold. Their annual payroll totals approximately{" "}
                <span className="font-medium text-foreground">${(dashboard.highRiskPayroll / 1_000_000).toFixed(1)}M</span>. This is payroll exposure, not a claimed replacement cost or savings estimate.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Model-associated risk signals</CardTitle>
          <CardDescription>
            Associations learned from historical data; they are not verified causes of employee departure
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {dashboard.leaveReasons.map((reason, index) => (
            <div key={reason.reason} className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-56 items-center gap-2.5">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: `var(--chart-${(index % 5) + 1})` }} />
                <span className="text-sm font-medium">{reason.reason}</span>
              </div>
              <div className="flex flex-1 items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full" style={{ width: `${reason.share}%`, background: `var(--chart-${(index % 5) + 1})` }} />
                </div>
                <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums">{reason.share.toFixed(1)}%</span>
              </div>
              <p className="text-xs text-muted-foreground sm:w-72 sm:text-right">{countermeasures[reason.reason] ?? "Review with current governed HR data"}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

const countermeasures: Record<string, string> = {
  "Commute distance": "Evaluate flexible or hybrid arrangements where job duties allow",
  "Prior companies worked": "Use a stay interview to clarify career expectations",
  "Department": "Inspect department-level workload, manager, pay, and mobility patterns",
  "Education field": "Review role alignment and internal mobility opportunities",
}
