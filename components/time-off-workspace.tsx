"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { LoaderCircle, Plus, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RegisterPagination } from "@/components/register-pagination"
import { MetricStrip, WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import type { LeaveOperationRecord, LeaveOperations } from "@/lib/leave-types"
import { safeReturnTo, withReturnTo } from "@/lib/navigation"
import { cn } from "@/lib/utils"

const inputClass = "h-9 w-full rounded-md border border-border bg-background px-3 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
const textareaClass = "min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"

function dateLabel(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date) : value
}

function statusTone(status: string): string {
  if (status.toLowerCase() === "approved") return "text-emerald-700 dark:text-emerald-300"
  if (status.toLowerCase() === "rejected") return "text-destructive"
  return "text-amber-700 dark:text-amber-300"
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-label font-semibold">{label}</span>{children}</label>
}

function Schedule({ title, rows }: { title: string; rows: LeaveOperationRecord[] }) {
  return <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle>{title}</CardTitle></CardHeader><CardContent className="p-0">{rows.length ? <div className="divide-y divide-border/70">{rows.slice(0, 6).map((row) => <div key={row.id} className="flex items-center justify-between gap-4 px-5 py-3"><div className="min-w-0"><p className="truncate font-semibold">{row.employeeName}</p><p className="text-meta text-muted-foreground">{row.leaveType} · {row.department}</p></div><div className="text-right"><p className="whitespace-nowrap">{dateLabel(row.startDate)}</p><p className="text-meta text-muted-foreground">{row.leaveDays} day{row.leaveDays === 1 ? "" : "s"}</p></div></div>)}</div> : <p className="p-8 text-center text-body text-muted-foreground">No leave is scheduled.</p>}</CardContent></Card>
}

export function TimeOffWorkspace({ canRequestLeave, initialData }: { canRequestLeave: boolean; initialData: LeaveOperations }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get("returnTo"))
  const selectedId = searchParams.get("request")
  const [filters, setFilters] = useState({ from: searchParams.get("from") ?? "", to: searchParams.get("to") ?? "", department: searchParams.get("department") ?? "", location: searchParams.get("location") ?? "", leaveType: searchParams.get("leaveType") ?? "" })
  const [status, setStatus] = useState("")
  const [query, setQuery] = useState("")
  const [data, setData] = useState<LeaveOperations | null>(initialData)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [decision, setDecision] = useState<{ row: LeaveOperationRecord; value: "Approved" | "Rejected" } | null>(null)
  const [decisionNote, setDecisionNote] = useState("")
  const [initialRequestQuery] = useState(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
    return params.toString()
  })
  const skippedInitialLoad = useRef(false)

  const requestQuery = useMemo(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
    return params.toString()
  }, [filters])
  const listHref = useMemo(() => {
    const params = new URLSearchParams(requestQuery)
    if (returnTo) params.set("returnTo", returnTo)
    return `/leaves${params.size ? `?${params.toString()}` : ""}`
  }, [requestQuery, returnTo])

  async function load(message = "") {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/v1/hr/leave${requestQuery ? `?${requestQuery}` : ""}`, { cache: "no-store" })
      const result = await response.json() as LeaveOperations & { error?: string }
      if (!response.ok) throw new Error(result.error || "Leave operations could not be loaded.")
      setData(result)
      setNotice(message)
      if (message) window.setTimeout(() => setNotice(""), 3500)
      router.refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Leave operations could not be loaded.") } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!skippedInitialLoad.current) {
      skippedInitialLoad.current = true
      if (requestQuery === initialRequestQuery) return
    }
    const controller = new AbortController()
    fetch(`/api/v1/hr/leave${requestQuery ? `?${requestQuery}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as LeaveOperations & { error?: string }
        if (!response.ok) throw new Error(result.error || "Leave operations could not be loaded.")
        return result
      })
      .then((result) => { setData(result); setError("") })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Leave operations could not be loaded.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [initialRequestQuery, requestQuery])

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return (data?.requests ?? []).filter((row) => (!status || row.status === status) && (!normalized || [row.employeeName, row.employeeId, row.leaveType, row.department].some((value) => value.toLowerCase().includes(normalized))))
  }, [data?.requests, query, status])
  const pending = data?.requests.filter((row) => row.canDecide) ?? []
  const selected = selectedId ? data?.requests.find((row) => row.id === selectedId) ?? null : null

  function openDecision(row: LeaveOperationRecord, value: "Approved" | "Rejected") {
    setDecision({ row, value })
    setDecisionNote("")
    setError("")
  }

  async function submitDecision(event: React.FormEvent) {
    event.preventDefault()
    if (!decision) return
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/v1/hr/leave/${encodeURIComponent(decision.row.id)}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: decision.value, note: decisionNote }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || "The leave decision could not be saved.")
      const message = `${decision.row.employeeName}'s ${decision.row.leaveType.toLowerCase()} leave was ${decision.value.toLowerCase()}.`
      setDecision(null)
      await load(message)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The leave decision could not be saved.") } finally { setBusy(false) }
  }

  if (!data && loading) return <div className="space-y-4"><div className="h-32 animate-pulse rounded-lg bg-muted"/><div className="h-96 animate-pulse rounded-lg bg-muted"/></div>
  if (!data) return <Card><CardContent className="p-6 text-body text-destructive">{error || "Leave operations could not be loaded."}</CardContent></Card>

  return <WorkspacePage>
    <WorkspaceHeader title="Leaves" description="Requests, approvals, and availability." meta={<>{data.summary.requests} requests</>} actions={canRequestLeave ? <Button nativeButton={false} render={<Link href="/inbox?new=leave"/>}><Plus className="size-3.5"/>Request leave</Button> : undefined}/>
    {(notice || error) && <div aria-live="polite" className={cn("rounded-md border px-4 py-3 text-meta", error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{error || notice}</div>}
    <MetricStrip metrics={[
      { label: "Away today", value: data.summary.awayToday, detail: "Approved leave" },
      { label: "Pending", value: data.summary.pending, detail: `${data.summary.reviewable} available to review` },
      { label: "Approved days", value: data.summary.approvedDays, detail: "Current filtered view" },
    ]}/>

    {selected && <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4 sm:flex sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>{selected.employeeName}</CardTitle><CardDescription>{selected.leaveType} · {dateLabel(selected.startDate)} to {dateLabel(selected.endDate)}</CardDescription></div><div className="flex gap-2"><Button nativeButton={false} variant="outline" render={<Link href={withReturnTo(`/people/${encodeURIComponent(selected.employeeId)}`, `/leaves?request=${encodeURIComponent(selected.id)}`)}/>}>View employee</Button><Button nativeButton={false} variant="outline" render={<Link href={listHref}/>}>Clear</Button></div></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-4"><div><p className="text-label font-semibold text-muted-foreground">Status</p><p className={cn("mt-1 font-semibold", statusTone(selected.status))}>{selected.status}</p></div><div><p className="text-label font-semibold text-muted-foreground">Department coverage</p><p className="mt-1">{selected.coverage.approvedAway} approved away of {selected.coverage.departmentHeadcount}</p></div><div><p className="text-label font-semibold text-muted-foreground">Other pending</p><p className="mt-1">{selected.coverage.pendingRequests}</p></div><div>{selected.canDecide && <div className="flex gap-2"><Button size="xs" variant="outline" onClick={() => openDecision(selected, "Rejected")}>Decline</Button><Button size="xs" onClick={() => openDecision(selected, "Approved")}>Approve</Button></div>}</div></CardContent></Card>}

    {pending.length > 0 && <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle>Pending decisions</CardTitle><CardDescription>Requests you are authorized to decide.</CardDescription></CardHeader><CardContent className="p-0"><div className="divide-y divide-border/70">{pending.slice(0, 8).map((row) => <div key={row.id} className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,auto)_auto] sm:items-center"><div><p className="font-semibold">{row.employeeName}</p><p className="text-meta text-muted-foreground">{row.leaveType} · {row.leaveDays} days · {dateLabel(row.startDate)}</p></div><p className="text-meta text-muted-foreground">{row.coverage.approvedAway} of {row.coverage.departmentHeadcount} already approved away · {row.coverage.pendingRequests} other pending</p><div className="flex gap-2"><Button size="xs" variant="outline" onClick={() => openDecision(row, "Rejected")}>Decline</Button><Button size="xs" onClick={() => openDecision(row, "Approved")}>Approve</Button></div></div>)}</div></CardContent></Card>}

    <div className="grid gap-4 xl:grid-cols-2"><Schedule title="Away today" rows={data.awayToday}/><Schedule title="Coming up" rows={data.upcoming}/></div>

    <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="gap-3 border-b border-border px-5 py-4"><div><CardTitle>Leave register</CardTitle><CardDescription>Requests visible to your role.</CardDescription></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(220px,1fr)_140px_180px_150px_150px_160px_160px]">
      <label className="relative"><span className="sr-only">Search leave</span><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee or leave type" className={`${inputClass} pl-9`}/></label>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option value="">All statuses</option>{data.dimensions.statuses.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })} className={inputClass}><option value="">All departments</option>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })} className={inputClass}><option value="">All locations</option>{data.dimensions.locations.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={filters.leaveType} onChange={(event) => setFilters({ ...filters, leaveType: event.target.value })} className={inputClass}><option value="">All leave types</option>{data.dimensions.leaveTypes.map((item) => <option key={item}>{item}</option>)}</select>
      <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} aria-label="From date"/>
      <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} aria-label="To date"/>
    </div></CardHeader><CardContent className="p-0"><RegisterPagination rows={visible} itemLabel="requests" resetKey={`${query}|${status}|${requestQuery}|${selectedId ?? ""}`} initialItemIndex={selectedId ? visible.findIndex((row) => row.id === selectedId) : -1}>{(pageRows) => <><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-body"><thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Employee", "Leave", "Dates", "Department", "Status", "Coverage", ""].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead><tbody>{pageRows.map((row) => <tr key={row.id} className="border-t border-border/70 hover:bg-muted/20"><td className="px-4 py-3"><Link href={`/leaves?request=${encodeURIComponent(row.id)}`} className="font-semibold hover:text-primary">{row.employeeName}</Link><p className="text-meta text-muted-foreground">{row.employeeId}</p></td><td className="px-4 py-3">{row.leaveType} · {row.leaveDays}d</td><td className="px-4 py-3 whitespace-nowrap">{dateLabel(row.startDate)} — {dateLabel(row.endDate)}</td><td className="px-4 py-3">{row.department}</td><td className={cn("px-4 py-3 font-semibold", statusTone(row.status))}>{row.status}</td><td className="px-4 py-3 text-muted-foreground">{row.coverage.approvedAway} approved · {row.coverage.pendingRequests} pending</td><td className="px-4 py-3 text-right">{row.canDecide ? <Button size="xs" variant="outline" onClick={() => openDecision(row, "Approved")}>Review</Button> : <span className="text-muted-foreground">—</span>}</td></tr>)}</tbody></table></div>{!pageRows.length && <p className="p-10 text-center text-body text-muted-foreground">No leave requests match this view.</p>}</>}</RegisterPagination></CardContent></Card>

    {decision && <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"><button type="button" aria-label="Close decision" className="absolute inset-0 bg-slate-950/45" onClick={() => !busy && setDecision(null)}/><form onSubmit={submitDecision} className="relative w-full max-w-lg rounded-lg border border-border bg-background p-5 shadow-xl"><button type="button" aria-label="Close" className="absolute right-5 top-5 text-muted-foreground" onClick={() => setDecision(null)}><X className="size-4"/></button><h2 className="text-section font-semibold">{decision.value === "Approved" ? "Approve leave" : "Decline leave"}</h2><p className="mt-1 text-description text-muted-foreground">{decision.row.employeeName} · {decision.row.leaveType} · {dateLabel(decision.row.startDate)} to {dateLabel(decision.row.endDate)}</p><div className="mt-4 rounded-md border border-border bg-muted/25 p-3 text-body"><p>{decision.row.coverage.approvedAway} of {decision.row.coverage.departmentHeadcount} department employees have approved overlapping leave.</p><p className="mt-1 text-muted-foreground">{decision.row.coverage.pendingRequests} other overlapping request{decision.row.coverage.pendingRequests === 1 ? "" : "s"} are pending.</p></div><div className="mt-4"><Field label={decision.value === "Rejected" ? "Decision reason" : "Approval note"}><textarea required={decision.value === "Rejected"} minLength={decision.value === "Rejected" ? 10 : undefined} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} className={textareaClass} placeholder={decision.value === "Rejected" ? "Explain why this request cannot be approved" : "Optional coverage or handoff note"}/></Field></div>{error && <p className="mt-3 text-meta text-destructive">{error}</p>}<div className="mt-5 flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="ghost" onClick={() => setDecision(null)} disabled={busy}>Cancel</Button><Button type="submit" variant={decision.value === "Rejected" ? "destructive" : "default"} disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin"/>}{decision.value === "Approved" ? "Approve request" : "Decline request"}</Button></div></form></div>}
  </WorkspacePage>
}
