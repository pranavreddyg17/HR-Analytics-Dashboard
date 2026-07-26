import Link from "next/link"
import { Sparkles, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { KpiCard } from "@/components/kpi-card"
import { RiskBadge } from "@/components/risk-badge"
import { AttritionTrendChart } from "@/components/charts/attrition-trend-chart"
import { DepartmentRiskChart } from "@/components/charts/department-risk-chart"
import { ReasonsChart } from "@/components/charts/reasons-chart"
import { kpis, leaveReasons, agentActions, employees } from "@/lib/data"

const trendIcon = { up: TrendingUp, down: TrendingDown, flat: Minus }

export default function OverviewPage() {
  const topRisks = [...employees].sort((a, b) => b.riskScore - a.riskScore).slice(0, 4)
  const pendingActions = agentActions.filter((a) => a.status === "needs_approval").length

  return (
    <div className="flex flex-col gap-5">
      {/* AI insight banner */}
      <Card className="gap-0 border-primary/20 bg-gradient-to-r from-primary/10 to-transparent p-4 ring-primary/20">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="size-4.5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">AI Daily Brief</p>
            <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
              Attrition is projected to fall to <span className="font-medium text-foreground">13.1%</span> by
              December. Sales remains the top hotspot with {" "}
              <span className="font-medium text-foreground">96 at-risk</span> employees driven by
              below-market compensation. {pendingActions} agent actions are awaiting your approval.
            </p>
          </div>
          <Button variant="outline" size="sm" nativeButton={false} className="shrink-0" render={<Link href="/ai-agents" />}>
            Review
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* Trend + reasons */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Attrition rate & ML forecast</CardTitle>
            <CardDescription>Rolling 12-month actuals vs model prediction and industry benchmark</CardDescription>
          </CardHeader>
          <CardContent>
            <AttritionTrendChart />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Why people leave</CardTitle>
            <CardDescription>Attributed exit drivers this quarter</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ReasonsChart />
            <div className="flex flex-col gap-1.5">
              {leaveReasons.slice(0, 4).map((r, i) => {
                const Icon = trendIcon[r.trend]
                return (
                  <div key={r.reason} className="flex items-center gap-2 text-sm">
                    <span
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ background: `var(--chart-${(i % 5) + 1})` }}
                    />
                    <span className="flex-1 truncate text-muted-foreground">{r.reason}</span>
                    <span className="font-mono tabular-nums">{r.share}%</span>
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
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Department risk + top risks */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Attrition risk by department</CardTitle>
            <CardDescription>Model risk score (0-100) — red bars exceed the intervention threshold</CardDescription>
          </CardHeader>
          <CardContent>
            <DepartmentRiskChart />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top flight risks</CardTitle>
            <CardDescription>Highest-scored individuals right now</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {topRisks.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-lg bg-muted/40 p-2.5"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {e.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.role}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-sm font-semibold tabular-nums">{e.riskScore}</span>
                  <RiskBadge level={e.riskLevel} />
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" nativeButton={false} className="mt-1 w-full" render={<Link href="/employees" />}>
              View all at-risk people
              <ArrowRight className="size-3.5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
