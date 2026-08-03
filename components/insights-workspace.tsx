"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Download } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { BreakdownPoint, TimePoint, WorkforceAnalytics } from "@/lib/hr-types"
import { cn } from "@/lib/utils"
import { MetricStrip, WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"

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
  netMovement: number
  openRoles: number
  leaveDaysPerEmployee: number
  trainingHours: number
  mobilityReviews: number
  coverageStatus: "Gap" | "Watch" | "Covered"
}

function rollingYear(): Pick<Filters, "from" | "to"> {
  const end = new Date()
  const start = new Date(end)
  start.setUTCFullYear(start.getUTCFullYear() - 1)
  start.setUTCDate(start.getUTCDate() + 1)
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

function initialFilters(searchParams: URLSearchParams): Filters {
  const fallback = rollingYear()
  const period = searchParams.get("period")
  return {
    from: searchParams.get("from") ?? fallback.from,
    to: searchParams.get("to") ?? fallback.to,
    department: searchParams.get("department") ?? "",
    location: searchParams.get("location") ?? "",
    period: period === "month" || period === "year" ? period : "quarter",
  }
}

function queryFor(filters: Filters): string {
  const params = new URLSearchParams({ dataMode: "all" })
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

function FlowTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-meta">
      <p className="font-semibold">{label}</p>
      {payload.map((item) => <p key={item.name} className="mt-1 text-muted-foreground"><span className="font-semibold" style={{ color: item.color }}>{item.value}</span> {item.name}</p>)}
    </div>
  )
}

function FlowChart({ rows }: { rows: ReturnType<typeof flowRows> }) {
  if (!rows.length) return <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-body text-muted-foreground">No hires or exits are recorded for this period.</div>
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 256 }}>
        <BarChart data={rows} margin={{ left: -20, right: 10, top: 8, bottom: 2 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <Tooltip content={<FlowTooltip />} />
          <Legend />
          <Bar dataKey="hires" name="Completed hires" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="exits" name="Recorded exits" fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function reviewSignal(row: DepartmentRow): { label: string; className: string } {
  if (row.coverageStatus === "Gap") return { label: "Hiring coverage gap", className: "text-destructive" }
  if (row.netMovement < 0) return { label: "Net workforce loss", className: "text-destructive" }
  if (row.mobilityReviews > 0) return { label: "Mobility review", className: "text-amber-700 dark:text-amber-300" }
  if (row.active > 0 && row.leaveDaysPerEmployee >= 4) return { label: "Leave coverage review", className: "text-sky-700 dark:text-sky-300" }
  return { label: "No exception", className: "text-muted-foreground" }
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-label font-semibold text-muted-foreground">
      {label}
      <span className="mt-1.5 block [&_input]:h-9 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:text-control [&_input]:font-normal [&_select]:h-9 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:text-control [&_select]:font-normal">
        {children}
      </span>
    </label>
  )
}

export function InsightsWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => initialFilters(searchParams))
  const [data, setData] = useState<WorkforceAnalytics | null>(null)
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [error, setError] = useState("")
  const requestQuery = useMemo(() => queryFor(filters), [filters])
  const reportingHref = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
    return `/insights?${params.toString()}`
  }, [filters])
  const loading = requestQuery !== loadedQuery

  useEffect(() => {
    const current = `/insights${searchParams.size ? `?${searchParams.toString()}` : ""}`
    if (current !== reportingHref) router.replace(reportingHref, { scroll: false })
  }, [reportingHref, router, searchParams])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/v1/workforce?${requestQuery}`, { cache: "no-store", signal: controller.signal })
      .then(async (workforceResponse) => {
        if (!workforceResponse.ok) throw new Error("Workforce insights could not be loaded.")
        return workforceResponse.json() as Promise<WorkforceAnalytics>
      })
      .then((workforce) => {
        setData(workforce)
        setLoadedQuery(requestQuery)
        setError("")
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") {
          setError(reason instanceof Error ? reason.message : "Workforce insights could not be loaded.")
          setLoadedQuery(requestQuery)
        }
      })
    return () => controller.abort()
  }, [requestQuery])

  if (!data && loading) return <div className="space-y-4"><div className="h-28 animate-pulse rounded-md bg-muted" /><div className="h-96 animate-pulse rounded-md bg-muted" /></div>
  if (!data) return <Card><CardContent className="p-6 text-body text-destructive">{error || "Workforce insights could not be loaded."}</CardContent></Card>

  const netMovement = data.hiring.totalHired - data.attrition.totalExits
  const flow = flowRows(data.hiring.trend, data.attrition.trend)
  const active = valueMap(data.employeeAnalytics.activeByDepartment)
  const hires = valueMap(data.hiring.byDepartment)
  const exits = valueMap(data.attrition.byDepartment)
  const leave = valueMap(data.leave.byDepartment)
  const learning = valueMap(data.training.byDepartment)
  const coverage = new Map(data.operatingSignals.replacementCoverage.map((row) => [row.department, row]))
  const departments = [...new Set([...active.keys(), ...hires.keys(), ...exits.keys(), ...leave.keys(), ...learning.keys(), ...coverage.keys()])]
  const departmentRows: DepartmentRow[] = departments.map((department) => {
    const activeEmployees = active.get(department) ?? 0
    const departmentHires = hires.get(department) ?? 0
    const departmentExits = exits.get(department) ?? 0
    const movement = coverage.get(department)
    return {
      department,
      active: activeEmployees,
      hires: departmentHires,
      exits: departmentExits,
      netMovement: movement?.netMovement ?? departmentHires - departmentExits,
      openRoles: movement?.openRequisitions ?? 0,
      leaveDaysPerEmployee: activeEmployees ? Number(((leave.get(department) ?? 0) / activeEmployees).toFixed(1)) : 0,
      trainingHours: learning.get(department) ?? 0,
      mobilityReviews: movement?.mobilityReviewCount ?? 0,
      coverageStatus: movement?.status ?? "Covered",
    }
  }).sort((left, right) => {
    const leftException = reviewSignal(left).label === "No exception" ? 0 : 1
    const rightException = reviewSignal(right).label === "No exception" ? 0 : 1
    return rightException - leftException || right.active - left.active || left.department.localeCompare(right.department)
  })
  const topExitDepartment = data.attrition.byDepartment[0]
  const coverageGaps = departmentRows.filter((row) => row.coverageStatus === "Gap").length
  const analysisSummary = [
    { label: "Workforce movement", finding: `${data.hiring.totalHired} hires and ${data.attrition.totalExits} exits produced net movement of ${netMovement > 0 ? "+" : ""}${netMovement}.` },
    { label: "Exit concentration", finding: topExitDepartment ? `${topExitDepartment.label} has the highest recorded exit volume with ${topExitDepartment.value}.` : "No recorded exits in this scope." },
    { label: "Replacement coverage", finding: coverageGaps ? `${coverageGaps} department${coverageGaps === 1 ? " has" : "s have"} a replacement coverage gap.` : "No department replacement coverage gaps are recorded." },
  ]

  return (
    <WorkspacePage>
      <WorkspaceHeader title="Insights" description="Workforce movement by period and department." meta={<>{filters.from} to {filters.to}</>} actions={<>
          <a href={`/api/v1/reports?format=pdf&${requestQuery}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-control hover:bg-muted"><Download className="size-3.5" />PDF summary</a>
          <a href={`/api/v1/reports?format=xlsx&${requestQuery}`} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-control text-primary-foreground hover:bg-primary/80"><Download className="size-3.5" />Export data</a>
        </>}/>

      <Card className="gap-4 p-4 shadow-none">
        <div className="flex items-center justify-between"><p className="text-card-title font-semibold">Reporting scope</p><Button size="sm" variant="ghost" onClick={() => setFilters({ ...rollingYear(), department: "", location: "", period: "quarter" })}>Reset</Button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Filter label="From"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></Filter>
          <Filter label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></Filter>
          <Filter label="Department"><select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select></Filter>
          <Filter label="Location"><select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}><option value="">All locations</option>{data.dimensions.locations.map((item) => <option key={item}>{item}</option>)}</select></Filter>
          <Filter label="Interval"><select value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value as Filters["period"] })}><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></Filter>
        </div>
        {loading && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse rounded-full bg-primary" /></div>}
      </Card>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-meta text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">{error}</div>}

      <MetricStrip metrics={[
          { label: "Active employees", value: compact(data.kpis.activeEmployees), detail: `${data.employeeAnalytics.onLeave} on leave` },
          { label: "Hires", value: compact(data.hiring.totalHired), detail: "Completed" },
          { label: "Exits", value: compact(data.attrition.totalExits), detail: `${data.attrition.voluntary} voluntary` },
          { label: "Net movement", value: `${netMovement > 0 ? "+" : ""}${compact(netMovement)}`, detail: "Hires less exits" },
        ]}/>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card className="shadow-none"><CardHeader><CardTitle>Joiners and leavers</CardTitle><CardDescription>Completed hires and recorded exits in the selected date range, grouped by {data.filters.period}. Open requisitions are excluded.</CardDescription></CardHeader><CardContent><FlowChart rows={flow} /></CardContent></Card>
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <CardHeader className="border-b border-border px-5 py-4"><CardTitle>Analysis summary</CardTitle><CardDescription>Calculated from the selected records.</CardDescription></CardHeader>
          <CardContent className="divide-y divide-border p-0">{analysisSummary.map((item) => <div key={item.label} className="px-5 py-4"><p className="text-label font-semibold text-muted-foreground">{item.label}</p><p className="mt-1 text-body">{item.finding}</p></div>)}</CardContent>
        </Card>
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardHeader className="border-b border-border px-5 py-4"><CardTitle>Department review</CardTitle><CardDescription>Current headcount and selected-period movement.</CardDescription></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-body">
              <thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Department", "Active", "Net movement", "Open roles", "Leave days / employee", "Learning hours", "Review"].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead>
              <tbody>{departmentRows.map((row) => { const signal = reviewSignal(row); return <tr key={row.department} className="border-t border-border/70 hover:bg-muted/20"><td className="px-4 py-3"><button type="button" onClick={() => setFilters({ ...filters, department: row.department })} className="font-semibold hover:text-primary hover:underline">{row.department}</button></td><td className="px-4 py-3 tabular-nums">{row.active}</td><td className={cn("px-4 py-3 font-semibold tabular-nums", row.netMovement < 0 && "text-destructive")}>{row.netMovement > 0 ? "+" : ""}{row.netMovement}</td><td className="px-4 py-3 tabular-nums">{row.openRoles}</td><td className="px-4 py-3 tabular-nums">{row.leaveDaysPerEmployee}</td><td className="px-4 py-3 tabular-nums">{row.trainingHours}</td><td className="px-4 py-3"><span className={cn("text-status font-semibold", signal.className)}>{signal.label}</span></td></tr>})}</tbody>
            </table>
          </div>
          {!departmentRows.length && <p className="p-10 text-center text-body text-muted-foreground">No departments match the selected reporting scope.</p>}
          <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground">Select a department to filter the report.</div>
        </CardContent>
      </Card>
    </WorkspacePage>
  )
}
