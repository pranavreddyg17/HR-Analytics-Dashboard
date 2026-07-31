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
  FilterX,
  Plus,
  Search,
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
  if (normalized === "hired") return "text-emerald-700 dark:text-emerald-300"
  if (normalized === "offer") return "text-violet-700 dark:text-violet-300"
  if (normalized === "requested") return "text-amber-700 dark:text-amber-300"
  if (normalized === "open") return "text-sky-700 dark:text-sky-300"
  return "text-muted-foreground"
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="gap-2 p-4 shadow-none">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div><p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div>
    </Card>
  )
}

function HiringTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs"><p className="font-semibold">{label}</p>{payload.map((item) => <p key={item.name} className="mt-1 text-muted-foreground"><span className="text-primary">{item.value}</span> {item.name?.toLowerCase()}</p>)}</div>
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
  return <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">No database records match these filters.</div>
}

function Pipeline({ statuses }: { statuses: BreakdownPoint[] }) {
  const total = statuses.reduce((sum, item) => sum + item.value, 0)
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
      {statuses.map((item) => (
        <div key={item.label} className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2"><span className={cn("text-xs font-medium", statusTone(item.label))}>{item.label}</span><span className="text-lg font-semibold tabular-nums">{item.value}</span></div>
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
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="gap-4 border-b border-border/70 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div><CardTitle>Requisitions and hires</CardTitle><CardDescription>Hiring records for the selected filters</CardDescription></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records…" className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring/30 sm:w-56" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-xs outline-none"><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-muted"><tr>{["Role", "Department", "Opened", "Location", "Source", "Time to hire", "Status", "Data"].map((heading) => <th key={heading} className="px-4 py-3 font-semibold text-muted-foreground">{heading}</th>)}</tr></thead>
            <tbody>{visible.map((row) => <tr key={row.id} className="border-t border-border/60 transition hover:bg-muted/25">
              <td className="px-4 py-3"><p className="font-semibold">{row.position}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{row.id}</p></td>
              <td className="px-4 py-3">{row.department}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(row.application_date)}</td><td className="px-4 py-3">{row.location}</td><td className="px-4 py-3">{row.hiring_source}</td>
              <td className="px-4 py-3 tabular-nums">{row.time_to_hire_days === null ? "—" : `${row.time_to_hire_days} days`}</td>
              <td className="px-4 py-3"><span className={cn("text-[11px] font-medium", statusTone(row.recruitment_status))}>{row.recruitment_status}</span></td>
              <td className="px-4 py-3"><span className="text-[11px] capitalize text-muted-foreground">{row.data_source === "demo" ? "sample" : row.data_source}</span></td>
            </tr>)}</tbody>
          </table>
          {!visible.length && <div className="p-10 text-center text-sm text-muted-foreground">No hiring records match your search.</div>}
        </div>
        <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-[10px] text-muted-foreground">Showing {visible.length} of {rows.length} records</div>
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

  if (!data && loading) return <div className="space-y-4"><div className="h-40 animate-pulse rounded-lg bg-muted"/><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-lg bg-muted" />)}</div></div>
  if (!data) return <Card><CardContent className="p-6 text-sm text-destructive">{error || "Hiring data could not be loaded."}</CardContent></Card>

  const hiringStatus = data.status.find((item) => item.domain === "hiring")
  const dataLabel = hiringStatus?.mode === "demo" ? "Sample hiring dataset" : hiringStatus?.mode === "mixed" ? "Live workflows + sample records" : hiringStatus?.mode === "empty" ? "No hiring records" : "Live workspace data"
  const topSource = data.hiring.sourceStats[0]

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 pb-10">
      <header className="border-b border-border pb-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><h1 className="text-2xl font-semibold tracking-tight">Hiring</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Manage requisitions and review recruiting performance.</p></div>
          <div className="flex flex-wrap gap-2"><Button nativeButton={false} variant="outline" render={<Link href="/inbox?type=hiring"/>}>Review approvals</Button>{canRequestHiring && <Button nativeButton={false} render={<Link href="/inbox?new=hiring"/>}><Plus className="size-4"/>New requisition</Button>}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>{dataLabel}</span><span>{hiringStatus?.count ?? 0} records</span><span>Updated {new Date(data.generatedAt).toLocaleString()}</span></div>
      </header>

      <Card className="gap-4 p-4 shadow-none sm:p-5">
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Filters</p><Button size="sm" variant="ghost" onClick={() => setFilters(emptyFilters)}><FilterX className="size-4"/>Reset</Button></div>
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
        <Metric label="Active requisitions" value={data.hiring.activeRequisitions.toLocaleString()} detail={`${data.hiring.offers} currently at offer`} />
        <Metric label="Completed hires" value={data.hiring.totalHired.toLocaleString()} detail="Within the selected date range" />
        <Metric label="Average time to hire" value={`${data.hiring.averageTimeToHire.toLocaleString()}d`} detail="Completed hires with recorded duration" />
        <Metric label="Leading source" value={topSource?.label ?? "—"} detail={topSource ? `${topSource.hires} hires · ${topSource.averageDays}d average` : "No completed hires in this view"} />
      </div>

      <Card><CardHeader><CardTitle>Pipeline health</CardTitle><CardDescription>Current distribution of filtered hiring records</CardDescription></CardHeader><CardContent><Pipeline statuses={data.hiring.statuses}/></CardContent></Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="shadow-none"><CardHeader><CardTitle>Hiring velocity</CardTitle><CardDescription>Completed hires by {data.filters.period}</CardDescription></CardHeader><CardContent><TrendChart data={data.hiring.trend} name="Hires"/></CardContent></Card>
        <Card className="shadow-none"><CardHeader><CardTitle>Requisition volume</CardTitle><CardDescription>Requisitions opened by {data.filters.period}</CardDescription></CardHeader><CardContent><TrendChart data={data.hiring.requisitionTrend} name="Requisitions" color="var(--chart-2)"/></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="shadow-none"><CardHeader><CardTitle>Active demand by department</CardTitle><CardDescription>Select a department to filter the report</CardDescription></CardHeader><CardContent><BarBreakdown data={data.hiring.pipelineByDepartment} name="Open roles" onSelect={(department) => setFilters({ ...filters, department })}/></CardContent></Card>
        <Card className="shadow-none"><CardHeader><CardTitle>Source performance</CardTitle><CardDescription>Completed hires and average time to hire</CardDescription></CardHeader><CardContent className="divide-y divide-border">{data.hiring.sourceStats.length ? data.hiring.sourceStats.slice(0, 8).map((source, index) => <div key={source.label} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-3"><span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-medium">{source.label}</p><p className="text-[10px] text-muted-foreground">{source.hires} completed hire{source.hires === 1 ? "" : "s"}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums">{source.averageDays}d</p><p className="text-[9px] text-muted-foreground">average</p></div></div>) : <EmptyChart/>}</CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Completed hires by role</CardTitle><CardDescription>Roles filled in the selected range</CardDescription></CardHeader><CardContent><BarBreakdown data={data.hiring.byRole} name="Hires"/></CardContent></Card>
        <Card><CardHeader><CardTitle>Hiring footprint</CardTitle><CardDescription>Filtered records by workplace location</CardDescription></CardHeader><CardContent><BarBreakdown data={data.hiring.byLocation} name="Records"/></CardContent></Card>
      </div>

      <HiringRecords rows={data.hiring.rows}/>

    </div>
  )
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-[11px] font-medium text-muted-foreground">{label}<span className="mt-1 block [&_input]:h-9 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:text-xs [&_input]:font-normal [&_select]:h-9 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:text-xs [&_select]:font-normal">{children}</span></label>
}
