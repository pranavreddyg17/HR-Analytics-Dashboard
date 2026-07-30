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
  CalendarCheck2,
  CalendarClock,
  Check,
  Database,
  FilterX,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  Umbrella,
  Users,
  X,
} from "lucide-react"

import { apiBaseUrl } from "@/lib/api"
import type { BreakdownPoint, EmployeeRecord, LeaveRecord, TimePoint, WorkforceAnalytics } from "@/lib/hr-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Filters = { from: string; to: string; department: string; location: string; leaveType: string; period: "month" | "quarter" | "year" }
type Reviewer = { role: string; email: string; employeeId: string | null }
const emptyFilters: Filters = { from: "", to: "", department: "", location: "", leaveType: "", period: "month" }

function queryFor(filters: Filters): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
  params.set("dataMode", "live")
  return params.toString()
}

function dateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date) : value
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === "approved") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
  if (normalized === "pending") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
  if (normalized === "rejected") return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
  return "bg-muted text-muted-foreground"
}

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Umbrella; tone: string }) {
  return <Card className="gap-3 border-0 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_rgba(15,23,42,0.04)] ring-1 ring-foreground/8"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><span className={cn("flex size-9 items-center justify-center rounded-xl", tone)}><Icon className="size-4"/></span></div><div><p className="text-2xl font-bold tracking-[-0.04em] tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div></Card>
}

function LeaveTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl"><p className="font-semibold">{label}</p>{payload.map((item) => <p key={item.name} className="mt-1 text-muted-foreground"><span className="text-primary">{item.value}</span> {item.name?.toLowerCase()}</p>)}</div>
}

function TrendChart({ data }: { data: TimePoint[] }) {
  if (!data.length) return <EmptyChart />
  return <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 2 }}><defs><linearGradient id="leaveDaysFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3}/><stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)"/><XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}/><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}/><Tooltip content={<LeaveTooltip/>}/><Area type="monotone" dataKey="value" name="Days" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#leaveDaysFill)"/></AreaChart></ResponsiveContainer></div>
}

function BreakdownChart({ data, name, onSelect }: { data: BreakdownPoint[]; name: string; onSelect?: (label: string) => void }) {
  if (!data.length) return <EmptyChart />
  return <div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.slice(0, 8)} layout="vertical" margin={{ left: 30, right: 14, top: 4, bottom: 2 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)"/><XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}/><YAxis type="category" dataKey="label" width={112} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}/><Tooltip content={<LeaveTooltip/>}/><Bar dataKey="value" name={name} fill="var(--chart-1)" radius={[0,6,6,0]} cursor={onSelect ? "pointer" : "default"} onClick={(entry) => { const row = entry as unknown as { label?: string; payload?: { label?: string } }; const label = row.label ?? row.payload?.label; if (label && onSelect) onSelect(label) }}/></BarChart></ResponsiveContainer></div>
}

function EmptyChart() {
  return <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No database records match these filters.</div>
}

function RequestStatus({ data }: { data: BreakdownPoint[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return <div className="grid gap-3 sm:grid-cols-3">{data.map((item) => <div key={item.label} className="rounded-xl border border-border/70 bg-muted/25 p-3"><div className="flex items-center justify-between gap-2"><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide", statusTone(item.label))}>{item.label}</span><span className="text-xl font-bold tabular-nums">{item.value}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${total ? Math.max(5, (item.value / total) * 100) : 0}%` }}/></div></div>)}</div>
}

function LeaveSchedule({ title, description, emptyMessage, rows, people }: { title: string; description: string; emptyMessage: string; rows: LeaveRecord[]; people: Map<string, string> }) {
  return <Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="space-y-2">{rows.length ? rows.slice(0, 7).map((row) => <div key={row.id} className="flex items-center gap-3 rounded-xl border border-border/70 p-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"><Umbrella className="size-4"/></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{people.get(row.employee_id) ?? row.employee_id}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{row.leave_type} · {row.department}</p></div><div className="text-right"><p className="text-xs font-semibold whitespace-nowrap">{dateLabel(row.start_date)}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{row.leave_days} day{row.leave_days === 1 ? "" : "s"}</p></div></div>) : <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-border px-6 text-center text-xs text-muted-foreground">{emptyMessage}</div>}</CardContent></Card>
}

function canDecide(row: LeaveRecord, reviewer: Reviewer, employees: Map<string, EmployeeRecord>): boolean {
  if (row.approval_status.toLowerCase() !== "pending") return false
  if (row.data_source === "demo") return false
  const employee = employees.get(row.employee_id)
  if (employee?.work_email?.toLowerCase() === reviewer.email.toLowerCase()) return false
  if (["admin", "hr"].includes(reviewer.role)) return true
  return reviewer.role === "manager" && Boolean(reviewer.employeeId && employee?.manager_id === reviewer.employeeId)
}

const presentationTrend: TimePoint[] = [
  { period: "Jul", value: 18 }, { period: "Aug", value: 27 }, { period: "Sep", value: 21 },
  { period: "Oct", value: 31 }, { period: "Nov", value: 24 }, { period: "Dec", value: 36 },
]

const presentationTypes: BreakdownPoint[] = [
  { label: "Annual", value: 52 }, { label: "Sick", value: 24 }, { label: "Personal", value: 18 }, { label: "Caregiver", value: 12 },
]

type PresentationPerson = { name: string; detail: string; timing: string }

const presentationAway: PresentationPerson[] = [
  { name: "Maya Patel", detail: "Annual leave · Product", timing: "Returns Jul 31" },
  { name: "Noah Williams", detail: "Personal leave · Sales", timing: "Returns Aug 1" },
]

const presentationUpcoming: PresentationPerson[] = [
  { name: "Elena Garcia", detail: "Annual leave · Engineering", timing: "Aug 3–7" },
  { name: "Theo Martin", detail: "Caregiver leave · Finance", timing: "Aug 6–8" },
  { name: "Priya Singh", detail: "Annual leave · People", timing: "Aug 10–14" },
]

function PresentationList({ rows }: { rows: PresentationPerson[] }) {
  return <div className="space-y-2">{rows.map((row) => <div key={row.name} className="flex items-center gap-3 rounded-xl border border-amber-200/60 bg-background/80 p-3 dark:border-amber-900/40"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">DEMO</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{row.name}</p><p className="truncate text-[10px] text-muted-foreground">{row.detail}</p></div><span className="text-[10px] font-medium text-muted-foreground">{row.timing}</span></div>)}</div>
}

function PresentationPreview() {
  return (
    <section className="overflow-hidden rounded-2xl border border-amber-300/70 bg-amber-50/60 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/10" aria-labelledby="presentation-preview-title">
      <div className="flex flex-col gap-3 border-b border-amber-200/70 px-5 py-4 dark:border-amber-900/40 sm:flex-row sm:items-center"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><Sparkles className="size-4"/></span><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h2 id="presentation-preview-title" className="text-sm font-bold">Presentation preview</h2><span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Sample only</span></div><p className="mt-0.5 text-xs text-muted-foreground">Read-only examples for product demonstrations. They are not stored in D1 and never enter approvals, KPIs, exports, or employee history.</p></div>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-2"><Card className="border-amber-200/60 bg-background/80 dark:border-amber-900/40"><CardHeader><CardTitle>Who’s away</CardTitle><CardDescription>Example team coverage for today</CardDescription></CardHeader><CardContent><PresentationList rows={presentationAway}/></CardContent></Card><Card className="border-amber-200/60 bg-background/80 dark:border-amber-900/40"><CardHeader><CardTitle>Coming up</CardTitle><CardDescription>Example upcoming absences</CardDescription></CardHeader><CardContent><PresentationList rows={presentationUpcoming}/></CardContent></Card><Card className="border-amber-200/60 bg-background/80 dark:border-amber-900/40"><CardHeader><CardTitle>Example leave trend</CardTitle><CardDescription>Illustrative monthly days—not company data</CardDescription></CardHeader><CardContent><TrendChart data={presentationTrend}/></CardContent></Card><Card className="border-amber-200/60 bg-background/80 dark:border-amber-900/40"><CardHeader><CardTitle>Example leave mix</CardTitle><CardDescription>Illustrative categories—not company data</CardDescription></CardHeader><CardContent><BreakdownChart data={presentationTypes} name="Days"/></CardContent></Card></div>
    </section>
  )
}

function canSeePending(row: LeaveRecord, reviewer: Reviewer, employees: Map<string, EmployeeRecord>): boolean {
  if (row.approval_status.toLowerCase() !== "pending") return false
  if (["admin", "hr"].includes(reviewer.role)) return true
  return reviewer.role === "manager" && Boolean(reviewer.employeeId && employees.get(row.employee_id)?.manager_id === reviewer.employeeId)
}

function ReviewQueue({ rows, people, reviewer, employees, busyId, onDecision }: { rows: LeaveRecord[]; people: Map<string, string>; reviewer: Reviewer; employees: Map<string, EmployeeRecord>; busyId: string | null; onDecision: (row: LeaveRecord, decision: "Approved" | "Rejected") => void }) {
  const description = ["admin", "hr"].includes(reviewer.role) ? "All pending requests across the workspace" : "Pending requests from your direct reports"
  return (
    <Card id="pending-decisions" className="gap-0 overflow-hidden border-amber-200/70 py-0 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)] dark:border-amber-900/40">
      <CardHeader className="border-b border-border/70 bg-amber-50/70 px-5 py-5 dark:bg-amber-950/15">
        <div className="flex items-start justify-between gap-4"><div><CardTitle>Pending decisions</CardTitle><CardDescription>{description}</CardDescription></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{rows.length}</span></div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {rows.length ? <div className="divide-y divide-border/70">{rows.map((row) => { const actionable = canDecide(row, reviewer, employees); return <div key={row.id} className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div className="flex min-w-0 items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"><CalendarClock className="size-4"/></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{people.get(row.employee_id) ?? row.employee_id}</p><p className="mt-1 text-xs text-muted-foreground">{row.leave_type} · {row.leave_days} day{row.leave_days === 1 ? "" : "s"} · {dateLabel(row.start_date)} — {dateLabel(row.end_date)}</p><p className="mt-1 text-[10px] text-muted-foreground">{row.department} · {row.employee_id}</p></div></div>{actionable ? <div className="flex items-center gap-2 pl-[3.25rem] sm:pl-0"><Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => onDecision(row, "Rejected")} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/20"><X className="size-3.5"/>Decline</Button><Button size="sm" disabled={busyId !== null} onClick={() => onDecision(row, "Approved")} className="bg-emerald-600 text-white hover:bg-emerald-700">{busyId === row.id ? <LoaderCircle className="size-3.5 animate-spin"/> : <Check className="size-3.5"/>}Approve</Button></div> : <span className="pl-[3.25rem] text-[10px] font-medium text-muted-foreground sm:pl-0">Your own request requires another approver</span>}</div> })}</div> : <div className="flex flex-col items-center justify-center px-6 py-10 text-center"><span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><Check className="size-5"/></span><p className="mt-3 text-sm font-semibold">You’re all caught up</p><p className="mt-1 text-xs text-muted-foreground">There are no pending leave requests in this view.</p></div>}
      </CardContent>
    </Card>
  )
}

function LeaveTable({ rows, people, reviewer, employees, busyId, onDecision }: { rows: LeaveRecord[]; people: Map<string, string>; reviewer: Reviewer; employees: Map<string, EmployeeRecord>; busyId: string | null; onDecision: (row: LeaveRecord, decision: "Approved" | "Rejected") => void }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const statuses = useMemo(() => [...new Set(rows.map((row) => row.approval_status))].sort(), [rows])
  const visible = useMemo(() => { const normalized = query.trim().toLowerCase(); return rows.filter((row) => (!status || row.approval_status === status) && (!normalized || [row.employee_id, people.get(row.employee_id) ?? "", row.leave_type, row.department].some((value) => value.toLowerCase().includes(normalized)))) }, [people, query, rows, status])
  return <Card className="gap-0 overflow-hidden border-0 py-0 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.05)] ring-1 ring-foreground/8"><CardHeader className="gap-4 border-b border-border/70 px-5 py-5 lg:flex-row lg:items-center lg:justify-between"><div><CardTitle>Leave request register</CardTitle><CardDescription>Requests read directly from the workspace leave table</CardDescription></div><div className="flex flex-col gap-2 sm:flex-row"><label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee or leave type…" className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring/30 sm:w-64"/></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-xs outline-none"><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></div></CardHeader><CardContent className="px-0 pb-0"><div className="max-h-[480px] overflow-auto"><table className="w-full min-w-[1040px] text-left text-xs"><thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur"><tr>{["Employee", "Leave type", "Dates", "Days", "Department", "Status", "Data", "Action"].map((heading) => <th key={heading} className="px-4 py-3 font-semibold text-muted-foreground">{heading}</th>)}</tr></thead><tbody>{visible.map((row) => <tr key={row.id} className="border-t border-border/60 transition hover:bg-muted/25"><td className="px-4 py-3"><p className="font-semibold">{people.get(row.employee_id) ?? row.employee_id}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{row.employee_id}</p></td><td className="px-4 py-3">{row.leave_type}</td><td className="px-4 py-3 whitespace-nowrap">{dateLabel(row.start_date)} — {dateLabel(row.end_date)}</td><td className="px-4 py-3 font-semibold tabular-nums">{row.leave_days}</td><td className="px-4 py-3">{row.department}</td><td className="px-4 py-3"><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide", statusTone(row.approval_status))}>{row.approval_status}</span></td><td className="px-4 py-3"><span className="rounded-full border border-border px-2 py-1 text-[9px] font-semibold capitalize text-muted-foreground">{row.data_source === "demo" ? "sample" : row.data_source}</span></td><td className="px-4 py-3">{canDecide(row, reviewer, employees) ? <div className="flex gap-1.5"><Button size="xs" variant="outline" disabled={busyId !== null} onClick={() => onDecision(row, "Rejected")}><X className="size-3"/>Decline</Button><Button size="xs" disabled={busyId !== null} onClick={() => onDecision(row, "Approved")}>{busyId === row.id ? <LoaderCircle className="size-3 animate-spin"/> : <Check className="size-3"/>}Approve</Button></div> : <span className="text-muted-foreground">—</span>}</td></tr>)}</tbody></table>{!visible.length && <div className="p-10 text-center text-sm text-muted-foreground">No leave requests match your search.</div>}</div><div className="border-t border-border bg-muted/20 px-4 py-2.5 text-[10px] text-muted-foreground">Showing {visible.length} of {rows.length} filtered database records</div></CardContent></Card>
}

export function TimeOffWorkspace({ canRequestLeave, reviewer }: { canRequestLeave: boolean; reviewer: Reviewer }) {
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [data, setData] = useState<WorkforceAnalytics | null>(null)
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const query = useMemo(() => queryFor(filters), [filters])
  const loading = query !== loadedQuery

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/api/v1/workforce?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Time-off data could not be loaded."); return response.json() as Promise<WorkforceAnalytics> })
      .then((result) => { setData(result); setError(""); setLoadedQuery(query) })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") { setError(reason instanceof Error ? reason.message : "Time-off data could not be loaded."); setLoadedQuery(query) } })
    return () => controller.abort()
  }, [query, refreshKey])

  if (!data && loading) return <div className="space-y-4"><div className="h-40 animate-pulse rounded-2xl bg-muted"/><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-muted"/>)}</div></div>
  if (!data) return <Card><CardContent className="p-6 text-sm text-destructive">{error || "Time-off data could not be loaded."}</CardContent></Card>

  const dataLabel = "Live records only"
  const employees = new Map(data.employees.map((employee) => [employee.employee_id, employee]))
  const people = new Map(data.employees.map((employee) => [employee.employee_id, `${employee.preferred_name || employee.first_name} ${employee.last_name}`.trim()]))
  const pendingForReview = data.leave.rows.filter((row) => canSeePending(row, reviewer, employees))
  const canReviewLeave = ["admin", "hr", "manager"].includes(reviewer.role)

  async function decide(row: LeaveRecord, decision: "Approved" | "Rejected") {
    setBusyId(row.id)
    setError("")
    setNotice("")
    try {
      const response = await fetch(`/api/v1/hr/leave/${encodeURIComponent(row.id)}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? "The leave decision could not be saved.")
      setNotice(`${people.get(row.employee_id) ?? row.employee_id}'s ${row.leave_type.toLowerCase()} leave was ${decision.toLowerCase()}.`)
      setLoadedQuery(null)
      setRefreshKey((current) => current + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The leave decision could not be saved.")
    } finally {
      setBusyId(null)
    }
  }

  return <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 pb-10">
    <section className="relative overflow-hidden rounded-[1.75rem] border border-slate-800 bg-[#0d1424] px-5 py-6 text-white shadow-[0_18px_60px_rgba(15,23,42,0.14)] sm:px-7"><div className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-rose-400/10 blur-3xl"/><div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-300"><Umbrella className="size-3.5"/>Time-off workspace</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.05em] sm:text-4xl">Time away, with the team covered.</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">Request leave, make decisions, and understand upcoming coverage from one reliable leave register.</p></div><div className="flex flex-wrap gap-2">{canReviewLeave && <Button nativeButton={false} variant="outline" className="border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white" render={<a href="#pending-decisions"/>}>Review {pendingForReview.length || "requests"} <ArrowRight className="size-4"/></Button>}{canRequestLeave && <Button nativeButton={false} className="bg-rose-300 text-slate-950 hover:bg-rose-200" render={<Link href="/inbox?new=leave"/>}><Plus className="size-4"/>Request leave</Button>}</div></div><div className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-800 pt-4 text-[10px] text-slate-400"><span className="inline-flex items-center gap-1.5"><Database className="size-3.5 text-rose-300"/>{dataLabel}</span><span>{data.leave.totalRequests} records in this view</span><span>Updated {new Date(data.generatedAt).toLocaleString()}</span></div></section>

    <Card className="gap-4 border-0 p-4 shadow-sm ring-1 ring-foreground/8 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Schedule filters</p><p className="text-[11px] text-muted-foreground">Applied to live metrics, charts, schedules, and records</p></div><Button size="sm" variant="ghost" onClick={() => setFilters(emptyFilters)}><FilterX className="size-4"/>Reset</Button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Filter label="From"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })}/></Filter><Filter label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })}/></Filter><Filter label="Department"><select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Location"><select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}><option value="">All locations</option>{data.dimensions.locations.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Leave type"><select value={filters.leaveType} onChange={(event) => setFilters({ ...filters, leaveType: event.target.value })}><option value="">All leave types</option>{data.dimensions.leaveTypes.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Group trend"><select value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value as Filters["period"] })}><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></Filter></div>{loading && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse rounded-full bg-rose-400"/></div>}</Card>

    {(notice || error) && <div aria-live="polite" className={cn("rounded-xl border px-4 py-3 text-xs font-medium", error ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200")}>{error || notice}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Away today" value={new Set(data.leave.currentlyAway.map((row) => row.employee_id)).size.toLocaleString()} detail="Employees with approved leave today" icon={Umbrella} tone="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"/><Metric label="Pending decisions" value={data.leave.pending.toLocaleString()} detail={canReviewLeave ? ["admin", "hr"].includes(reviewer.role) ? `All ${pendingForReview.length} workspace requests` : `${pendingForReview.length} direct-report requests` : `${data.leave.totalRequests} requests in this view`} icon={CalendarClock} tone="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"/><Metric label="Approved leave" value={`${data.leave.totalDays.toLocaleString()}d`} detail={`${data.leave.approved} approved requests`} icon={CalendarCheck2} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"/><Metric label="Average approved leave" value={`${data.leave.averageDaysPerEmployee.toLocaleString()}d`} detail="Per employee taking approved leave" icon={Users} tone="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"/></div>

    {canReviewLeave && <ReviewQueue rows={pendingForReview} people={people} reviewer={reviewer} employees={employees} busyId={busyId} onDecision={(row, decision) => void decide(row, decision)}/>}

    <PresentationPreview />

    <div className="px-0.5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Live workspace</p><h2 className="mt-1 text-lg font-bold tracking-[-0.025em]">Actual schedules and analytics</h2><p className="mt-1 text-xs text-muted-foreground">Everything below is generated only from imported records and real workflows.</p></div>

    <div className="grid gap-4 xl:grid-cols-2"><LeaveSchedule title="Away today" description="Approved leave overlapping today" emptyMessage="No employees are on approved leave today." rows={data.leave.currentlyAway} people={people}/><LeaveSchedule title="Coming up" description="Approved and pending leave starting today or later" emptyMessage="No upcoming leave has been recorded yet." rows={data.leave.upcoming} people={people}/></div>

    <Card className="gap-4 border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Request decisions</CardTitle><CardDescription>Current distribution across the filtered leave register</CardDescription></CardHeader><CardContent><RequestStatus data={data.leave.statuses}/></CardContent></Card>

    <div className="grid gap-4 xl:grid-cols-2"><Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Approved leave trend</CardTitle><CardDescription>Approved days grouped {data.filters.period} from persisted start dates</CardDescription></CardHeader><CardContent><TrendChart data={data.leave.trend}/></CardContent></Card><Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Approved leave by type</CardTitle><CardDescription>Days taken—not an employee performance signal</CardDescription></CardHeader><CardContent><BreakdownChart data={data.leave.byType} name="Days"/></CardContent></Card></div>

    <Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Coverage by department</CardTitle><CardDescription>Approved leave days; click a department to filter this workspace</CardDescription></CardHeader><CardContent><BreakdownChart data={data.leave.byDepartment} name="Days" onSelect={(department) => setFilters({ ...filters, department })}/></CardContent></Card>

    <LeaveTable rows={data.leave.rows} people={people} reviewer={reviewer} employees={employees} busyId={busyId} onDecision={(row, decision) => void decide(row, decision)}/>

    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/25 p-4 text-xs text-muted-foreground sm:flex-row sm:items-center"><Database className="size-4 shrink-0 text-primary"/><p className="flex-1">Operational metrics always exclude presentation samples. The preview above is static, read-only, and isolated from D1 and workflow actions.</p><Link href="/data" className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary">Manage leave data <ArrowRight className="size-3.5"/></Link></div>
  </div>
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}<span className="mt-1 block [&_input]:h-9 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:text-xs [&_input]:font-normal [&_input]:normal-case [&_input]:tracking-normal [&_select]:h-9 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:text-xs [&_select]:font-normal [&_select]:normal-case [&_select]:tracking-normal">{children}</span></label>
}
