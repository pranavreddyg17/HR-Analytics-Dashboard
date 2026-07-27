import Link from "next/link"
import { Sparkles, ArrowRight, Minus } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { KpiCard } from "@/components/kpi-card"
import { RiskBadge } from "@/components/risk-badge"
import { AttritionTrendChart } from "@/components/charts/attrition-trend-chart"
import { DepartmentRiskChart } from "@/components/charts/department-risk-chart"
import { ReasonsChart } from "@/components/charts/reasons-chart"
import { getDashboard } from "@/lib/server/runtime"

export const dynamic = "force-dynamic"

export default async function OverviewPage() {
  const dashboard = getDashboard()

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-0 border-primary/20 bg-gradient-to-r from-primary/10 to-transparent p-4 ring-primary/20">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="size-4.5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Data-backed daily brief</p>
            <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{dashboard.dailyBrief}</p>
          </div>
          <Button variant="outline" size="sm" nativeButton={false} className="shrink-0" render={<Link href="/ai-agents" />}>
            Ask analytics
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {dashboard.kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Observed vs predicted attrition by tenure</CardTitle>
            <CardDescription>Historical outcome rate compared with mean model risk for each tenure cohort</CardDescription>
          </CardHeader>
          <CardContent>
            <AttritionTrendChart data={dashboard.attritionTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Positive model signals</CardTitle>
            <CardDescription>Relative share of model coefficients associated with higher risk</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ReasonsChart data={dashboard.leaveReasons} />
            <div className="flex flex-col gap-1.5">
              {dashboard.leaveReasons.slice(0, 4).map((reason, index) => (
                <div key={reason.reason} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ background: `var(--chart-${(index % 5) + 1})` }}
                  />
                  <span className="flex-1 truncate text-muted-foreground">{reason.reason}</span>
                  <span className="font-mono tabular-nums">{reason.share.toFixed(1)}%</span>
                  <Minus className="size-3.5 text-muted-foreground" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Attrition risk by department</CardTitle>
            <CardDescription>Mean predicted probability, observed attrition, and records above the review threshold</CardDescription>
          </CardHeader>
          <CardContent>
            <DepartmentRiskChart data={dashboard.departmentRisk} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top model-flagged records</CardTitle>
            <CardDescription>Anonymised historical rows, sorted by predicted risk</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {dashboard.topEmployees.map((employee) => (
              <div key={employee.id} className="flex items-center gap-3 rounded-lg bg-muted/40 p-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                  {employee.id.slice(-4)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{employee.id}</p>
                  <p className="truncate text-xs text-muted-foreground">{employee.department} · {employee.tenure}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-sm font-semibold tabular-nums">{employee.riskScore.toFixed(1)}%</span>
                  <RiskBadge level={employee.riskLevel} />
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" nativeButton={false} className="mt-1 w-full" render={<Link href="/employees" />}>
              View scored records
              <ArrowRight className="size-3.5" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        This dashboard uses the uploaded historical dataset. It does not contain live HRIS data, names, managers, dates, training, hiring, leave, or promotion records.
      </p>
    </div>
  )
}
