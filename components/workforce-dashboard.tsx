"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AlertTriangle, ArrowRight, Bot, Building2, CalendarDays, Download, FilterX, GraduationCap, MapPin, TrendingDown, UserPlus, Users } from "lucide-react"

import type { BreakdownPoint, TimePoint, WorkforceAnalytics } from "@/lib/hr-types"
import { apiBaseUrl } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type AnalyticsView = "executive" | "employees" | "hiring" | "attrition" | "leave" | "training" | "promotions"
type View = AnalyticsView
type Filters = { from: string; to: string; department: string; jobTitle: string; location: string; period: "month" | "quarter" | "year" }

const initialFilters: Filters = { from: "", to: "", department: "", jobTitle: "", location: "", period: "month" }

const views: Array<{ id: View; label: string }> = [
  { id: "executive", label: "Executive" },
  { id: "employees", label: "Employees" },
  { id: "hiring", label: "Hiring" },
  { id: "attrition", label: "Attrition" },
  { id: "leave", label: "Leave" },
  { id: "training", label: "Training" },
  { id: "promotions", label: "Promotions" },
]

function queryFor(filters: Filters): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
  return params.toString()
}

function number(value: number, suffix = ""): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}${suffix}`
}

function Metric({ label, value, hint, icon: Icon, tone = "primary" }: { label: string; value: string; hint: string; icon: typeof Users; tone?: "primary" | "warning" | "success" }) {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", tone === "warning" ? "bg-warning/10 text-warning" : tone === "success" ? "bg-success/10 text-success" : "bg-primary/10 text-primary")}><Icon className="size-4" /></span>
      </div>
      <div>
        <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
    </Card>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; name?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-xl"><p className="font-medium">{label}</p><p className="mt-1 text-primary">{payload[0].name}: {payload[0].value}</p></div>
}

function TrendChart({ data, label }: { data: TimePoint[]; label: string }) {
  if (!data.length) return <EmptyChart />
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 4 }}>
          <defs><linearGradient id={`fill-${label.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.32}/><stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="value" name={label} stroke="var(--chart-1)" strokeWidth={2} fill={`url(#fill-${label.replace(/\W/g, "")})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function BreakdownChart({ data, label, onSelectDepartment }: { data: BreakdownPoint[]; label: string; onSelectDepartment?: (department: string) => void }) {
  if (!data.length) return <EmptyChart />
  const rows = data.slice(0, 8)
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 28, right: 12, top: 6, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={104} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="value" name={label} fill="var(--chart-1)" radius={[0, 4, 4, 0]} cursor={onSelectDepartment ? "pointer" : "default"} onClick={(entry) => {
            const item = entry as unknown as { label?: string; payload?: { label?: string } }
            const selected = item.label ?? item.payload?.label
            if (selected && onSelectDepartment) onSelectDepartment(selected)
          }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function EmptyChart() {
  return <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">No records match these filters.</div>
}

function DataTable({ rows, columns }: { rows: Array<Record<string, unknown>>; columns: Array<{ key: string; label: string }> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="sticky top-0 bg-muted"><tr>{columns.map((column) => <th key={column.key} className="px-3 py-2.5 font-medium text-muted-foreground">{column.label}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 60).map((row, index) => <tr key={String(row.id ?? row.employee_id ?? index)} className="border-t border-border/70 hover:bg-muted/30">{columns.map((column) => <td key={column.key} className="max-w-56 truncate px-3 py-2.5">{row[column.key] === null ? "—" : String(row[column.key] ?? "—")}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="border-t border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">Showing {Math.min(rows.length, 60)} of {rows.length} filtered rows</div>
    </div>
  )
}

function DomainView({ view, data, setDepartment }: { view: Exclude<View, "executive">; data: WorkforceAnalytics; setDepartment: (value: string) => void }) {
  if (view === "employees") return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active employees" value={number(data.employeeAnalytics.active)} hint={`${data.employeeAnalytics.total} total profiles`} icon={Users} tone="success"/><Metric label="On leave" value={number(data.employeeAnalytics.onLeave)} hint="Current employment status" icon={CalendarDays}/><Metric label="Preboarding" value={number(data.employeeAnalytics.preboarding)} hint="Joining workforce soon" icon={UserPlus}/><Metric label="Locations" value={number(data.employeeAnalytics.byLocation.length)} hint="Active workforce footprint" icon={MapPin}/></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Headcount by department</CardTitle><CardDescription>Click a team to update every dashboard view</CardDescription></CardHeader><CardContent><BreakdownChart data={data.employeeAnalytics.byDepartment} label="Employees" onSelectDepartment={setDepartment}/></CardContent></Card><Card><CardHeader><CardTitle>Workforce status</CardTitle><CardDescription>Active, on leave, preboarding, and terminated profiles</CardDescription></CardHeader><CardContent><BreakdownChart data={data.employeeAnalytics.byStatus} label="Employees"/></CardContent></Card></div>
    <div className="grid gap-4 xl:grid-cols-3"><Card><CardHeader><CardTitle>Tenure mix</CardTitle></CardHeader><CardContent><BreakdownChart data={data.employeeAnalytics.byTenure} label="Employees"/></CardContent></Card><Card><CardHeader><CardTitle>Employment type</CardTitle></CardHeader><CardContent><BreakdownChart data={data.employeeAnalytics.byEmploymentType} label="Employees"/></CardContent></Card><Card><CardHeader><CardTitle>Manager span</CardTitle><CardDescription>Largest direct-report groups</CardDescription></CardHeader><CardContent><BreakdownChart data={data.employeeAnalytics.managerSpan} label="Reports"/></CardContent></Card></div>
    <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Employee drill-down</CardTitle><CardDescription>Open People for profiles, history, and lifecycle actions</CardDescription></div><Button nativeButton={false} variant="outline" size="sm" render={<Link href="/people"/>}>Manage people <ArrowRight className="size-3.5"/></Button></div></CardHeader><CardContent><DataTable rows={data.employeeAnalytics.rows as unknown as Array<Record<string, unknown>>} columns={[{key:"employee_id",label:"Employee ID"},{key:"first_name",label:"First name"},{key:"last_name",label:"Last name"},{key:"job_title",label:"Job title"},{key:"department",label:"Department"},{key:"location",label:"Location"},{key:"employment_status",label:"Status"},{key:"tenure_years",label:"Tenure"}]}/></CardContent></Card>
  </>
  if (view === "hiring") return <>
    <div className="grid gap-4 md:grid-cols-4"><Metric label="Completed hires" value={number(data.hiring.totalHired)} hint="Selected period" icon={UserPlus}/><Metric label="Time to hire" value={number(data.hiring.averageTimeToHire, " days")} hint="Average for completed hires" icon={CalendarDays}/><Metric label="Open requisitions" value={number(data.hiring.statuses.find((item) => item.label === "Open")?.value ?? 0)} hint="Current filtered pipeline" icon={Building2} tone="warning"/><Metric label="Top source" value={data.hiring.bySource[0]?.label ?? "—"} hint={`${data.hiring.bySource[0]?.value ?? 0} hires`} icon={UserPlus} tone="success"/></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Hiring trend</CardTitle><CardDescription>Completed hires by {data.filters.period}</CardDescription></CardHeader><CardContent><TrendChart data={data.hiring.trend} label="Hires"/></CardContent></Card><Card><CardHeader><CardTitle>Hiring by department</CardTitle><CardDescription>Click a bar to cross-filter the dashboard</CardDescription></CardHeader><CardContent><BreakdownChart data={data.hiring.byDepartment} label="Hires" onSelectDepartment={setDepartment}/></CardContent></Card></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Recruitment sources</CardTitle></CardHeader><CardContent><BreakdownChart data={data.hiring.bySource} label="Hires"/></CardContent></Card><Card><CardHeader><CardTitle>Hiring by role</CardTitle></CardHeader><CardContent><BreakdownChart data={data.hiring.byRole} label="Hires"/></CardContent></Card></div>
    <Card><CardHeader><CardTitle>Hiring drill-down</CardTitle><CardDescription>Filtered requisition and hire records</CardDescription></CardHeader><CardContent><DataTable rows={data.hiring.rows as unknown as Array<Record<string, unknown>>} columns={[{key:"id",label:"ID"},{key:"position",label:"Position"},{key:"department",label:"Department"},{key:"hiring_date",label:"Hire date"},{key:"hiring_source",label:"Source"},{key:"time_to_hire_days",label:"Days"},{key:"recruitment_status",label:"Status"}]}/></CardContent></Card>
  </>
  if (view === "attrition") return <>
    <div className="grid gap-4 md:grid-cols-4"><Metric label="Attrition rate" value={number(data.attrition.rate, "%")} hint="Exits ÷ active plus exits" icon={TrendingDown} tone="warning"/><Metric label="Total exits" value={number(data.attrition.totalExits)} hint="Selected period" icon={Users}/><Metric label="Voluntary" value={number(data.attrition.voluntary)} hint="Employee-initiated exits" icon={ArrowRight}/><Metric label="High-risk review" value={number(data.attrition.highRiskEmployees.length)} hint="Historical ML worklist" icon={AlertTriangle} tone="warning"/></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Attrition trend</CardTitle><CardDescription>Recorded exits by {data.filters.period}</CardDescription></CardHeader><CardContent><TrendChart data={data.attrition.trend} label="Exits"/></CardContent></Card><Card><CardHeader><CardTitle>Attrition by department</CardTitle><CardDescription>Click a bar to cross-filter</CardDescription></CardHeader><CardContent><BreakdownChart data={data.attrition.byDepartment} label="Exits" onSelectDepartment={setDepartment}/></CardContent></Card></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Attrition by tenure</CardTitle></CardHeader><CardContent><BreakdownChart data={data.attrition.byTenure} label="Exits"/></CardContent></Card><Card><CardHeader><CardTitle>High-risk human review</CardTitle><CardDescription>Validated historical model; never an automated decision</CardDescription></CardHeader><CardContent className="space-y-2">{data.attrition.highRiskEmployees.slice(0,6).map((item)=><div key={item.id} className="flex items-center gap-3 rounded-lg bg-muted/40 p-2.5"><span className="flex-1 text-sm"><b>{item.id}</b><span className="ml-2 text-xs text-muted-foreground">{item.department} · {item.role}</span></span><span className="font-mono text-sm text-warning">{item.riskScore.toFixed(1)}%</span></div>)}</CardContent></Card></div>
    <Card><CardHeader><CardTitle>Exit drill-down</CardTitle></CardHeader><CardContent><DataTable rows={data.attrition.rows as unknown as Array<Record<string, unknown>>} columns={[{key:"employee_id",label:"Employee"},{key:"exit_date",label:"Exit date"},{key:"exit_reason",label:"Reason"},{key:"exit_type",label:"Type"},{key:"department",label:"Department"},{key:"tenure_years",label:"Tenure"}]}/></CardContent></Card>
  </>
  if (view === "leave") return <>
    <div className="grid gap-4 md:grid-cols-4"><Metric label="Approved leave" value={number(data.leave.totalDays, " days")} hint="Selected period" icon={CalendarDays}/><Metric label="Average per employee" value={number(data.leave.averageDaysPerEmployee, " days")} hint="Employees with approved leave" icon={Users}/><Metric label="Pending requests" value={number(data.leave.pending)} hint="Awaiting approval" icon={AlertTriangle} tone="warning"/><Metric label="Approved requests" value={number(data.leave.approved)} hint="Filtered records" icon={CalendarDays} tone="success"/></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Leave trend</CardTitle><CardDescription>Approved leave days by {data.filters.period}</CardDescription></CardHeader><CardContent><TrendChart data={data.leave.trend} label="Days"/></CardContent></Card><Card><CardHeader><CardTitle>Department leave patterns</CardTitle><CardDescription>Click a bar to cross-filter</CardDescription></CardHeader><CardContent><BreakdownChart data={data.leave.byDepartment} label="Days" onSelectDepartment={setDepartment}/></CardContent></Card></div>
    <Card><CardHeader><CardTitle>Leave by type</CardTitle><CardDescription>Approved days, not an employee performance signal</CardDescription></CardHeader><CardContent><BreakdownChart data={data.leave.byType} label="Days"/></CardContent></Card>
    <Card><CardHeader><CardTitle>Leave drill-down</CardTitle></CardHeader><CardContent><DataTable rows={data.leave.rows as unknown as Array<Record<string, unknown>>} columns={[{key:"employee_id",label:"Employee"},{key:"leave_type",label:"Type"},{key:"start_date",label:"Start"},{key:"end_date",label:"End"},{key:"leave_days",label:"Days"},{key:"approval_status",label:"Status"},{key:"department",label:"Department"}]}/></CardContent></Card>
  </>
  if (view === "training") return <>
    <div className="grid gap-4 md:grid-cols-4"><Metric label="Completion rate" value={number(data.training.completionRate, "%")} hint="Completed assignments" icon={GraduationCap} tone="success"/><Metric label="Training hours" value={number(data.training.totalHours)} hint="Assigned hours" icon={CalendarDays}/><Metric label="Average score" value={number(data.training.averageScore, "%")} hint="Completed assessments" icon={GraduationCap}/><Metric label="Mandatory gaps" value={number(data.training.requiringMandatoryTraining)} hint="Security or safety" icon={AlertTriangle} tone="warning"/></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Training completion trend</CardTitle><CardDescription>Completed hours by {data.filters.period}</CardDescription></CardHeader><CardContent><TrendChart data={data.training.trend} label="Hours"/></CardContent></Card><Card><CardHeader><CardTitle>Participation by department</CardTitle><CardDescription>Click a bar to cross-filter</CardDescription></CardHeader><CardContent><BreakdownChart data={data.training.byDepartment} label="Hours" onSelectDepartment={setDepartment}/></CardContent></Card></div>
    <Card><CardHeader><CardTitle>Programmes by assigned hours</CardTitle></CardHeader><CardContent><BreakdownChart data={data.training.byProgram} label="Hours"/></CardContent></Card>
    <Card><CardHeader><CardTitle>Training drill-down</CardTitle></CardHeader><CardContent><DataTable rows={data.training.rows as unknown as Array<Record<string, unknown>>} columns={[{key:"employee_id",label:"Employee"},{key:"training_program",label:"Programme"},{key:"completion_status",label:"Status"},{key:"completion_date",label:"Completed"},{key:"training_hours",label:"Hours"},{key:"assessment_score",label:"Score"},{key:"department",label:"Department"}]}/></CardContent></Card>
  </>
  return <>
    <div className="grid gap-4 md:grid-cols-4"><Metric label="Promotions" value={number(data.promotions.total)} hint="Selected period" icon={ArrowRight}/><Metric label="Promotion rate" value={number(data.promotions.rate, "%")} hint="Of active employees" icon={UserPlus} tone="success"/><Metric label="Time to promotion" value={number(data.promotions.averageMonthsToPromotion, " mo")} hint="Average since prior move" icon={CalendarDays}/><Metric label="No promotion 3+ years" value={number(data.promotions.withoutPromotionOver36Months)} hint="Review career paths and data" icon={AlertTriangle} tone="warning"/></div>
    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Promotion trend</CardTitle><CardDescription>Promotions by {data.filters.period}</CardDescription></CardHeader><CardContent><TrendChart data={data.promotions.trend} label="Promotions"/></CardContent></Card><Card><CardHeader><CardTitle>Promotions by department</CardTitle><CardDescription>Click a bar to cross-filter</CardDescription></CardHeader><CardContent><BreakdownChart data={data.promotions.byDepartment} label="Promotions" onSelectDepartment={setDepartment}/></CardContent></Card></div>
    <Card><CardHeader><CardTitle>Promotion drill-down</CardTitle></CardHeader><CardContent><DataTable rows={data.promotions.rows as unknown as Array<Record<string, unknown>>} columns={[{key:"employee_id",label:"Employee"},{key:"previous_title",label:"Previous title"},{key:"new_title",label:"New title"},{key:"promotion_date",label:"Date"},{key:"department",label:"Department"},{key:"months_since_previous_promotion",label:"Months"}]}/></CardContent></Card>
  </>
}

export function WorkforceDashboard({ initialView = "executive" }: { initialView?: View }) {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [view, setView] = useState<View>(initialView)
  const [data, setData] = useState<WorkforceAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const query = useMemo(() => queryFor(filters), [filters])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/api/v1/workforce?${query}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(`Analytics request failed (${response.status})`); return response.json() as Promise<WorkforceAnalytics> })
      .then((result) => { setData(result); setError("") })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Analytics unavailable") })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [query])

  if (!data && loading) return <div className="grid gap-4"><div className="h-24 animate-pulse rounded-xl bg-muted"/><div className="grid gap-4 md:grid-cols-4">{Array.from({length:4},(_,i)=><div key={i} className="h-32 animate-pulse rounded-xl bg-muted"/>)}</div></div>
  if (!data) return <Card><CardContent className="p-6 text-sm text-destructive">{error || "Analytics unavailable."}</CardContent></Card>
  const demoDomains = data.status.filter((item) => item.mode === "demo")

  return <div className="flex flex-col gap-5">
    {demoDomains.length > 0 && <div className="flex flex-col gap-3 rounded-xl border border-warning/25 bg-warning/5 p-4 sm:flex-row sm:items-center"><AlertTriangle className="size-5 shrink-0 text-warning"/><div className="flex-1"><p className="text-sm font-medium">Demo operational data is active</p><p className="text-xs text-muted-foreground">{demoDomains.map((item)=>item.domain).join(", ")} use clearly labelled sample records. The validated attrition model remains based on the original 1,470-row dataset.</p></div><Button nativeButton={false} variant="outline" size="sm" render={<Link href="/data"/>}>Import HR data <ArrowRight className="size-3.5"/></Button></div>}

    <Card className="gap-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-36 flex-1 text-xs text-muted-foreground">From<input type="date" value={filters.from} onChange={(event)=>setFilters({...filters,from:event.target.value})} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground"/></label>
        <label className="min-w-36 flex-1 text-xs text-muted-foreground">To<input type="date" value={filters.to} onChange={(event)=>setFilters({...filters,to:event.target.value})} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground"/></label>
        <label className="min-w-40 flex-1 text-xs text-muted-foreground">Department<select value={filters.department} onChange={(event)=>setFilters({...filters,department:event.target.value})} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground"><option value="">All departments</option>{data.dimensions.departments.map((item)=><option key={item}>{item}</option>)}</select></label>
        <label className="min-w-40 flex-1 text-xs text-muted-foreground">Job title<select value={filters.jobTitle} onChange={(event)=>setFilters({...filters,jobTitle:event.target.value})} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground"><option value="">All job titles</option>{data.dimensions.jobTitles.map((item)=><option key={item}>{item}</option>)}</select></label>
        <label className="min-w-36 flex-1 text-xs text-muted-foreground">Location<select value={filters.location} onChange={(event)=>setFilters({...filters,location:event.target.value})} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground"><option value="">All locations</option>{data.dimensions.locations.map((item)=><option key={item}>{item}</option>)}</select></label>
        <label className="min-w-28 text-xs text-muted-foreground">Trend<select value={filters.period} onChange={(event)=>setFilters({...filters,period:event.target.value as Filters["period"]})} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground"><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></label>
        <Button variant="ghost" size="sm" onClick={()=>setFilters(initialFilters)}><FilterX className="size-4"/>Clear</Button>
      </div>
    </Card>

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-1 gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">{views.map((item)=><button key={item.id} onClick={()=>{ setView(item.id); router.replace(`/insights?view=${item.id}`, { scroll: false }) }} className={cn("whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors",view===item.id?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-muted hover:text-foreground")}>{item.label}</button>)}</div>
      <div className="flex gap-2"><a href={`${apiBaseUrl}/api/v1/reports?format=pdf&${query}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-muted"><Download className="size-3.5"/>PDF</a><a href={`${apiBaseUrl}/api/v1/reports?format=xlsx&${query}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-muted"><Download className="size-3.5"/>Excel</a></div>
    </div>

    {error && <p className="text-xs text-destructive">{error}</p>}
    {loading && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse bg-primary"/></div>}

    {view === "executive" ? <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active employees" value={number(data.kpis.activeEmployees)} hint={`${data.kpis.totalEmployees} workforce records`} icon={Users}/><Metric label="Attrition rate" value={number(data.kpis.attritionRate,"%")} hint={`${data.attrition.totalExits} recorded exits`} icon={TrendingDown} tone="warning"/><Metric label="Training completion" value={number(data.kpis.trainingCompletionRate,"%")} hint={`${data.training.requiringMandatoryTraining} mandatory gaps`} icon={GraduationCap} tone="success"/><Metric label="Promotion rate" value={number(data.promotions.rate,"%")} hint={`${data.promotions.total} recorded promotions`} icon={UserPlus}/></div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]"><Card><CardHeader><CardTitle>Decision brief</CardTitle><CardDescription>Rule-grounded insights from the same filtered records used by every chart</CardDescription></CardHeader><CardContent className="space-y-3">{data.executiveInsights.map((insight,index)=><div key={index} className="flex gap-3 rounded-lg bg-muted/40 p-3"><span className="text-xs font-semibold text-primary">0{index+1}</span><p className="text-sm leading-relaxed">{insight}</p></div>)}<Button nativeButton={false} variant="outline" render={<Link href="/ai-agents"/>}><Bot className="size-4"/>Ask the MCP analytics agent</Button></CardContent></Card><Card><CardHeader><CardTitle>Data readiness</CardTitle><CardDescription>Imported records replace demo rows domain by domain</CardDescription></CardHeader><CardContent className="space-y-2">{data.status.map((item)=><div key={item.domain} className="flex items-center gap-3 rounded-lg border border-border/70 p-2.5"><span className={cn("size-2 rounded-full",item.mode==="imported"?"bg-success":item.mode==="demo"?"bg-warning":"bg-muted-foreground")}/><span className="flex-1 text-sm capitalize">{item.domain}</span><span className="text-xs font-semibold tabular-nums">{item.count}</span><span className="w-16 text-right text-[10px] uppercase text-muted-foreground">{item.mode}</span></div>)}</CardContent></Card></div>
      <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Hiring velocity</CardTitle><CardDescription>Completed hires by {data.filters.period}</CardDescription></CardHeader><CardContent><TrendChart data={data.hiring.trend} label="Hires"/></CardContent></Card><Card><CardHeader><CardTitle>Department attrition</CardTitle><CardDescription>Click a bar to cross-filter every view</CardDescription></CardHeader><CardContent><BreakdownChart data={data.attrition.byDepartment} label="Exits" onSelectDepartment={(department)=>setFilters({...filters,department})}/></CardContent></Card></div>
    </> : <DomainView view={view} data={data} setDepartment={(department)=>setFilters({...filters,department})}/>} 

    <p className="text-xs text-muted-foreground">Generated {new Date(data.generatedAt).toLocaleString()} · Chart clicks update the shared department filter · Exports use the active filters.</p>
  </div>
}
