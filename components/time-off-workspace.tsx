"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Check,
  FilterX,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react"

import type { EmployeeRecord, LeaveRecord, WorkforceAnalytics } from "@/lib/hr-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatWorkspaceDateTime } from "@/lib/date-format"
import { MetricStrip, WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"

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

function LeaveSchedule({ title, description, emptyMessage, rows, people }: { title: string; description: string; emptyMessage: string; rows: LeaveRecord[]; people: Map<string, string> }) {
  return <Card className="shadow-none"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="divide-y divide-border">{rows.length ? rows.slice(0, 7).map((row) => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{people.get(row.employee_id) ?? row.employee_id}</p><p className="mt-0.5 truncate text-meta text-muted-foreground">{row.leave_type} · {row.department}</p></div><div className="text-right"><p className="text-xs font-medium whitespace-nowrap">{dateLabel(row.start_date)}</p><p className="mt-0.5 text-meta text-muted-foreground">{row.leave_days} day{row.leave_days === 1 ? "" : "s"}</p></div></div>) : <div className="flex min-h-44 items-center justify-center px-6 text-center text-xs text-muted-foreground">{emptyMessage}</div>}</CardContent></Card>
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
        {rows.length ? <div className="divide-y divide-border/70">{rows.map((row) => { const actionable = canDecide(row, reviewer, employees); return <div key={row.id} className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold">{people.get(row.employee_id) ?? row.employee_id}</p><p className="mt-1 text-xs text-muted-foreground">{row.leave_type} · {row.leave_days} day{row.leave_days === 1 ? "" : "s"} · {dateLabel(row.start_date)} — {dateLabel(row.end_date)}</p><p className="mt-1 text-meta text-muted-foreground">{row.department} · {row.employee_id}</p></div>{actionable ? <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => onDecision(row, "Rejected")}><X className="size-3.5"/>Decline</Button><Button size="sm" disabled={busyId !== null} onClick={() => onDecision(row, "Approved")}>{busyId === row.id ? <LoaderCircle className="size-3.5 animate-spin"/> : <Check className="size-3.5"/>}Approve</Button></div> : <span className="text-meta font-medium text-muted-foreground">Another approver is required</span>}</div> })}</div> : <div className="flex min-h-32 items-center justify-center px-6 text-center text-sm text-muted-foreground">No pending leave requests.</div>}
      </CardContent>
    </Card>
  )
}

function LeaveTable({ rows, people, reviewer, employees, busyId, selectedId, onDecision }: { rows: LeaveRecord[]; people: Map<string, string>; reviewer: Reviewer; employees: Map<string, EmployeeRecord>; busyId: string | null; selectedId: string | null; onDecision: (row: LeaveRecord, decision: "Approved" | "Rejected") => void }) {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const statuses = useMemo(() => [...new Set(rows.map((row) => row.approval_status))].sort(), [rows])
  const visible = useMemo(() => { const normalized = query.trim().toLowerCase(); return rows.filter((row) => (!status || row.approval_status === status) && (!normalized || [row.employee_id, people.get(row.employee_id) ?? "", row.leave_type, row.department].some((value) => value.toLowerCase().includes(normalized)))) }, [people, query, rows, status])
  useEffect(() => {
    if (!selectedId || !visible.some((row) => row.id === selectedId)) return
    document.getElementById(`leave-request-${selectedId}`)?.scrollIntoView({ block: "center" })
  }, [selectedId, visible])
  return (
    <Card id="leave-register" className="gap-0 scroll-mt-24 overflow-hidden py-0 shadow-none">
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
            <thead className="sticky top-0 z-10 bg-muted/95"><tr>{["Employee", "Leave type", "Dates", "Days", "Department", "Status", "Action"].map((heading) => <th key={heading} className="px-4 py-3 font-semibold text-muted-foreground">{heading}</th>)}</tr></thead>
            <tbody>{visible.map((row) => <tr id={`leave-request-${row.id}`} key={row.id} className={cn("border-t border-border/60 hover:bg-muted/25", selectedId === row.id && "bg-primary/5 ring-1 ring-inset ring-primary/30")}><td className="px-4 py-3"><p className="font-semibold">{people.get(row.employee_id) ?? row.employee_id}</p><p className="mt-0.5 text-meta text-muted-foreground">{row.employee_id}</p></td><td className="px-4 py-3">{row.leave_type}</td><td className="px-4 py-3 whitespace-nowrap">{dateLabel(row.start_date)} — {dateLabel(row.end_date)}</td><td className="px-4 py-3 font-semibold tabular-nums">{row.leave_days}</td><td className="px-4 py-3">{row.department}</td><td className="px-4 py-3"><span className={cn("text-status font-semibold", statusTone(row.approval_status))}>{row.approval_status}</span></td><td className="px-4 py-3">{canDecide(row, reviewer, employees) ? <div className="flex gap-1.5"><Button size="xs" variant="outline" disabled={busyId !== null} onClick={() => onDecision(row, "Rejected")}><X className="size-3"/>Decline</Button><Button size="xs" disabled={busyId !== null} onClick={() => onDecision(row, "Approved")}>{busyId === row.id ? <LoaderCircle className="size-3 animate-spin"/> : <Check className="size-3"/>}Approve</Button></div> : <span className="text-muted-foreground">—</span>}</td></tr>)}</tbody>
          </table>
          {!visible.length && <div className="p-10 text-center text-sm text-muted-foreground">No leave requests match your search.</div>}
        </div>
        <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground">Showing {visible.length} of {rows.length} records</div>
      </CardContent>
    </Card>
  )
}

export function TimeOffWorkspace({ canRequestLeave, reviewer }: { canRequestLeave: boolean; reviewer: Reviewer }) {
  const searchParams = useSearchParams()
  const selectedRequestId = searchParams.get("request")
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
    fetch(`/api/v1/workforce?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Time-off data could not be loaded."); return response.json() as Promise<WorkforceAnalytics> })
      .then((result) => { setData(result); setError(""); setLoadedQuery(query) })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") { setError(reason instanceof Error ? reason.message : "Time-off data could not be loaded."); setLoadedQuery(query) } })
    return () => controller.abort()
  }, [query, refreshKey])

  if (!data && loading) return <div className="space-y-4"><div className="h-40 animate-pulse rounded-lg bg-muted"/><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-lg bg-muted"/>)}</div></div>
  if (!data) return <Card><CardContent className="p-6 text-sm text-destructive">{error || "Time-off data could not be loaded."}</CardContent></Card>

  const employees = new Map(data.directoryEmployees.map((employee) => [employee.employee_id, employee]))
  const people = new Map(data.directoryEmployees.map((employee) => [employee.employee_id, `${employee.preferred_name || employee.first_name} ${employee.last_name}`.trim()]))
  const pendingForReview = data.leave.rows.filter((row) => canSeePending(row, reviewer, employees))
  const canReviewLeave = ["admin", "hr", "manager"].includes(reviewer.role)
  const selectedRequest = selectedRequestId
    ? [...data.leave.rows, ...data.leave.upcoming, ...data.leave.currentlyAway].find((row) => row.id === selectedRequestId) ?? null
    : null
  const selectedPerson = selectedRequest ? people.get(selectedRequest.employee_id) ?? selectedRequest.employee_id : ""

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

  return <WorkspacePage>
    <WorkspaceHeader title="Leaves" description="Review requests and coordinate team availability." meta={<><span>{data.leave.totalRequests} requests</span><span>Updated {formatWorkspaceDateTime(data.generatedAt)}</span></>} actions={<>{canReviewLeave && pendingForReview.length > 0 && <Button nativeButton={false} variant="outline" render={<a href="#pending-decisions"/>}>Review pending ({pendingForReview.length})</Button>}{canRequestLeave && <Button nativeButton={false} render={<Link href="/inbox?new=leave"/>}><Plus className="size-3.5"/>Request leave</Button>}</>}/>

    {selectedRequestId && (selectedRequest ? <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Selected leave request</CardTitle><CardDescription>{selectedPerson} · {selectedRequest.employee_id}</CardDescription></div><div className="flex flex-wrap gap-2"><Button nativeButton={false} variant="outline" render={<Link href="/time-off"/>}>Clear selection</Button><Button nativeButton={false} variant="outline" render={<Link href={`/people/${encodeURIComponent(selectedRequest.employee_id)}`}/>}>View employee</Button>{canDecide(selectedRequest, reviewer, employees) && <><Button variant="outline" disabled={busyId !== null} onClick={() => void decide(selectedRequest, "Rejected")}>Decline</Button><Button disabled={busyId !== null} onClick={() => void decide(selectedRequest, "Approved")}>{busyId === selectedRequest.id && <LoaderCircle className="size-3.5 animate-spin"/>}Approve</Button></>}{selectedRequest.approval_status.toLowerCase() === "approved" && <Button onClick={() => { setFilters({ ...filters, department: selectedRequest.department }); window.setTimeout(() => document.getElementById("leave-register")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0) }}>Show department requests</Button>}</div></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4"><div><p className="text-meta font-semibold text-muted-foreground">Leave</p><p className="mt-1 text-sm">{selectedRequest.leave_type} · {selectedRequest.leave_days} day{selectedRequest.leave_days === 1 ? "" : "s"}</p></div><div><p className="text-meta font-semibold text-muted-foreground">Dates</p><p className="mt-1 text-sm">{dateLabel(selectedRequest.start_date)} — {dateLabel(selectedRequest.end_date)}</p></div><div><p className="text-meta font-semibold text-muted-foreground">Department</p><p className="mt-1 text-sm">{selectedRequest.department}</p></div><div><p className="text-meta font-semibold text-muted-foreground">Status</p><p className={cn("mt-1 text-sm font-semibold", statusTone(selectedRequest.approval_status))}>{selectedRequest.approval_status}</p></div></CardContent></Card> : <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">This leave request is not available in the current data view. <Link href="/time-off" className="font-semibold underline">Clear selection</Link></div>)}

    <details className="rounded-lg border border-border bg-card">
      <summary className="flex min-h-11 items-center justify-between px-4 font-semibold">Filter requests <span className="text-meta font-normal text-muted-foreground">Department, location, leave type, or date</span></summary>
      <div className="border-t border-border p-4"><div className="mb-3 flex justify-end"><Button size="sm" variant="ghost" onClick={() => setFilters(emptyFilters)}><FilterX className="size-3.5"/>Reset</Button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Filter label="From"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })}/></Filter><Filter label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })}/></Filter><Filter label="Department"><select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Location"><select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}><option value="">All locations</option>{data.dimensions.locations.map((item) => <option key={item}>{item}</option>)}</select></Filter><Filter label="Leave type"><select value={filters.leaveType} onChange={(event) => setFilters({ ...filters, leaveType: event.target.value })}><option value="">All leave types</option>{data.dimensions.leaveTypes.map((item) => <option key={item}>{item}</option>)}</select></Filter></div>{loading && <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse rounded-full bg-primary"/></div>}</div>
    </details>

    {(notice || error) && <div aria-live="polite" className={cn("rounded-md border px-4 py-3 text-xs font-medium", error ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200")}>{error || notice}</div>}

    <MetricStrip metrics={[{ label: "Away today", value: new Set(data.leave.currentlyAway.map((row) => row.employee_id)).size.toLocaleString(), detail: "Employees on approved leave" }, { label: "Pending decisions", value: data.leave.pending.toLocaleString(), detail: `${pendingForReview.length} available for review` }, { label: "Approved leave", value: `${data.leave.totalDays.toLocaleString()}d`, detail: `${data.leave.approved} approved requests` }, { label: "Average leave", value: `${data.leave.averageDaysPerEmployee.toLocaleString()}d`, detail: "Per employee with approved leave" }]}/>

    {canReviewLeave && <ReviewQueue rows={pendingForReview} people={people} reviewer={reviewer} employees={employees} busyId={busyId} onDecision={(row, decision) => void decide(row, decision)}/>}

    <div className="grid gap-4 xl:grid-cols-2"><LeaveSchedule title="Away today" description="Approved leave overlapping today" emptyMessage="No employees are on approved leave today." rows={data.leave.currentlyAway} people={people}/><LeaveSchedule title="Coming up" description="Approved and pending leave starting today or later" emptyMessage="No upcoming leave has been recorded yet." rows={data.leave.upcoming} people={people}/></div>

    <LeaveTable rows={data.leave.rows} people={people} reviewer={reviewer} employees={employees} busyId={busyId} selectedId={selectedRequestId} onDecision={(row, decision) => void decide(row, decision)}/>

  </WorkspacePage>
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="text-meta font-medium text-muted-foreground">{label}<span className="mt-1 block [&_input]:h-9 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:text-xs [&_input]:font-normal [&_select]:h-9 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:text-xs [&_select]:font-normal">{children}</span></label>
}
