"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Database,
  Download,
  FilterX,
  GraduationCap,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserRoundCheck,
  Users,
} from "lucide-react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { apiBaseUrl } from "@/lib/api"
import type { BreakdownPoint, TimePoint, WorkforceAnalytics } from "@/lib/hr-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Filters = {
  from: string
  to: string
  department: string
  location: string
  period: "month" | "quarter" | "year"
  dataMode: "all" | "live"
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

const defaultFilters: Filters = { from: "", to: "", department: "", location: "", period: "month", dataMode: "all" }

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

function movementRows(hiring: TimePoint[], attrition: TimePoint[], promotions: TimePoint[]): Array<{ period: string; hires: number; exits: number; promotions: number }> {
  const periods = [...new Set([...hiring, ...attrition, ...promotions].map((row) => row.period))].sort()
  const hiringMap = new Map(hiring.map((row) => [row.period, row.value]))
  const attritionMap = new Map(attrition.map((row) => [row.period, row.value]))
  const promotionMap = new Map(promotions.map((row) => [row.period, row.value]))
  return periods.map((period) => ({ period, hires: hiringMap.get(period) ?? 0, exits: attritionMap.get(period) ?? 0, promotions: promotionMap.get(period) ?? 0 }))
}

function Metric({ label, value, detail, icon: Icon, tone = "blue" }: { label: string; value: string; detail: string; icon: typeof Users; tone?: "blue" | "green" | "amber" | "violet" }) {
  const toneClass = tone === "green" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : tone === "amber" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : tone === "violet" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
  return <Card className="gap-3 border-0 p-4 shadow-sm ring-1 ring-foreground/8"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><span className={cn("flex size-9 items-center justify-center rounded-xl", toneClass)}><Icon className="size-4"/></span></div><div><p className="text-2xl font-bold tracking-[-0.04em] tabular-nums">{value}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p></div></Card>
}

function MovementTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl"><p className="font-semibold">{label}</p>{payload.map((item) => <p key={item.name} className="mt-1 text-muted-foreground"><span className="font-semibold" style={{ color: item.color }}>{item.value}</span> {item.name}</p>)}</div>
}

function MovementChart({ rows }: { rows: ReturnType<typeof movementRows> }) {
  if (!rows.length) return <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-border px-6 text-center text-sm text-muted-foreground">No workforce movement is recorded for this view.</div>
  return <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ left: -20, right: 10, top: 8, bottom: 2 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)"/><XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}/><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}/><Tooltip content={<MovementTooltip/>}/><Legend wrapperStyle={{ fontSize: 11 }}/><Line type="monotone" dataKey="hires" name="Hires" stroke="var(--chart-1)" strokeWidth={2.5} dot={false}/><Line type="monotone" dataKey="exits" name="Exits" stroke="var(--chart-5)" strokeWidth={2.5} dot={false}/><Line type="monotone" dataKey="promotions" name="Promotions" stroke="var(--chart-3)" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div>
}

function DepartmentSignal({ row }: { row: DepartmentRow }) {
  if (row.exits > row.hires) return <span className="rounded-full bg-rose-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">Exit review</span>
  if (row.active > 0 && row.promotions === 0) return <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Mobility review</span>
  if (row.active > 0 && row.leaveDays / row.active >= 4) return <span className="rounded-full bg-sky-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">Coverage review</span>
  return <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">No trigger</span>
}

function sourceLabel(mode: string): string {
  if (mode === "demo") return "Simulated"
  if (mode === "mixed") return "Mixed"
  if (mode === "imported") return "Operational"
  return "Empty"
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

  if (!data && loading) return <div className="space-y-4"><div className="h-44 animate-pulse rounded-3xl bg-muted"/><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-muted"/>)}</div></div>
  if (!data) return <Card><CardContent className="p-6 text-sm text-destructive">{error || "Workforce insights could not be loaded."}</CardContent></Card>

  const netMovement = data.hiring.totalHired - data.attrition.totalExits
  const movement = movementRows(data.hiring.trend, data.attrition.trend, data.promotions.trend)
  const active = valueMap(data.employeeAnalytics.activeByDepartment)
  const hires = valueMap(data.hiring.byDepartment)
  const exits = valueMap(data.attrition.byDepartment)
  const leave = valueMap(data.leave.byDepartment)
  const learning = valueMap(data.training.byDepartment)
  const promotions = valueMap(data.promotions.byDepartment)
  const departments = [...new Set([...active.keys(), ...hires.keys(), ...exits.keys(), ...leave.keys(), ...learning.keys(), ...promotions.keys()])]
  const departmentRows: DepartmentRow[] = departments.map((department) => ({ department, active: active.get(department) ?? 0, hires: hires.get(department) ?? 0, exits: exits.get(department) ?? 0, leaveDays: leave.get(department) ?? 0, learningHours: learning.get(department) ?? 0, promotions: promotions.get(department) ?? 0 })).sort((left, right) => right.active - left.active || left.department.localeCompare(right.department))
  const attention = [
    { label: "Leave decisions", count: data.leave.pending, detail: "Pending requests awaiting an HR or manager decision", href: "/time-off#pending-decisions", action: "Review leave", icon: CalendarClock, tone: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
    { label: "Hiring pipeline", count: data.hiring.activeRequisitions, detail: `${data.hiring.offers} offers and open requisitions in motion`, href: "/hiring", action: "Open hiring", icon: BriefcaseBusiness, tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
    { label: "Mandatory learning", count: data.training.requiringMandatoryTraining, detail: "Incomplete security or safety assignments", href: "/learning", action: "Review learning", icon: GraduationCap, tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    { label: "Career mobility", count: data.promotions.withoutPromotionOver36Months, detail: "Employees with 3+ years tenure and no recorded promotion", href: "/people", action: "Review people", icon: TrendingUp, tone: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  ]

  return <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 pb-10">
    <section className="relative overflow-hidden rounded-[1.75rem] border border-slate-800 bg-[#0d1424] px-5 py-6 text-white shadow-[0_18px_60px_rgba(15,23,42,0.14)] sm:px-7"><div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-cyan-400/10 blur-3xl"/><div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300"><Activity className="size-3.5"/>Workforce operating review</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.05em] sm:text-4xl">Know what changed—and what HR should do next.</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">A connected view of workforce size, movement, employee experience, development, and open decisions. Every number links back to persisted records.</p></div><div className="flex flex-wrap gap-2"><a href={`${apiBaseUrl}/api/v1/reports?format=pdf&${requestQuery}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"><Download className="size-3.5"/>Executive PDF</a><a href={`${apiBaseUrl}/api/v1/reports?format=xlsx&${requestQuery}`} className="inline-flex h-9 items-center gap-2 rounded-xl bg-cyan-300 px-3 text-xs font-semibold text-slate-950 hover:bg-cyan-200"><Download className="size-3.5"/>Export records</a></div></div><div className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-800 pt-4 text-[10px] text-slate-400"><span className="inline-flex items-center gap-1.5"><Database className="size-3.5 text-cyan-300"/>{filters.dataMode === "live" ? "Operational records only" : "All persisted records · includes simulated dataset"}</span><span>{data.kpis.totalEmployees} workforce profiles in scope</span><span>Updated {new Date(data.generatedAt).toLocaleString()}</span></div></section>

    <Card className="gap-4 border-0 p-4 shadow-sm ring-1 ring-foreground/8 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Review scope</p><p className="text-[11px] text-muted-foreground">Filters update metrics, priorities, department comparisons, and exports</p></div><Button size="sm" variant="ghost" onClick={() => setFilters(defaultFilters)}><FilterX className="size-4"/>Reset</Button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Filter label="From"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })}/></Filter><Filter label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })}/></Filter><Filter label="Department"><select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Location"><select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}><option value="">All locations</option>{data.dimensions.locations.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Trend"><select value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value as Filters["period"] })}><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></Filter><Filter label="Data basis"><select value={filters.dataMode} onChange={(event) => setFilters({ ...filters, dataMode: event.target.value as Filters["dataMode"] })}><option value="all">All database records</option><option value="live">Operational only</option></select></Filter></div>{loading && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse rounded-full bg-cyan-400"/></div>}</Card>

    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">{error}</div>}

    <section aria-labelledby="workforce-state"><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">01 · Workforce state</p><h2 id="workforce-state" className="mt-1 text-lg font-bold tracking-[-0.025em]">The numbers HR should anchor on</h2></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Active workforce" value={compact(data.kpis.activeEmployees)} detail={`${data.employeeAnalytics.onLeave} on leave · ${data.employeeAnalytics.preboarding} preboarding`} icon={Users} tone="green"/><Metric label="Net movement" value={`${netMovement > 0 ? "+" : ""}${compact(netMovement)}`} detail={`${data.hiring.totalHired} hires minus ${data.attrition.totalExits} exits`} icon={netMovement >= 0 ? TrendingUp : TrendingDown} tone={netMovement >= 0 ? "green" : "amber"}/><Metric label="Attrition rate" value={`${data.attrition.rate.toLocaleString()}%`} detail={`${data.attrition.voluntary} voluntary · ${data.attrition.involuntary} involuntary exits`} icon={TrendingDown} tone="amber"/><Metric label="Learning complete" value={`${data.training.completionRate.toLocaleString()}%`} detail={`${data.training.totalHours.toLocaleString()} assigned hours`} icon={GraduationCap} tone="violet"/><Metric label="Promotion rate" value={`${data.promotions.rate.toLocaleString()}%`} detail={`${data.promotions.total} recorded promotions`} icon={UserRoundCheck}/></div></section>

    <section aria-labelledby="attention"><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">02 · Action queue</p><h2 id="attention" className="mt-1 text-lg font-bold tracking-[-0.025em]">What needs attention now</h2><p className="mt-1 text-xs text-muted-foreground">Counts route to the workflow where HR can take action.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{attention.map((item) => { const Icon = item.icon; return <Link key={item.label} href={item.href} className="group rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"><div className="flex items-start gap-3"><span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", item.tone)}><Icon className="size-4"/></span><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold">{item.label}</p><span className="text-xl font-bold tabular-nums">{item.count}</span></div><p className="mt-1 min-h-8 text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">{item.action}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5"/></span></div></div></Link>})}</div></section>

    <section aria-labelledby="movement"><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">03 · Workforce movement</p><h2 id="movement" className="mt-1 text-lg font-bold tracking-[-0.025em]">How the organisation is changing</h2></div><div className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]"><Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Hires, exits, and promotions</CardTitle><CardDescription>One comparable trend from persisted event dates; use the scope controls above to change the period.</CardDescription></CardHeader><CardContent><MovementChart rows={movement}/></CardContent></Card><Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>HR decision brief</CardTitle><CardDescription>Rule-based observations from the filtered records</CardDescription></div><Sparkles className="size-4 text-primary"/></div></CardHeader><CardContent className="space-y-2">{data.executiveInsights.length ? data.executiveInsights.map((insight, index) => <div key={insight} className="flex gap-3 rounded-xl border border-border/70 bg-muted/20 p-3"><span className="text-[10px] font-bold text-primary">{String(index + 1).padStart(2, "0")}</span><p className="text-xs leading-relaxed">{insight}</p></div>) : <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">There are not enough records in this scope to generate a useful brief.</div>}<Button nativeButton={false} variant="outline" className="mt-2 w-full" render={<Link href="/ai-agents"/>}><Bot className="size-4"/>Ask the analytics assistant</Button></CardContent></Card></div></section>

    <section aria-labelledby="departments"><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">04 · Department pulse</p><h2 id="departments" className="mt-1 text-lg font-bold tracking-[-0.025em]">Where HR should investigate</h2><p className="mt-1 text-xs text-muted-foreground">Signals are simple review triggers, not employee-performance judgments.</p></div><Card className="gap-0 overflow-hidden border-0 py-0 shadow-sm ring-1 ring-foreground/8"><CardContent className="px-0 pb-0"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-muted/60"><tr>{["Department", "Active", "Hires", "Exits", "Leave days", "Learning hours", "Promotions", "Review signal"].map((heading) => <th key={heading} className="px-4 py-3 font-semibold text-muted-foreground">{heading}</th>)}</tr></thead><tbody>{departmentRows.map((row) => <tr key={row.department} className="border-t border-border/60 hover:bg-muted/20"><td className="px-4 py-3"><button type="button" onClick={() => setFilters({ ...filters, department: row.department })} className="font-semibold hover:text-primary hover:underline">{row.department}</button></td><td className="px-4 py-3 tabular-nums">{row.active}</td><td className="px-4 py-3 tabular-nums">{row.hires}</td><td className="px-4 py-3 tabular-nums">{row.exits}</td><td className="px-4 py-3 tabular-nums">{row.leaveDays}</td><td className="px-4 py-3 tabular-nums">{row.learningHours}</td><td className="px-4 py-3 tabular-nums">{row.promotions}</td><td className="px-4 py-3"><DepartmentSignal row={row}/></td></tr>)}</tbody></table>{!departmentRows.length && <div className="p-10 text-center text-sm text-muted-foreground">No departments match this scope.</div>}</div><div className="border-t border-border bg-muted/20 px-4 py-2.5 text-[10px] text-muted-foreground">Select a department name to apply it to the entire operating review.</div></CardContent></Card></section>

    <section aria-labelledby="trust"><div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">05 · Data confidence</p><h2 id="trust" className="mt-1 text-lg font-bold tracking-[-0.025em]">Know what this review is built on</h2></div><div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"><Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Source coverage</CardTitle><CardDescription>Counts and provenance are read directly from each D1 domain table.</CardDescription></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{data.status.map((item) => <div key={item.domain} className="flex items-center gap-3 rounded-xl border border-border/70 p-3"><span className={cn("size-2.5 rounded-full", item.mode === "imported" ? "bg-emerald-500" : item.mode === "mixed" ? "bg-sky-500" : item.mode === "demo" ? "bg-amber-500" : "bg-slate-300")}/><div className="min-w-0 flex-1"><p className="text-xs font-semibold capitalize">{item.domain}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{sourceLabel(item.mode)}</p></div><span className="text-sm font-bold tabular-nums">{item.count}</span></div>)}</CardContent></Card><Card className="border-0 bg-slate-950 text-white shadow-sm"><CardHeader><CardTitle className="text-white">Interpretation guardrails</CardTitle><CardDescription className="text-slate-400">Use trends for investigation, not automatic decisions.</CardDescription></CardHeader><CardContent className="space-y-3 text-xs leading-relaxed text-slate-300"><p className="flex gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-300"/>Attrition-risk scores are historical review aids and require human judgment.</p><p className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300"/>Leave usage is a coverage measure—not an employee performance signal.</p><p className="flex gap-2"><Building2 className="mt-0.5 size-4 shrink-0 text-cyan-300"/>Switch to “Operational only” before making real workforce decisions.</p><Button nativeButton={false} variant="outline" className="mt-2 border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white" render={<Link href="/data"/>}><Database className="size-4"/>Open data hub</Button></CardContent></Card></div></section>

    <p className="text-[10px] text-muted-foreground">Generated {new Date(data.generatedAt).toLocaleString()} · Exports and every section use the active review scope.</p>
  </div>
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}<span className="mt-1 block [&_input]:h-9 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:text-xs [&_input]:font-normal [&_input]:normal-case [&_input]:tracking-normal [&_select]:h-9 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:text-xs [&_select]:font-normal [&_select]:normal-case [&_select]:tracking-normal">{children}</span></label>
}
