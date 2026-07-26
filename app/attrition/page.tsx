import { Brain, TrendingUp, TrendingDown, Minus, Info } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { AttritionTrendChart } from "@/components/charts/attrition-trend-chart"
import { FeatureImportanceChart } from "@/components/charts/feature-importance-chart"
import { RiskDistributionChart } from "@/components/charts/risk-distribution-chart"
import { modelMetrics, leaveReasons } from "@/lib/data"

const trendIcon = { up: TrendingUp, down: TrendingDown, flat: Minus }

export default function AttritionPage() {
  return (
    <div className="flex flex-col gap-5">
      {/* Model status strip */}
      <Card className="gap-4 p-4">
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          <p className="text-sm font-medium">Prediction model</p>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            Healthy
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {modelMetrics.map((m) => (
            <div key={m.label} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{m.label}</span>
              <span className="font-mono text-lg font-semibold tabular-nums">{m.value}</span>
              <span className="text-[11px] text-muted-foreground">{m.hint}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Forecast */}
      <Card>
        <CardHeader>
          <CardTitle>12-month attrition forecast</CardTitle>
          <CardDescription>
            Model predicts a downward trajectory as retention interventions take effect
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AttritionTrendChart />
        </CardContent>
      </Card>

      {/* Feature importance + risk distribution */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What drives the prediction</CardTitle>
            <CardDescription>Global feature importance (SHAP) across the workforce</CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureImportanceChart />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Risk score distribution</CardTitle>
              <CardDescription>Full workforce scored 0-100% likelihood to leave</CardDescription>
            </CardHeader>
            <CardContent>
              <RiskDistributionChart />
            </CardContent>
          </Card>

          <Card className="gap-2 p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground text-pretty">
                <span className="font-medium text-foreground">386 employees</span> fall in the 60-100%
                risk band. Prioritizing the top 118 for intervention protects an estimated{" "}
                <span className="font-medium text-foreground">$6.6M</span> in replacement cost.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Reasons breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle>Reasons for leaving — and how to avoid them</CardTitle>
          <CardDescription>Exit drivers with recommended organizational countermeasures</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {leaveReasons.map((r, i) => {
            const Icon = trendIcon[r.trend]
            return (
              <div
                key={r.reason}
                className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-56 items-center gap-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ background: `var(--chart-${(i % 5) + 1})` }}
                  />
                  <span className="text-sm font-medium">{r.reason}</span>
                  <Icon
                    className={
                      r.trend === "up"
                        ? "size-3.5 text-destructive"
                        : r.trend === "down"
                          ? "size-3.5 text-success"
                          : "size-3.5 text-muted-foreground"
                    }
                  />
                </div>
                <div className="flex flex-1 items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${r.share * 3}%`, background: `var(--chart-${(i % 5) + 1})` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-sm tabular-nums">{r.share}%</span>
                </div>
                <p className="text-xs text-muted-foreground sm:w-64 sm:text-right">
                  {countermeasures[r.reason] ?? "Targeted manager coaching"}
                </p>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

const countermeasures: Record<string, string> = {
  "Compensation & benefits": "Off-cycle comp reviews, market benchmarking",
  "Career growth stalled": "Promotion velocity + internal mobility program",
  "Manager relationship": "Manager coaching, span-of-control rebalancing",
  "Work-life balance": "Workload monitoring, PTO nudges, flexible schedules",
  "Lack of recognition": "Spot bonuses and structured recognition",
  "Relocation / personal": "Remote/hybrid options where feasible",
  "Company direction": "Transparent strategy comms and town halls",
}
