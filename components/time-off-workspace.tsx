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
  Check,
  FilterX,
  LoaderCircle,
  Plus,
  Search,
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
  if (normalized === "approved") return "text-emerald-700 dark:text-emerald-300"
  if (normalized === "pending") return "text-amber-700 dark:text-amber-300"
  if (normalized === "rejected") return "text-rose-700 dark:text-rose-300"
  return "text-muted-foreground"
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="gap-2 p-4 shadow-none"><p className="text-xs font-medium text-muted-foreground">{label}</p><div><p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div></Card>
}

function LeaveTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-none"><p className="font-semibold">{label}</p>{payload.map((item) => <p key={item.name} className="mt-1 text-muted-foreground"><span className="text-primary">{item.value}</span> {item.name?.toLowerCase()}</p>)}</div>
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
  return <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">No database records match these filters.</div>
}

function RequestStatus({ data }: { data: BreakdownPoint[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return <div className="grid gap-3 sm:grid-cols-3">{data.map((item) => <div key={item.label} className="rounded-md border border-border bg-card p-3"><div className="flex items-center justify-between gap-2"><span className={cn("text-xs font-medium", statusTone(item.label))}>{item.label}</span><span className="text-xl font-semibold tabular-nums">{item.value}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${total ? Math.max(5, (item.value / total) * 100) : 0}%` }}/></div></div>)}</div>
}

function LeaveSchedule({ title, description, emptyMessage, rows, people }: { title: string; description: string; emptyMessage: string; rows: LeaveRecord[]; people: Map<string, string> }) {
  return <Card className="shadow-none"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="divide-y divide-border">{rows.length ? rows.slice(0, 7).map((row) => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{people.get(row.employee_id) ?? row.employee_id}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{row.leave_type} · {row.department}</p></div><div className="text-right"><p className="text-xs font-medium whitespace-nowrap">{dateLabel(row.start_date)}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{row.leave_days} day{row.leave_days === 1 ? "" : "s"}</p></div></div>) : <div className="flex min-h-44 items-center justify-center px-6 text-center text-xs text-muted-foreground">{emptyMessage}</div>}</CardContent></Card>
}

function canDecide(row: LeaveRecord, reviewer: Reviewer, employees: Map<string, EmployeeRecord>): boolean {
  if (row.approval_status.toLowerCase() !== "pending") return false
  if (row.data_source === "demo") return false
  const employee = employees.get(row.employee_id)
  if (employee?.work_email?.toLowerCase() === reviewer.email.toLowerCase()) return false
  if (["admin", "hr"].includes(reviewer.role)) return true
  return reviewer.role === "manager" && Boolean(reviewer.employeeId && employee?.manager_id === reviewer.employeeId)
}

function canSeePending(row: LeaveRecord, reviewer: Reviewer, employees: Map<string, EmployeeRecord>): boolean {
  if (row.approval_status.toLowerCase() !== "pending") return false
  if (["admin", "hr"].includes(reviewer.role)) return true
  return reviewer.role === "manager" && Boolean(reviewer.employeeId && employees.get(row.employee_id)?.manager_id === reviewer.employeeId)
}

function ReviewQueue({ rows, people, reviewer, employees, busyId, onDecision }: { rows: LeaveRecord[]; people: Map<string, string>; reviewer: Reviewer; employees: Map<string, EmployeeRecord>; busyId: string | null; onDecision: (row: LeaveRecord, decision: "Approved" | "Rejected") => void }) {
  const description = ["admin", "hr"].includes(reviewer.role) ? "All pending requests across the workspace" : "Pending requests from your direct reports"
  return (
    <Card id="pending-decisions" className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="border-b border-border px-5 py-5">
        <div className="flex items-start justify-between gap-4"><div><CardTitle>Pending decisions</CardTitle><CardDescription>{description}</CardDescription></div><span className="text-sm font-semibold tabular-nums">{rows.length}</span></div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {rows.length ? <div className="divide-y divide-border/70">{rows.map((row) => { const actionable = canDecide(row, reviewer, employees); return <div key={row.id} className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{people.get(row.employee_id) ?? row.employee_id}</p><p className="mt-1 text-xs text-muted-foreground">{row.leave_type} · {row.leave_days} day{row.leave_days === 1 ? "" : "s"} · {dateLabel(row.start_date)} — {dateLabel(row.end_date)}</p><p className="mt-1 text-[10px] text-muted-foreground">{row.department} · {row.employee_id}</p></div>{actionable ? <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => onDecision(row, "Rejected")}><X className="size-3.5"/>Decline</Button><Button size="sm" disabled={busyId !== null} onClick={() => onDecision(row, "Approved")}>{busyId === row.id ? <LoaderCircle className="size-3.5 animate-spin"/> : <Check className="size-3.5"/>}Approve</Button></div> : <span className="text-[10px] font-medium text-muted-foreground">Another approver is required</span>}</div> })}</div> : <div className="flex min-h-32 items-center justify-center px-6 text-center text-sm text-muted-foreground">No pending leave requests.</div>}
      </CardContent>
    </Card>
  )
}

function LeaveTable({ rows, people, reviewer, employees, busyId, onDecision }: { rows: LeaveRecord[]; people: Map<string, string>; reviewer: Reviewer; employees: Map<string, EmployeeRecord>; busyId: string | null; onDecision: (row: LeaveRecord, decision: "Approved" | "Rejected") => void }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const statuses = useMemo(() => [...new Set(rows.map((row) => row.approval_status))].sort(), [rows])
  const visible = useMemo(() => { const normalized = query.trim().toLowerCase(); return rows.filter((row) => (!status || row.approval_status === status) && (!normalized || [row.employee_id, people.get(row.employee_id) ?? "", row.leave_type, row.department].some((value) => value.toLowerCase().includes(normalized)))) }, [people, query, rows, status])
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="gap-4 border-b border-border px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div><CardTitle>Leave request register</CardTitle><CardDescription>Requests for the selected filters</CardDescription></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee or leave type" className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-ring/30 sm:w-64"/></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border border-border bg-background px-3 text-xs outline-none"><option value="">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[1040px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-muted/95"><tr>{["Employee", "Leave type", "Dates", "Days", "Department", "Status", "Data", "Action"].map((heading) => <th key={heading} className="px-4 py-3 font-semibold text-muted-foreground">{heading}</th>)}</tr></thead>
            <tbody>{visible.map((row) => <tr key={row.id} className="border-t border-border/60 hover:bg-muted/25"><td className="px-4 py-3"><p className="font-semibold">{people.get(row.employee_id) ?? row.employee_id}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{row.employee_id}</p></td><td className="px-4 py-3">{row.leave_type}</td><td className="px-4 py-3 whitespace-nowrap">{dateLabel(row.start_date)} — {dateLabel(row.end_date)}</td><td className="px-4 py-3 font-semibold tabular-nums">{row.leave_days}</td><td className="px-4 py-3">{row.department}</td><td className="px-4 py-3"><span className={cn("text-[11px] font-medium", statusTone(row.approval_status))}>{row.approval_status}</span></td><td className="px-4 py-3"><span className="text-[11px] capitalize text-muted-foreground">{row.data_source === "demo" ? "sample" : row.data_source}</span></td><td className="px-4 py-3">{canDecide(row, reviewer, employees) ? <div className="flex gap-1.5"><Button size="xs" variant="outline" disabled={busyId !== null} onClick={() => onDecision(row, "Rejected")}><X className="size-3"/>Decline</Button><Button size="xs" disabled={busyId !== null} onClick={() => onDecision(row, "Approved")}>{busyId === row.id ? <LoaderCircle className="size-3 animate-spin"/> : <Check className="size-3"/>}Approve</Button></div> : <span className="text-muted-foreground">—</span>}</td></tr>)}</tbody>
          </table>
          {!visible.length && <div className="p-10 text-center text-sm text-muted-foreground">No leave requests match your search.</div>}
        </div>
        <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-[10px] text-muted-foreground">Showing {visible.length} of {rows.length} records</div>
      </CardContent>
    </Card>
  )
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

  if (!data && loading) return <div className="space-y-4"><div className="h-40 animate-pulse rounded-lg bg-muted"/><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-lg bg-muted"/>)}</div></div>
  if (!data) return <Card><CardContent className="p-6 text-sm text-destructive">{error || "Time-off data could not be loaded."}</CardContent></Card>

  const dataLabel = "Live records only"
  const employees = new Map(data.directoryEmployees.map((employee) => [employee.employee_id, employee]))
  const people = new Map(data.directoryEmployees.map((employee) => [employee.employee_id, `${employee.preferred_name || employee.first_name} ${employee.last_name}`.trim()]))
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
    <header className="border-b border-border pb-5"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight">Time off</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Manage leave requests, approvals, schedules, and coverage.</p></div><div className="flex flex-wrap gap-2">{canReviewLeave && <Button nativeButton={false} variant="outline" render={<a href="#pending-decisions"/>}>Review pending ({pendingForReview.length})</Button>}{canRequestLeave && <Button nativeButton={false} render={<Link href="/inbox?new=leave"/>}><Plus className="size-4"/>Request leave</Button>}</div></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>{dataLabel}</span><span>{data.leave.totalRequests} records</span><span>Updated {new Date(data.generatedAt).toLocaleString()}</span></div></header>

    <Card className="gap-4 p-4 shadow-none sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold">Filters</p><Button size="sm" variant="ghost" onClick={() => setFilters(emptyFilters)}><FilterX className="size-4"/>Reset</Button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Filter label="From"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })}/></Filter><Filter label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })}/></Filter><Filter label="Department"><select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Location"><select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}><option value="">All locations</option>{data.dimensions.locations.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Leave type"><select value={filters.leaveType} onChange={(event) => setFilters({ ...filters, leaveType: event.target.value })}><option value="">All leave types</option>{data.dimensions.leaveTypes.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Reporting interval"><select value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value as Filters["period"] })}><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></Filter></div>{loading && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse rounded-full bg-primary"/></div>}</Card>

    {(notice || error) && <div aria-live="polite" className={cn("rounded-md border px-4 py-3 text-xs font-medium", error ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200")}>{error || notice}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Away today" value={new Set(data.leave.currentlyAway.map((row) => row.employee_id)).size.toLocaleString()} detail="Employees with approved leave today"/><Metric label="Pending decisions" value={data.leave.pending.toLocaleString()} detail={canReviewLeave ? ["admin", "hr"].includes(reviewer.role) ? `${pendingForReview.length} requests available for review` : `${pendingForReview.length} direct-report requests` : `${data.leave.totalRequests} requests in this view`}/><Metric label="Approved leave" value={`${data.leave.totalDays.toLocaleString()}d`} detail={`${data.leave.approved} approved requests`}/><Metric label="Average approved leave" value={`${data.leave.averageDaysPerEmployee.toLocaleString()}d`} detail="Per employee taking approved leave"/></div>

    {canReviewLeave && <ReviewQueue rows={pendingForReview} people={people} reviewer={reviewer} employees={employees} busyId={busyId} onDecision={(row, decision) => void decide(row, decision)}/>}

    <div className="grid gap-4 xl:grid-cols-2"><LeaveSchedule title="Away today" description="Approved leave overlapping today" emptyMessage="No employees are on approved leave today." rows={data.leave.currentlyAway} people={people}/><LeaveSchedule title="Coming up" description="Approved and pending leave starting today or later" emptyMessage="No upcoming leave has been recorded yet." rows={data.leave.upcoming} people={people}/></div>

    <Card><CardHeader><CardTitle>Request decisions</CardTitle><CardDescription>Current distribution across the filtered leave register</CardDescription></CardHeader><CardContent><RequestStatus data={data.leave.statuses}/></CardContent></Card>

    <div className="grid gap-4 xl:grid-cols-2"><Card><CardHeader><CardTitle>Approved leave trend</CardTitle><CardDescription>Approved days grouped by {data.filters.period}</CardDescription></CardHeader><CardContent><TrendChart data={data.leave.trend}/></CardContent></Card><Card><CardHeader><CardTitle>Approved leave by type</CardTitle><CardDescription>Approved days by leave category</CardDescription></CardHeader><CardContent><BreakdownChart data={data.leave.byType} name="Days"/></CardContent></Card></div>

    <Card><CardHeader><CardTitle>Coverage by department</CardTitle><CardDescription>Approved leave days by department</CardDescription></CardHeader><CardContent><BreakdownChart data={data.leave.byDepartment} name="Days" onSelect={(department) => setFilters({ ...filters, department })}/></CardContent></Card>

    <LeaveTable rows={data.leave.rows} people={people} reviewer={reviewer} employees={employees} busyId={busyId} onDecision={(row, decision) => void decide(row, decision)}/>

  </div>
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-[11px] font-medium text-muted-foreground">{label}<span className="mt-1 block [&_input]:h-9 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:text-xs [&_input]:font-normal [&_select]:h-9 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:text-xs [&_select]:font-normal">{children}</span></label>
}
