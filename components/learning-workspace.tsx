"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CalendarCheck2,
  CalendarClock,
  Check,
  ClipboardCheck,
  Database,
  FilterX,
  GraduationCap,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  X,
} from "lucide-react"
import {
  Area as RechartsArea,
  AreaChart as RechartsAreaChart,
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  CartesianGrid as RechartsCartesianGrid,
  ResponsiveContainer as RechartsResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
} from "recharts"

import { apiBaseUrl } from "@/lib/api"
import type { BreakdownPoint, TimePoint, TrainingRecord, WorkforceAnalytics } from "@/lib/hr-types"
import type { ManagedEmployee, WorkflowActorContext } from "@/lib/people-types"
import { SelectEmployee } from "@/components/workflow-creator"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Filters = { department: string; period: "month" | "quarter" | "year" }
const emptyFilters: Filters = { department: "", period: "month" }
const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
const textareaClass = "min-h-24 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"

function defaultDueDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  return date.toISOString().slice(0, 10)
}

function dateLabel(value?: string | null): string {
  if (!value) return "No due date"
  const date = new Date(`${value}T00:00:00`)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date) : value
}

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof GraduationCap; tone: string }) {
  return <Card className="gap-3 border-0 p-4 shadow-sm ring-1 ring-foreground/8"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><span className={cn("flex size-9 items-center justify-center rounded-xl", tone)}><Icon className="size-4"/></span></div><div><p className="text-2xl font-bold tracking-[-0.04em] tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div></Card>
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-xl"><p className="font-semibold">{label}</p><p className="mt-1 text-muted-foreground"><span className="font-semibold text-primary">{payload[0].value}</span> {payload[0].name?.toLowerCase()}</p></div>
}

function EmptyChart() {
  return <div className="flex h-60 items-center justify-center rounded-xl border border-dashed border-border px-5 text-center text-sm text-muted-foreground">No live training records match this view.</div>
}

function TrendChart({ data }: { data: TimePoint[] }) {
  if (!data.length) return <EmptyChart />
  return <div className="h-60 w-full"><RechartsResponsiveContainer width="100%" height="100%"><RechartsAreaChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 2 }}><defs><linearGradient id="learningHoursFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3}/><stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0}/></linearGradient></defs><RechartsCartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)"/><RechartsXAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}/><RechartsYAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}/><RechartsTooltip content={<ChartTooltip/>}/><RechartsArea type="monotone" dataKey="value" name="Hours" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#learningHoursFill)"/></RechartsAreaChart></RechartsResponsiveContainer></div>
}

function BreakdownChart({ data, onSelect }: { data: BreakdownPoint[]; onSelect?: (label: string) => void }) {
  if (!data.length) return <EmptyChart />
  return <div className="h-60 w-full"><RechartsResponsiveContainer width="100%" height="100%"><RechartsBarChart data={data.slice(0, 8)} layout="vertical" margin={{ left: 32, right: 14, top: 4, bottom: 2 }}><RechartsCartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)"/><RechartsXAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}/><RechartsYAxis type="category" dataKey="label" width={122} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}/><RechartsTooltip content={<ChartTooltip/>}/><RechartsBar dataKey="value" name="Hours" fill="var(--chart-1)" radius={[0,6,6,0]} cursor={onSelect ? "pointer" : "default"} onClick={(entry) => { const row = entry as unknown as { label?: string; payload?: { label?: string } }; const label = row.label ?? row.payload?.label; if (label && onSelect) onSelect(label) }}/></RechartsBarChart></RechartsResponsiveContainer></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold">{label}</span>{children}</label>
}

export function LearningWorkspace({ actor, people }: { actor: WorkflowActorContext; people: ManagedEmployee[] }) {
  const assignablePeople = useMemo(() => actor.role === "manager" ? people.filter((person) => person.manager_id === actor.employeeId) : people, [actor, people])
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [data, setData] = useState<WorkforceAnalytics | null>(null)
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [query, setQuery] = useState("")
  const [assignOpen, setAssignOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [assignment, setAssignment] = useState({ employeeId: assignablePeople[0]?.employee_id ?? "", program: "", dueDate: defaultDueDate(), hours: "2", note: "" })
  const requestQuery = useMemo(() => { const params = new URLSearchParams({ dataMode: "live", period: filters.period }); if (filters.department) params.set("department", filters.department); return params.toString() }, [filters])
  const loading = loadedQuery !== requestQuery

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/api/v1/workforce?${requestQuery}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Learning data could not be loaded."); return response.json() as Promise<WorkforceAnalytics> })
      .then((result) => { setData(result); setLoadedQuery(requestQuery); setError("") })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") { setError(reason instanceof Error ? reason.message : "Learning data could not be loaded."); setLoadedQuery(requestQuery) } })
    return () => controller.abort()
  }, [refreshKey, requestQuery])

  const names = useMemo(() => new Map(people.map((person) => [person.employee_id, person.display_name])), [people])
  const today = new Date().toISOString().slice(0, 10)
  const incomplete = useMemo(() => (data?.training.rows ?? []).filter((row) => row.completion_status.toLowerCase() !== "completed").sort((left, right) => (left.due_date ?? "9999").localeCompare(right.due_date ?? "9999")), [data])
  const completed = useMemo(() => (data?.training.rows ?? []).filter((row) => row.completion_status.toLowerCase() === "completed").sort((left, right) => (right.completion_date ?? "").localeCompare(left.completion_date ?? "")), [data])
  const overdue = incomplete.filter((row) => row.due_date && row.due_date < today).length
  const visibleAssignments = incomplete.filter((row) => { const normalized = query.trim().toLowerCase(); return !normalized || [row.training_program, row.employee_id, names.get(row.employee_id) ?? "", row.department].some((value) => value.toLowerCase().includes(normalized)) })

  function refresh(message: string) {
    setNotice(message)
    setLoadedQuery(null)
    setRefreshKey((current) => current + 1)
  }

  async function submitAssignment(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "training", ...assignment, hours: Number(assignment.hours) }) })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error ?? "The training assignment could not be saved.")
      setAssignOpen(false)
      setAssignment({ employeeId: assignablePeople[0]?.employee_id ?? "", program: "", dueDate: defaultDueDate(), hours: "2", note: "" })
      refresh(result.message ?? "Training assigned.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The training assignment could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  async function complete(row: TrainingRecord) {
    setBusyId(row.id)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/workflows/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: row.id, type: "training", action: "complete" }) })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error ?? "The assignment could not be completed.")
      refresh(result.message ?? "Training marked complete.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The assignment could not be completed.")
    } finally {
      setBusyId(null)
    }
  }

  if (!data && loading) return <div className="space-y-4"><div className="h-40 animate-pulse rounded-2xl bg-muted"/><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-muted"/>)}</div></div>
  if (!data) return <Card><CardContent className="p-6 text-sm text-destructive">{error || "Learning data could not be loaded."}</CardContent></Card>

  return <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 pb-10">
    <section className="rounded-lg border border-border bg-card px-5 py-5 sm:px-6"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="flex items-center gap-2 text-xs font-semibold text-primary"><GraduationCap className="size-4"/>Training administration</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Learning</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Manage training assignments, completion status, compliance requirements, and participation.</p></div>{actor.canAssignTraining && assignablePeople.length > 0 && <Button onClick={() => { setError(""); setAssignOpen(true) }}><Plus className="size-4"/>Assign training</Button>}</div><div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Database className="size-3.5 text-primary"/>Live records</span><span>{data.training.rows.length} assignments in this view</span><span>Updated {new Date(data.generatedAt).toLocaleString()}</span></div></section>

    <Card className="gap-4 border-0 p-4 shadow-sm ring-1 ring-foreground/8 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">Learning filters</p><p className="text-[11px] text-muted-foreground">Applied to live assignments, metrics, and charts</p></div><Button size="sm" variant="ghost" onClick={() => setFilters(emptyFilters)}><FilterX className="size-4"/>Reset</Button></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Department"><select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })} className={inputClass}><option value="">All departments</option>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Group trend"><select value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value as Filters["period"] })} className={inputClass}><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></Field></div>{loading && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse rounded-full bg-violet-400"/></div>}</Card>

    {(notice || error) && <div aria-live="polite" className={cn("rounded-xl border px-4 py-3 text-xs font-medium", error ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200")}>{error || notice}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Completion rate" value={`${data.training.completionRate.toLocaleString()}%`} detail={`${completed.length} completed assignments`} icon={ClipboardCheck} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"/><Metric label="Assigned learning" value={`${data.training.totalHours.toLocaleString()}h`} detail="Across this filtered register" icon={GraduationCap} tone="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"/><Metric label="Overdue" value={overdue.toLocaleString()} detail="Incomplete assignments past due" icon={CalendarClock} tone="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"/><Metric label="Mandatory gaps" value={data.training.requiringMandatoryTraining.toLocaleString()} detail="Incomplete security or safety work" icon={ShieldCheck} tone="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"/></div>

    <Card className="gap-0 overflow-hidden border-0 py-0 shadow-sm ring-1 ring-foreground/8"><CardHeader className="gap-4 border-b border-border/70 px-5 py-5 lg:flex-row lg:items-center lg:justify-between"><div><CardTitle>Assignments needing action</CardTitle><CardDescription>Incomplete work from the persisted training workflow</CardDescription></div><label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee or programme…" className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring/30 sm:w-72"/></label></CardHeader><CardContent className="px-0 pb-0">{visibleAssignments.length ? <div className="divide-y divide-border/70">{visibleAssignments.map((row) => { const canComplete = Boolean(row.requested_by_email) && (["admin", "hr"].includes(actor.role) || actor.employeeId === row.employee_id); const isOverdue = Boolean(row.due_date && row.due_date < today); return <div key={row.id} className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div className="flex min-w-0 items-start gap-3"><span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", isOverdue ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300")}><GraduationCap className="size-4"/></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{row.training_program}</p><p className="mt-1 text-xs text-muted-foreground">{names.get(row.employee_id) ?? row.employee_id} · {row.department} · {row.training_hours}h</p><p className={cn("mt-1 text-[10px] font-medium", isOverdue ? "text-rose-600 dark:text-rose-300" : "text-muted-foreground")}>{isOverdue ? "Overdue" : "Due"} {dateLabel(row.due_date)}</p></div></div>{canComplete ? <Button size="sm" disabled={busyId !== null} onClick={() => void complete(row)}>{busyId === row.id ? <LoaderCircle className="size-3.5 animate-spin"/> : <Check className="size-3.5"/>}Mark complete</Button> : <span className="text-[10px] text-muted-foreground">{row.requested_by_email ? "Assigned employee or HR completes" : "Imported record"}</span>}</div>})}</div> : <div className="flex min-h-36 items-center justify-center px-6 text-center text-sm text-muted-foreground">No incomplete assignments match this view.</div>}</CardContent></Card>

    <div className="grid gap-4 xl:grid-cols-2"><Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Completed learning trend</CardTitle><CardDescription>Completed hours grouped {data.filters.period} from persisted completion dates</CardDescription></CardHeader><CardContent><TrendChart data={data.training.trend}/></CardContent></Card><Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Participation by department</CardTitle><CardDescription>Assigned hours; click a department to filter</CardDescription></CardHeader><CardContent><BreakdownChart data={data.training.byDepartment} onSelect={(department) => setFilters({ ...filters, department })}/></CardContent></Card></div>

    <div className="grid gap-4 xl:grid-cols-2"><Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Programme mix</CardTitle><CardDescription>Assigned hours by programme</CardDescription></CardHeader><CardContent><BreakdownChart data={data.training.byProgram}/></CardContent></Card><Card className="border-0 shadow-sm ring-1 ring-foreground/8"><CardHeader><CardTitle>Recent completions</CardTitle><CardDescription>Latest completed assignments in this view</CardDescription></CardHeader><CardContent className="space-y-2">{completed.length ? completed.slice(0, 7).map((row) => <div key={row.id} className="flex items-center gap-3 rounded-xl border border-border/70 p-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><CalendarCheck2 className="size-4"/></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{row.training_program}</p><p className="truncate text-[10px] text-muted-foreground">{names.get(row.employee_id) ?? row.employee_id} · {row.department}</p></div><div className="text-right"><p className="text-[10px] font-semibold">{dateLabel(row.completion_date)}</p>{row.assessment_score !== null && <p className="mt-0.5 text-[9px] text-muted-foreground">Score {row.assessment_score}%</p>}</div></div>) : <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No completions recorded yet.</div>}</CardContent></Card></div>

    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/25 p-4 text-xs text-muted-foreground"><Database className="size-4 shrink-0 text-primary"/><p>Assignments, completion actions, employee history, and charts all use the same D1 records. Nothing on this page is decorative sample UI.</p></div>

    {assignOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"><button type="button" aria-label="Close assignment form" className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => !saving && setAssignOpen(false)}/><form onSubmit={submitAssignment} className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-background p-6 shadow-2xl"><button type="button" aria-label="Close" onClick={() => setAssignOpen(false)} className="absolute right-5 top-5 text-muted-foreground hover:text-foreground"><X className="size-4"/></button><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">New learning workflow</p><h2 className="mt-1 text-xl font-bold tracking-tight">Assign training</h2><p className="mt-1 text-sm text-muted-foreground">Creates a persisted assignment, employee activity entry, and Inbox action.</p><div className="mt-6 space-y-4"><SelectEmployee value={assignment.employeeId} people={assignablePeople} onChange={(employeeId) => setAssignment({ ...assignment, employeeId })}/><Field label="Training programme"><input required className={inputClass} value={assignment.program} onChange={(event) => setAssignment({ ...assignment, program: event.target.value })} placeholder="Security and privacy essentials"/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Due date"><input required type="date" className={inputClass} value={assignment.dueDate} onChange={(event) => setAssignment({ ...assignment, dueDate: event.target.value })}/></Field><Field label="Estimated hours"><input required min="0.5" max="500" step="0.5" type="number" className={inputClass} value={assignment.hours} onChange={(event) => setAssignment({ ...assignment, hours: event.target.value })}/></Field></div><Field label="Instructions (optional)"><textarea className={textareaClass} value={assignment.note} onChange={(event) => setAssignment({ ...assignment, note: event.target.value })} placeholder="Completion requirements or course link"/></Field></div>{error && <p role="alert" className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setAssignOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !assignment.employeeId}>{saving && <LoaderCircle className="size-4 animate-spin"/>}Assign training</Button></div></form></div>}
  </div>
}
