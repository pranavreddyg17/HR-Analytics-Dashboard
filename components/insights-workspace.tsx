"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Download,
  FilterX,
} from "lucide-react"
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { apiBaseUrl } from "@/lib/api"
import type { BreakdownPoint, TimePoint, WorkforceAnalytics } from "@/lib/hr-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatWorkspaceDateTime } from "@/lib/date-format"

type Filters = {
  from: string
  to: string
  department: string
  location: string
  period: "month" | "quarter" | "year"
}

type DepartmentRow = {
  department: string
  active: number
  hires: number
  exits: number
  leaveDays: number
  learningHours: number
  promotions: number
}

const defaultFilters: Filters = { from: "", to: "", department: "", location: "", period: "month" }

function queryFor(filters: Filters): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
  return params.toString()
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 1_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value)
}

function valueMap(rows: BreakdownPoint[]): Map<string, number> {
  return new Map(rows.map((row) => [row.label, row.value]))
}

function flowRows(hiring: TimePoint[], attrition: TimePoint[]): Array<{ period: string; hires: number; exits: number }> {
  const periods = [...new Set([...hiring, ...attrition].map((row) => row.period))].sort()
  const hiringMap = new Map(hiring.map((row) => [row.period, row.value]))
  const attritionMap = new Map(attrition.map((row) => [row.period, row.value]))
  return periods.map((period) => ({ period, hires: hiringMap.get(period) ?? 0, exits: attritionMap.get(period) ?? 0 }))
}

function Kpi({ label, value, context }: { label: string; value: string; context: string }) {
  return <Card className="gap-2 p-4 shadow-none"><p className="text-xs font-medium text-muted-foreground">{label}</p><div><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-meta text-muted-foreground">{context}</p></div></Card>
}

function FlowTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs"><p className="font-medium">{label}</p>{payload.map((item) => <p key={item.name} className="mt-1 text-muted-foreground"><span className="font-semibold" style={{ color: item.color }}>{item.value}</span> {item.name}</p>)}</div>
}

function FlowChart({ rows }: { rows: ReturnType<typeof flowRows> }) {
  if (!rows.length) return <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-sm text-muted-foreground">No hires or exits are recorded for this period.</div>
  return <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ left: -20, right: 10, top: 8, bottom: 2 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)"/><XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)" }}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)" }}/><Tooltip content={<FlowTooltip/>}/><Legend/><Line type="monotone" dataKey="hires" name="Hires" stroke="var(--chart-1)" strokeWidth={2.25} dot={false}/><Line type="monotone" dataKey="exits" name="Exits" stroke="var(--chart-5)" strokeWidth={2.25} dot={false}/></LineChart></ResponsiveContainer></div>
}

function reviewSignal(row: DepartmentRow): { label: string; className: string } {
  if (row.exits > row.hires) return { label: "Net workforce loss", className: "text-rose-700 dark:text-rose-300" }
  if (row.active > 0 && row.promotions === 0) return { label: "No recorded mobility", className: "text-amber-700 dark:text-amber-300" }
  if (row.active > 0 && row.leaveDays / row.active >= 4) return { label: "Coverage review", className: "text-sky-700 dark:text-sky-300" }
  return { label: "None", className: "text-muted-foreground" }
}

export function InsightsWorkspace() {
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [data, setData] = useState<WorkforceAnalytics | null>(null)
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [error, setError] = useState("")
  const requestQuery = useMemo(() => queryFor(filters), [filters])
  const loading = requestQuery !== loadedQuery

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/api/v1/workforce?${requestQuery}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Workforce insights could not be loaded."); return response.json() as Promise<WorkforceAnalytics> })
      .then((result) => { setData(result); setLoadedQuery(requestQuery); setError("") })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") { setError(reason instanceof Error ? reason.message : "Workforce insights could not be loaded."); setLoadedQuery(requestQuery) } })
    return () => controller.abort()
  }, [requestQuery])

  if (!data && loading) return <div className="space-y-4"><div className="h-24 animate-pulse rounded-md bg-muted"/><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-md bg-muted"/>)}</div></div>
  if (!data) return <Card><CardContent className="p-6 text-sm text-destructive">{error || "Workforce insights could not be loaded."}</CardContent></Card>

  const netMovement = data.hiring.totalHired - data.attrition.totalExits
  const flow = flowRows(data.hiring.trend, data.attrition.trend)
  const active = valueMap(data.employeeAnalytics.activeByDepartment)
  const hires = valueMap(data.hiring.byDepartment)
  const exits = valueMap(data.attrition.byDepartment)
  const leave = valueMap(data.leave.byDepartment)
  const learning = valueMap(data.training.byDepartment)
  const promotions = valueMap(data.promotions.byDepartment)
  const departments = [...new Set([...active.keys(), ...hires.keys(), ...exits.keys(), ...leave.keys(), ...learning.keys(), ...promotions.keys()])]
  const departmentRows: DepartmentRow[] = departments.map((department) => ({ department, active: active.get(department) ?? 0, hires: hires.get(department) ?? 0, exits: exits.get(department) ?? 0, leaveDays: leave.get(department) ?? 0, learningHours: learning.get(department) ?? 0, promotions: promotions.get(department) ?? 0 })).sort((left, right) => right.active - left.active || left.department.localeCompare(right.department))
  const workItems = [
    { priority: data.leave.pending > 0 ? "High" : "Clear", item: "Leave approvals", count: data.leave.pending, definition: "Pending requests awaiting an HR or manager decision", href: "/time-off#pending-decisions", action: "Review" },
    { priority: data.hiring.activeRequisitions > 0 ? "Normal" : "Clear", item: "Open requisitions", count: data.hiring.activeRequisitions, definition: `${data.hiring.offers} offers currently recorded`, href: "/hiring", action: "Open hiring" },
    { priority: data.training.requiringMandatoryTraining > 0 ? "High" : "Clear", item: "Mandatory training", count: data.training.requiringMandatoryTraining, definition: "Incomplete security or safety assignments", href: "/learning", action: "Review" },
    { priority: data.promotions.withoutPromotionOver36Months > 0 ? "Normal" : "Clear", item: "Mobility review", count: data.promotions.withoutPromotionOver36Months, definition: "Active employees with 3+ years tenure and no recorded promotion", href: "/people?tenure=mobility", action: "Review people" },
  ]

  return <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 pb-10">
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-2xl font-semibold">Workforce insights</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Company workforce metrics, open HR work, and department exceptions.</p><p className="mt-2 text-meta text-muted-foreground">Last refreshed {formatWorkspaceDateTime(data.generatedAt)}</p></div><div className="flex flex-wrap gap-2"><a href={`${apiBaseUrl}/api/v1/reports?format=pdf&${requestQuery}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted"><Download className="size-3.5"/>PDF summary</a><a href={`${apiBaseUrl}/api/v1/reports?format=xlsx&${requestQuery}`} className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"><Download className="size-3.5"/>Export data</a></div></header>

    <Card className="gap-4 p-4 shadow-none"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-medium">Filters</p><Button size="sm" variant="ghost" onClick={() => setFilters(defaultFilters)}><FilterX className="size-4"/>Reset</Button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Filter label="From"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })}/></Filter><Filter label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })}/></Filter><Filter label="Department"><select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Location"><select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}><option value="">All locations</option>{data.dimensions.locations.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Reporting interval"><select value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value as Filters["period"] })}><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></Filter></div>{loading && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse rounded-full bg-primary"/></div>}</Card>

    {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">{error}</div>}

    <section aria-labelledby="summary-title"><div className="mb-3"><h2 id="summary-title" className="text-base font-semibold">Workforce summary</h2><p className="mt-0.5 text-xs text-muted-foreground">Current workforce and movement for the selected reporting scope.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Kpi label="Active employees" value={compact(data.kpis.activeEmployees)} context={`${data.employeeAnalytics.onLeave} recorded as on leave`}/><Kpi label="Hires" value={compact(data.hiring.totalHired)} context="Completed hires in period"/><Kpi label="Exits" value={compact(data.attrition.totalExits)} context={`${data.attrition.voluntary} voluntary`}/><Kpi label="Net movement" value={`${netMovement > 0 ? "+" : ""}${compact(netMovement)}`} context="Hires less exits"/><Kpi label="Attrition rate" value={`${data.attrition.rate.toLocaleString()}%`} context="Exits divided by active employees plus exits"/><Kpi label="Training completion" value={`${data.training.completionRate.toLocaleString()}%`} context={`${data.training.totalHours.toLocaleString()} assigned hours`}/></div></section>

    <section aria-labelledby="work-title"><div className="mb-3"><h2 id="work-title" className="text-base font-semibold">HR work requiring review</h2><p className="mt-0.5 text-xs text-muted-foreground">Open items linked to their responsible workflow.</p></div><Card className="gap-0 overflow-hidden py-0 shadow-none"><CardContent className="px-0 pb-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-muted/50"><tr>{["Priority", "Work item", "Open", "Definition", ""].map((heading) => <th key={heading} className="px-4 py-3 font-medium text-muted-foreground">{heading}</th>)}</tr></thead><tbody>{workItems.map((row) => <tr key={row.item} className="border-t border-border/60"><td className="px-4 py-3"><span className={cn("text-meta font-medium", row.priority === "High" ? "text-rose-700 dark:text-rose-300" : row.priority === "Normal" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{row.priority}</span></td><td className="px-4 py-3 font-medium">{row.item}</td><td className="px-4 py-3 font-semibold tabular-nums">{row.count}</td><td className="px-4 py-3 text-muted-foreground">{row.definition}</td><td className="px-4 py-3 text-right"><Link href={row.href} className="font-medium text-primary hover:underline">{row.action}</Link></td></tr>)}</tbody></table></div></CardContent></Card></section>

    <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]"><Card className="shadow-none"><CardHeader><CardTitle>Joiners and leavers</CardTitle><CardDescription>Completed hires and recorded exits by {data.filters.period}</CardDescription></CardHeader><CardContent><FlowChart rows={flow}/></CardContent></Card><Card className="shadow-none"><CardHeader><CardTitle>Key findings</CardTitle><CardDescription>Calculated from the selected records</CardDescription></CardHeader><CardContent>{data.executiveInsights.length ? <ul className="space-y-3">{data.executiveInsights.map((insight) => <li key={insight} className="border-b border-border/60 pb-3 text-xs last:border-0 last:pb-0">{insight}</li>)}</ul> : <div className="rounded-md border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Not enough data in this scope to produce findings.</div>}<Button nativeButton={false} variant="outline" className="mt-4 w-full" render={<Link href="/ai-agents"/>}>Open detailed analysis</Button></CardContent></Card></div>

    <section aria-labelledby="operating-signals-title">
      <div className="mb-3">
        <h2 id="operating-signals-title" className="text-base font-semibold">Operating signals</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Manager exit concentration and replacement coverage for {data.operatingSignals.windowLabel.toLowerCase()}.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <CardHeader className="border-b border-border py-4"><CardTitle>Manager exit concentration</CardTitle><CardDescription>Shows where recorded exits cluster; it is not a manager performance score.</CardDescription></CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-muted/50"><tr>{["Manager", "Department", "Active team", "Exits", "Voluntary", "Dept. share"].map((heading) => <th key={heading} className="px-4 py-3 font-medium text-muted-foreground">{heading}</th>)}</tr></thead>
                <tbody>{data.operatingSignals.managerExitConcentration.slice(0, 8).map((row) => <tr key={`${row.managerId ?? row.manager}-${row.department}`} className="border-t border-border/60"><td className="px-4 py-3 font-medium">{row.manager}</td><td className="px-4 py-3 text-muted-foreground">{row.department}</td><td className="px-4 py-3 tabular-nums">{row.activeTeamSize}</td><td className="px-4 py-3 font-semibold tabular-nums">{row.exits}</td><td className="px-4 py-3 tabular-nums">{row.voluntaryExits}</td><td className="px-4 py-3 tabular-nums">{row.shareOfDepartmentExits}%</td></tr>)}</tbody>
              </table>
              {!data.operatingSignals.managerExitConcentration.length && <div className="p-8 text-center text-xs text-muted-foreground">No manager-level exit concentration is recorded in this window.</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <CardHeader className="border-b border-border py-4"><CardTitle>Replacement coverage</CardTitle><CardDescription>Compares exits with completed hires and the current requisition pipeline.</CardDescription></CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[660px] text-left text-xs">
                <thead className="bg-muted/50"><tr>{["Department", "Hires", "Exits", "Open roles", "Net", "Avg. hire time", "Status"].map((heading) => <th key={heading} className="px-4 py-3 font-medium text-muted-foreground">{heading}</th>)}</tr></thead>
                <tbody>{data.operatingSignals.replacementCoverage.map((row) => <tr key={row.department} className="border-t border-border/60"><td className="px-4 py-3"><button type="button" onClick={() => setFilters({ ...filters, department: row.department })} className="font-medium hover:text-primary hover:underline">{row.department}</button></td><td className="px-4 py-3 tabular-nums">{row.hires}</td><td className="px-4 py-3 tabular-nums">{row.exits}</td><td className="px-4 py-3 tabular-nums">{row.openRequisitions}</td><td className="px-4 py-3 font-semibold tabular-nums">{row.netMovement > 0 ? "+" : ""}{row.netMovement}</td><td className="px-4 py-3 tabular-nums">{row.averageTimeToHire ? `${row.averageTimeToHire} days` : "—"}</td><td className="px-4 py-3"><span className={cn("text-meta font-medium", row.status === "Gap" ? "text-rose-700 dark:text-rose-300" : row.status === "Watch" ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300")}>{row.status}</span></td></tr>)}</tbody>
              </table>
              {!data.operatingSignals.replacementCoverage.length && <div className="p-8 text-center text-xs text-muted-foreground">No workforce movement is recorded in this window.</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>

    <section aria-labelledby="department-title"><div className="mb-3"><h2 id="department-title" className="text-base font-semibold">Department review</h2><p className="mt-0.5 text-xs text-muted-foreground">Headcount, workforce movement, leave, learning, and promotions by department.</p></div><Card className="gap-0 overflow-hidden py-0 shadow-none"><CardContent className="px-0 pb-0"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-muted/50"><tr>{["Department", "Active", "Hires", "Exits", "Leave days", "Learning hours", "Promotions", "Exception"].map((heading) => <th key={heading} className="px-4 py-3 font-medium text-muted-foreground">{heading}</th>)}</tr></thead><tbody>{departmentRows.map((row) => { const signal = reviewSignal(row); return <tr key={row.department} className="border-t border-border/60 hover:bg-muted/20"><td className="px-4 py-3"><button type="button" onClick={() => setFilters({ ...filters, department: row.department })} className="font-medium hover:text-primary hover:underline">{row.department}</button></td><td className="px-4 py-3 tabular-nums">{row.active}</td><td className="px-4 py-3 tabular-nums">{row.hires}</td><td className="px-4 py-3 tabular-nums">{row.exits}</td><td className="px-4 py-3 tabular-nums">{row.leaveDays}</td><td className="px-4 py-3 tabular-nums">{row.learningHours}</td><td className="px-4 py-3 tabular-nums">{row.promotions}</td><td className="px-4 py-3"><span className={cn("text-meta font-medium", signal.className)}>{signal.label}</span></td></tr>})}</tbody></table>{!departmentRows.length && <div className="p-10 text-center text-sm text-muted-foreground">No departments match the selected filters.</div>}</div><div className="border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground">Select a department name to filter the report.</div></CardContent></Card></section>

    <section aria-labelledby="program-title"><div className="mb-3"><h2 id="program-title" className="text-base font-semibold">Workforce programs</h2><p className="mt-0.5 text-xs text-muted-foreground">Leave, learning, and internal mobility measures.</p></div><div className="grid gap-3 md:grid-cols-3"><Programme href="/time-off" label="Leaves" metric={`${new Set(data.leave.currentlyAway.map((row) => row.employee_id)).size} away today`} detail={`${data.leave.pending} pending requests · ${data.leave.totalDays} approved days`}/><Programme href="/learning" label="Assign Courses" metric={`${data.training.completionRate}% complete`} detail={`${data.training.requiringMandatoryTraining} mandatory gaps · ${data.training.totalHours} assigned hours`}/><Programme href="/people?tenure=mobility" label="Internal mobility" metric={`${data.promotions.rate}% promotion rate`} detail={`${data.promotions.total} promotions · ${data.promotions.withoutPromotionOver36Months} employees due for review`}/></div></section>

  </div>
}

function Programme({ href, label, metric, detail }: { href: string; label: string; metric: string; detail: string }) {
  return <Link href={href} className="rounded-md border border-border bg-card p-4 transition-colors hover:bg-muted/25"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-base font-semibold">{metric}</p><p className="mt-1 text-meta text-muted-foreground">{detail}</p></Link>
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-meta font-medium text-muted-foreground">{label}<span className="mt-1 block [&_input]:h-9 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:text-xs [&_input]:font-normal [&_select]:h-9 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:text-xs [&_select]:font-normal">{children}</span></label>
}
