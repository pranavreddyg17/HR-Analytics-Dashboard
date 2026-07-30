"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
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
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  Database,
  FilterX,
  MapPin,
  Plus,
  Search,
  Sparkles,
  UserCheck,
  UsersRound,
} from "lucide-react"

import { apiBaseUrl } from "@/lib/api"
import type { BreakdownPoint, HiringRecord, TimePoint, WorkforceAnalytics } from "@/lib/hr-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Filters = { from: string; to: string; department: string; jobTitle: string; location: string; period: "month" | "quarter" | "year" }
const emptyFilters: Filters = { from: "", to: "", department: "", jobTitle: "", location: "", period: "month" }

function queryFor(filters: Filters): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
  return params.toString()
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(`${value}T00:00:00`)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date) : value
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === "hired") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
  if (normalized === "offer") return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
  if (normalized === "requested") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
  if (normalized === "open") return "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
  return "bg-muted text-muted-foreground"
}

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof BriefcaseBusiness; tone: string }) {
  return (
    <Card className="gap-3 border-0 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.04)] ring-1 ring-foreground/8">
      <div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><span className={cn("flex size-9 items-center justify-center rounded-xl", tone)}><Icon className="size-4" /></span></div>
      <div><p className="text-2xl font-bold tracking-[-0.04em] tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div>
    </Card>
  )
}

function HiringTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl"><p className="font-semibold">{label}</p>{payload.map((item) => <p key={item.name} className="mt-1 text-muted-foreground"><span className="text-primary">{item.value}</span> {item.name?.toLowerCase()}</p>)}</div>
}

function TrendChart({ data, name, color = "var(--chart-1)" }: { data: TimePoint[]; name: string; color?: string }) {
  if (!data.length) return <EmptyChart />
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -22, right: 8, top: 8, bottom: 2 }}>
          <defs><linearGradient id={`hiring-${name.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.3}/><stop offset="95%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <Tooltip content={<HiringTooltip />} />
          <Area type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2.5} fill={`url(#hiring-${name.replace(/\W/g, "")})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function BarBreakdown({ data, name, onSelect }: { data: BreakdownPoint[]; name: string; onSelect?: (label: string) => void }) {
  if (!data.length) return <EmptyChart />
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ left: 32, right: 14, top: 4, bottom: 2 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
          <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <YAxis type="category" dataKey="label" width={110} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <Tooltip content={<HiringTooltip />} />
          <Bar dataKey="value" name={name} fill="var(--chart-1)" radius={[0, 6, 6, 0]} cursor={onSelect ? "pointer" : "default"} onClick={(entry) => {
            const item = entry as unknown as { label?: string; payload?: { label?: string } }
            const label = item.label ?? item.payload?.label
            if (label && onSelect) onSelect(label)
          }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function EmptyChart() {
  return <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No database records match these filters.</div>
}

function Pipeline({ statuses }: { statuses: BreakdownPoint[] }) {
  const total = statuses.reduce((sum, item) => sum + item.value, 0)
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {statuses.map((item) => (
        <div key={item.label} className="rounded-xl border border-border/70 bg-muted/25 p-3">
          <div className="flex items-center justify-between gap-2"><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide", statusTone(item.label))}>{item.label}</span><span className="text-lg font-bold tabular-nums">{item.value}</span></div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${total ? Math.max(5, (item.value / total) * 100) : 0}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

function HiringRecords({ rows }: { rows: HiringRecord[] }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const statuses = useMemo(() => [...new Set(rows.map((row) => row.recruitment_status))].sort(), [rows])
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return rows.filter((row) => (!status || row.recruitment_status === status) && (!normalized || [row.id, row.position, row.department, row.location, row.hiring_source].some((value) => value.toLowerCase().includes(normalized))))
  }, [query, rows, status])

  return (
    <Card className="gap-0 overflow-hidden border-0 py-0 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)] ring-1 ring-foreground/8">
      <CardHeader className="gap-4 border-b border-border/70 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div><CardTitle>Requisitions and hires</CardTitle><CardDescription>Every row below is read from the workspace hiring table</CardDescription></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records…" className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring/30 sm:w-56" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-xs outline-none"><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur"><tr>{["Role", "Department", "Opened", "Location", "Source", "Time to hire", "Status", "Data"].map((heading) => <th key={heading} className="px-4 py-3 font-semibold text-muted-foreground">{heading}</th>)}</tr></thead>
            <tbody>{visible.map((row) => <tr key={row.id} className="border-t border-border/60 transition hover:bg-muted/25">
              <td className="px-4 py-3"><p className="font-semibold">{row.position}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{row.id}</p></td>
              <td className="px-4 py-3">{row.department}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(row.application_date)}</td><td className="px-4 py-3">{row.location}</td><td className="px-4 py-3">{row.hiring_source}</td>
              <td className="px-4 py-3 tabular-nums">{row.time_to_hire_days === null ? "—" : `${row.time_to_hire_days} days`}</td>
              <td className="px-4 py-3"><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide", statusTone(row.recruitment_status))}>{row.recruitment_status}</span></td>
              <td className="px-4 py-3"><span className="rounded-full border border-border px-2 py-1 text-[9px] font-semibold capitalize text-muted-foreground">{row.data_source === "demo" ? "sample" : row.data_source}</span></td>
            </tr>)}</tbody>
          </table>
          {!visible.length && <div className="p-10 text-center text-sm text-muted-foreground">No hiring records match your search.</div>}
        </div>
        <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-[10px] text-muted-foreground">Showing {visible.length} of {rows.length} filtered database records</div>
      </CardContent>
    </Card>
  )
}

export function HiringWorkspace({ canRequestHiring }: { canRequestHiring: boolean }) {
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [data, setData] = useState<WorkforceAnalytics | null>(null)
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [error, setError] = useState("")
  const query = useMemo(() => queryFor(filters), [filters])
  const loading = loadedQuery !== query

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/api/v1/workforce?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Hiring data could not be loaded."); return response.json() as Promise<WorkforceAnalytics> })
      .then((result) => { setData(result); setError(""); setLoadedQuery(query) })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") { setError(reason instanceof Error ? reason.message : "Hiring data could not be loaded."); setLoadedQuery(query) } })
    return () => controller.abort()
  }, [query])

  if (!data && loading) return <div className="space-y-4"><div className="h-40 animate-pulse rounded-2xl bg-muted"/><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-muted" />)}</div></div>
  if (!data) return <Card><CardContent className="p-6 text-sm text-destructive">{error || "Hiring data could not be loaded."}</CardContent></Card>

  const hiringStatus = data.status.find((item) => item.domain === "hiring")
  const dataLabel = hiringStatus?.mode === "demo" ? "Sample hiring dataset" : hiringStatus?.mode === "mixed" ? "Live workflows + sample records" : hiringStatus?.mode === "empty" ? "No hiring records" : "Live workspace data"
  const topSource = data.hiring.sourceStats[0]

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 pb-10">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-slate-800 bg-[#0d1424] px-5 py-6 text-white shadow-[0_18px_60px_rgba(15,23,42,0.14)] sm:px-7">
        <div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300"><BriefcaseBusiness className="size-3.5"/>Hiring workspace</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.05em] sm:text-4xl">Recruiting, without the spreadsheet chase.</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">Move requisitions forward and understand hiring velocity from the same records stored in your HR database.</p></div>
          <div className="flex flex-wrap gap-2"><Button nativeButton={false} variant="outline" className="border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white" render={<Link href="/inbox?type=hiring"/>}>Review approvals <ArrowRight className="size-4"/></Button>{canRequestHiring && <Button nativeButton={false} className="bg-sky-300 text-slate-950 hover:bg-sky-200" render={<Link href="/inbox?new=hiring"/>}><Plus className="size-4"/>New requisition</Button>}</div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-800 pt-4 text-[10px] text-slate-400"><span className="inline-flex items-center gap-1.5"><Database className="size-3.5 text-sky-300"/>{dataLabel}</span><span>{hiringStatus?.count ?? 0} database records</span><span>Updated {new Date(data.generatedAt).toLocaleString()}</span></div>
      </section>

      <Card className="gap-4 border-0 p-4 shadow-sm ring-1 ring-foreground/8 sm:p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Report filters</p><p className="text-[11px] text-muted-foreground">Every KPI, chart, and row updates together</p></div><Button size="sm" variant="ghost" onClick={() => setFilters(emptyFilters)}><FilterX className="size-4"/>Reset</Button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Filter label="From"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })}/></Filter>
          <Filter label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })}/></Filter>
          <Filter label="Department"><select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select></Filter>
          <Filter label="Role"><select value={filters.jobTitle} onChange={(event) => setFilters({ ...filters, jobTitle: event.target.value })}><option value="">All roles</option>{data.dimensions.jobTitles.map((item) => <option key={item}>{item}</option>)}</select></Filter>
          <Filter label="Location"><select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}><option value="">All locations</option>{data.dimensions.locations.map((item) => <option key={item}>{item}</option>)}</select></Filter>
          <Filter label="Group trend"><select value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value as Filters["period"] })}><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></Filter>
        </div>
        {loading && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse rounded-full bg-sky-500"/></div>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active requisitions" value={data.hiring.activeRequisitions.toLocaleString()} detail={`${data.hiring.offers} currently at offer`} icon={BriefcaseBusiness} tone="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" />
        <Metric label="Completed hires" value={data.hiring.totalHired.toLocaleString()} detail="Within the selected date range" icon={UserCheck} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" />
        <Metric label="Average time to hire" value={`${data.hiring.averageTimeToHire.toLocaleString()}d`} detail="Completed hires with recorded duration" icon={Clock3} tone="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" />
        <Metric label="Best-performing source" value={topSource?.label ?? "—"} detail={topSource ? `${topSource.hires} hires · ${topSource.averageDays}d average` : "No completed hires in this view"} icon={Sparkles} tone="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" />
      </div>

      <Card className="gap-4 border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Pipeline health</CardTitle><CardDescription>Current distribution of every filtered hiring record</CardDescription></CardHeader><CardContent><Pipeline statuses={data.hiring.statuses}/></CardContent></Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Hiring velocity</CardTitle><CardDescription>Completed hires grouped {data.filters.period} from D1 hiring dates</CardDescription></CardHeader><CardContent><TrendChart data={data.hiring.trend} name="Hires"/></CardContent></Card>
        <Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Requisition volume</CardTitle><CardDescription>Roles opened grouped {data.filters.period} from D1 application dates</CardDescription></CardHeader><CardContent><TrendChart data={data.hiring.requisitionTrend} name="Requisitions" color="var(--chart-2)"/></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Active demand by department</CardTitle><CardDescription>Click a department to filter this workspace</CardDescription></CardHeader><CardContent><BarBreakdown data={data.hiring.pipelineByDepartment} name="Open roles" onSelect={(department) => setFilters({ ...filters, department })}/></CardContent></Card>
        <Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Source performance</CardTitle><CardDescription>Completed hires and average hiring speed</CardDescription></CardHeader><CardContent className="space-y-2">{data.hiring.sourceStats.length ? data.hiring.sourceStats.slice(0, 8).map((source, index) => <div key={source.label} className="flex items-center gap-3 rounded-xl border border-border/70 p-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{source.label}</p><p className="text-[10px] text-muted-foreground">{source.hires} completed hire{source.hires === 1 ? "" : "s"}</p></div><div className="text-right"><p className="text-sm font-bold tabular-nums">{source.averageDays}d</p><p className="text-[9px] text-muted-foreground">average</p></div></div>) : <EmptyChart/>}</CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Completed hires by role</CardTitle><CardDescription>Roles filled in the selected range</CardDescription></CardHeader><CardContent><BarBreakdown data={data.hiring.byRole} name="Hires"/></CardContent></Card>
        <Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Hiring footprint</CardTitle><CardDescription>All filtered records by workplace location</CardDescription></CardHeader><CardContent><BarBreakdown data={data.hiring.byLocation} name="Records"/></CardContent></Card>
      </div>

      <HiringRecords rows={data.hiring.rows}/>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/25 p-4 text-xs text-muted-foreground sm:flex-row sm:items-center"><Database className="size-4 shrink-0 text-primary"/><p className="flex-1">This page has no hard-coded chart values. Metrics, charts, pipeline stages, and records are generated from the persisted hiring table using the active filters.</p><Link href="/data" className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary">Manage hiring data <ArrowRight className="size-3.5"/></Link></div>
    </div>
  )
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}<span className="mt-1 block [&_input]:h-9 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:text-xs [&_input]:font-normal [&_input]:normal-case [&_input]:tracking-normal [&_select]:h-9 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:text-xs [&_select]:font-normal [&_select]:normal-case [&_select]:tracking-normal">{children}</span></label>
}
