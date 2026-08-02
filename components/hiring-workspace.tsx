"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { LoaderCircle, Plus, RefreshCw, Search } from "lucide-react"

import type { HiringCandidate, HiringCandidateStage, HiringOperations, HiringRequisition } from "@/lib/hiring-types"
import { hiringCandidateStages } from "@/lib/hiring-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatWorkspaceDateTime } from "@/lib/date-format"

const activeStatuses = new Set(["Requested", "Open", "Offer"])
const activeCandidateStages = new Set<HiringCandidateStage>(["Applied", "Screening", "Interview", "Offer"])
const candidateSources = ["Careers site", "Employee referral", "LinkedIn", "Agency", "University", "Other"]

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled"
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(parsed) : value
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === "hired") return "text-emerald-700 dark:text-emerald-300"
  if (normalized === "offer") return "text-violet-700 dark:text-violet-300"
  if (normalized === "requested" || normalized === "applied") return "text-amber-700 dark:text-amber-300"
  if (normalized === "open" || normalized === "screening" || normalized === "interview") return "text-sky-700 dark:text-sky-300"
  if (normalized === "rejected" || normalized === "closed") return "text-destructive"
  return "text-muted-foreground"
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="gap-1 p-4 shadow-none"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="text-meta text-muted-foreground">{detail}</p></Card>
}

function RequisitionFilters({ query, onQuery, status, onStatus, department, onDepartment, departments }: { query: string; onQuery: (value: string) => void; status: string; onStatus: (value: string) => void; department: string; onDepartment: (value: string) => void; departments: string[] }) {
  return <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_220px]">
    <label className="relative"><span className="sr-only">Search requisitions</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search role, department, or owner" className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"/></label>
    <label><span className="sr-only">Requisition status</span><select value={status} onChange={(event) => onStatus(event.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"><option value="active">Active requisitions</option><option value="all">All statuses</option><option value="Requested">Requested</option><option value="Open">Open</option><option value="Offer">Offer</option><option value="Hired">Hired</option><option value="Closed">Closed</option><option value="Rejected">Rejected</option></select></label>
    <label><span className="sr-only">Department</span><select value={department} onChange={(event) => onDepartment(event.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"><option value="">All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label>
  </div>
}

function AddCandidateForm({ requisitions, initialRequisitionId, onCancel, onSaved }: { requisitions: HiringRequisition[]; initialRequisitionId: string; onCancel: () => void; onSaved: (message: string) => Promise<void> }) {
  const [requisitionId, setRequisitionId] = useState(initialRequisitionId)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [source, setSource] = useState("Careers site")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/hiring/candidates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requisitionId, fullName, email, source, notes }) })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || "Candidate could not be added.")
      await onSaved(result.message || "Candidate added.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Candidate could not be added.")
    } finally {
      setBusy(false)
    }
  }

  return <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <CardHeader className="border-b border-border px-5 py-4"><CardTitle>Add candidate</CardTitle><CardDescription>Attach a candidate to an approved requisition and create the first follow-up.</CardDescription></CardHeader>
    <CardContent className="p-5"><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <label className="sm:col-span-2 xl:col-span-1">Requisition<select required value={requisitionId} onChange={(event) => setRequisitionId(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none">{requisitions.map((item) => <option key={item.id} value={item.id}>{item.position} · {item.location}</option>)}</select></label>
      <label>Candidate name<input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"/></label>
      <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"/></label>
      <label>Source<select value={source} onChange={(event) => setSource(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none">{candidateSources.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="sm:col-span-2">Recruiter note<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Relevant context for the recruiting team" className="mt-1 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"/></label>
      {error && <p className="sm:col-span-2 xl:col-span-3 text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 sm:col-span-2 xl:col-span-3"><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin"/>}Add to pipeline</Button><Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button></div>
    </form></CardContent>
  </Card>
}

function CandidateUpdateForm({ candidate, initialStage, onCancel, onSaved }: { candidate: HiringCandidate; initialStage: HiringCandidateStage; onCancel: () => void; onSaved: (message: string) => Promise<void> }) {
  const [stage, setStage] = useState<HiringCandidateStage>(initialStage)
  const [nextStep, setNextStep] = useState("")
  const [nextStepDueAt, setNextStepDueAt] = useState("")
  const [notes, setNotes] = useState(candidate.notes || "")
  const [rejectedReason, setRejectedReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/v1/hr/hiring/candidates/${encodeURIComponent(candidate.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage, nextStep: nextStep || undefined, nextStepDueAt: nextStepDueAt || undefined, notes, rejectedReason: rejectedReason || undefined }) })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || "Candidate could not be updated.")
      await onSaved(result.message || "Candidate updated.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Candidate could not be updated.")
    } finally {
      setBusy(false)
    }
  }

  return <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <CardHeader className="border-b border-border px-5 py-4"><CardTitle>Update candidate</CardTitle><CardDescription>{candidate.fullName} · {candidate.requisitionTitle}</CardDescription></CardHeader>
    <CardContent className="p-5"><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <label>Stage<select value={stage} onChange={(event) => setStage(event.target.value as HiringCandidateStage)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none">{hiringCandidateStages.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Next-step due date<input type="date" value={nextStepDueAt} onChange={(event) => setNextStepDueAt(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"/></label>
      <label className="sm:col-span-2">Next step<input value={nextStep} onChange={(event) => setNextStep(event.target.value)} placeholder="A stage-appropriate action will be used if blank" className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"/></label>
      {stage === "Rejected" && <label className="sm:col-span-2 xl:col-span-4">Rejection reason<input required value={rejectedReason} onChange={(event) => setRejectedReason(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"/></label>}
      <label className="sm:col-span-2 xl:col-span-4">Recruiter note<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none"/></label>
      {stage === "Hired" && <p className="sm:col-span-2 xl:col-span-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">Marking this candidate hired fills the requisition and dispositions the remaining active candidates as position filled.</p>}
      {error && <p className="sm:col-span-2 xl:col-span-4 text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 sm:col-span-2 xl:col-span-4"><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin"/>}Save candidate update</Button><Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button></div>
    </form></CardContent>
  </Card>
}

function nextStage(stage: HiringCandidateStage): HiringCandidateStage | null {
  if (stage === "Applied") return "Screening"
  if (stage === "Screening") return "Interview"
  if (stage === "Interview") return "Offer"
  if (stage === "Offer") return "Hired"
  return null
}

export function HiringWorkspace({ canRequestHiring }: { canRequestHiring: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedFromUrl = searchParams.get("requisition")
  const [data, setData] = useState<HiringOperations | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("active")
  const [department, setDepartment] = useState("")
  const [candidateStage, setCandidateStage] = useState("active")
  const [showCandidateForm, setShowCandidateForm] = useState(false)
  const [candidateUpdate, setCandidateUpdate] = useState<{ candidate: HiringCandidate; stage: HiringCandidateStage } | null>(null)

  async function loadOperations(message = "") {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/hiring", { cache: "no-store" })
      const result = await response.json() as HiringOperations & { error?: string }
      if (!response.ok) throw new Error(result.error || "Hiring operations could not be loaded.")
      setData(result)
      setNotice(message)
      if (message) window.setTimeout(() => setNotice(""), 3200)
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Hiring operations could not be loaded.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/v1/hr/hiring", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as HiringOperations & { error?: string }
        if (!response.ok) throw new Error(result.error || "Hiring operations could not be loaded.")
        return result
      })
      .then((result) => setData(result))
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Hiring operations could not be loaded.")
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const departments = useMemo(() => data ? [...new Set(data.requisitions.map((item) => item.department))].sort() : [], [data])
  const visibleRequisitions = useMemo(() => {
    if (!data) return []
    const normalized = query.trim().toLowerCase()
    return data.requisitions.filter((item) => (status === "all" || status === "active" ? status !== "active" || activeStatuses.has(item.status) : item.status === status)
      && (!department || item.department === department)
      && (!normalized || [item.position, item.department, item.location, item.ownerName, item.id].some((value) => value.toLowerCase().includes(normalized))))
  }, [data, department, query, status])
  const selectedRequisition = data?.requisitions.find((item) => item.id === selectedFromUrl) ?? null
  const activeRequisitions = data?.requisitions.filter((item) => item.canAddCandidate) ?? []
  const visibleCandidates = useMemo(() => {
    if (!data) return []
    return data.candidates.filter((candidate) => (!selectedFromUrl || candidate.requisitionId === selectedFromUrl)
      && (candidateStage === "all" || candidateStage === "active" ? candidateStage !== "active" || activeCandidateStages.has(candidate.stage) : candidate.stage === candidateStage))
  }, [candidateStage, data, selectedFromUrl])

  function selectRequisition(id: string | null) {
    router.replace(id ? `/hiring?requisition=${encodeURIComponent(id)}` : "/hiring", { scroll: false })
  }

  async function decideRequisition(requisition: HiringRequisition, action: "approve" | "reject") {
    setBusyId(requisition.id)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/workflows/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: requisition.id, type: "hiring", action }) })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || "The requisition could not be updated.")
      await loadOperations(result.message || "Requisition updated.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The requisition could not be updated.")
    } finally {
      setBusyId(null)
    }
  }

  if (!data && loading) return <div className="space-y-4"><div className="h-36 animate-pulse rounded-lg bg-muted"/><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-lg bg-muted"/>)}</div></div>
  if (!data) return <Card><CardContent className="p-6 text-sm text-destructive">{error || "Hiring operations could not be loaded."}</CardContent></Card>

  return <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 pb-10">
    <header className="border-b border-border pb-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-2xl font-semibold">Hiring</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Approve headcount, manage requisitions, and move candidates through the recruiting process.</p><p className="mt-2 text-meta text-muted-foreground">Updated {formatWorkspaceDateTime(data.generatedAt)}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void loadOperations()} disabled={loading}><RefreshCw className={cn("size-4", loading && "animate-spin")}/>Refresh</Button>{canRequestHiring && <Button nativeButton={false} variant="outline" render={<Link href="/inbox?new=hiring"/>}><Plus className="size-4"/>New requisition</Button>}<Button onClick={() => setShowCandidateForm(true)} disabled={!activeRequisitions.length}><Plus className="size-4"/>Add candidate</Button></div></div></header>

    {(notice || error) && <div aria-live="polite" className={cn("rounded-md border px-4 py-3 text-xs", error ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200")}>{error || notice}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Metric label="Approval needed" value={data.summary.approvalsRequired.toLocaleString()} detail="Requisitions waiting for HR"/><Metric label="Active roles" value={data.summary.activeRequisitions.toLocaleString()} detail="Requested, open, or at offer"/><Metric label="Active candidates" value={data.summary.activeCandidates.toLocaleString()} detail="Still in the recruiting process"/><Metric label="Interviews" value={data.summary.interviews.toLocaleString()} detail="Candidates at interview"/><Metric label="Offers" value={data.summary.offers.toLocaleString()} detail="Awaiting a response"/><Metric label="Overdue follow-ups" value={data.summary.overdueFollowUps.toLocaleString()} detail="Recruiting actions past due"/></div>

    {showCandidateForm && <AddCandidateForm
      requisitions={activeRequisitions}
      initialRequisitionId={selectedRequisition?.canAddCandidate ? selectedRequisition.id : activeRequisitions[0]?.id ?? ""}
      onCancel={() => setShowCandidateForm(false)}
      onSaved={async (message) => { setShowCandidateForm(false); await loadOperations(message) }}
    />}
    {candidateUpdate && <CandidateUpdateForm
      key={`${candidateUpdate.candidate.id}-${candidateUpdate.stage}`}
      candidate={candidateUpdate.candidate}
      initialStage={candidateUpdate.stage}
      onCancel={() => setCandidateUpdate(null)}
      onSaved={async (message) => { setCandidateUpdate(null); await loadOperations(message) }}
    />}

    {selectedRequisition && <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Selected requisition</CardTitle><CardDescription>{selectedRequisition.id} · {selectedRequisition.department} · {selectedRequisition.location}</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => selectRequisition(null)}>Clear selection</Button>{selectedRequisition.canAddCandidate && <Button onClick={() => setShowCandidateForm(true)}>Add candidate</Button>}{selectedRequisition.canDecide && <><Button variant="outline" disabled={busyId !== null} onClick={() => void decideRequisition(selectedRequisition, "reject")}>Decline</Button><Button disabled={busyId !== null} onClick={() => void decideRequisition(selectedRequisition, "approve")}>Approve</Button></>}<Button nativeButton={false} variant="outline" render={<Link href={selectedRequisition.reviewHref}/>}>Open workflow record</Button></div></CardHeader><CardContent className="grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr_1fr]"><div><p className="text-meta font-semibold text-muted-foreground">Business justification</p><p className="mt-1 text-sm">{selectedRequisition.justification}</p></div><div><p className="text-meta font-semibold text-muted-foreground">Current action</p><p className="mt-1 text-sm">{selectedRequisition.nextAction}</p><p className="mt-1 text-meta text-muted-foreground">Owner: {selectedRequisition.ownerName}</p></div><div><p className="text-meta font-semibold text-muted-foreground">Pipeline</p><p className="mt-1 text-sm">{selectedRequisition.activeCandidateCount} active · {selectedRequisition.interviewCount} interview · {selectedRequisition.offerCount} offer</p><p className="mt-1 text-meta text-muted-foreground">Opened {formatDate(selectedRequisition.openedAt)} · {selectedRequisition.ageDays} days</p></div></CardContent></Card>}

    <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="gap-4 border-b border-border px-5 py-4"><div><CardTitle>Requisition queue</CardTitle><CardDescription>Headcount requests and active roles with an accountable next step.</CardDescription></div><RequisitionFilters query={query} onQuery={setQuery} status={status} onStatus={setStatus} department={department} onDepartment={setDepartment} departments={departments}/></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left"><thead className="bg-muted/50"><tr>{["Role", "Status", "Candidates", "Owner", "Next action", "Due", ""].map((heading) => <th key={heading} className="px-4 py-3 text-muted-foreground">{heading}</th>)}</tr></thead><tbody>{visibleRequisitions.map((item) => <tr key={item.id} aria-current={item.id === selectedFromUrl ? "true" : undefined} className={cn("border-t border-border/60 hover:bg-muted/20", item.id === selectedFromUrl && "bg-accent/45")}><td className="px-4 py-3"><button type="button" onClick={() => selectRequisition(item.id)} className="text-left"><span className="block font-semibold hover:text-primary">{item.position}</span><span className="mt-0.5 block text-meta text-muted-foreground">{item.department} · {item.location}</span></button></td><td className="px-4 py-3"><span className={cn("text-status font-semibold", statusTone(item.status))}>{item.status}</span></td><td className="px-4 py-3"><span className="font-semibold tabular-nums">{item.activeCandidateCount}</span><span className="ml-1 text-meta text-muted-foreground">active</span></td><td className="px-4 py-3"><p>{item.ownerName}</p><p className="text-meta text-muted-foreground">{item.ageDays} days open</p></td><td className="max-w-xs px-4 py-3 text-muted-foreground">{item.nextAction}</td><td className={cn("px-4 py-3 whitespace-nowrap", item.dueDate && item.dueDate < new Date().toISOString().slice(0, 10) && activeStatuses.has(item.status) ? "font-semibold text-destructive" : "text-muted-foreground")}>{formatDate(item.dueDate)}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-2">{item.canDecide && <><Button size="xs" variant="outline" disabled={busyId !== null} onClick={() => void decideRequisition(item, "reject")}>Decline</Button><Button size="xs" disabled={busyId !== null} onClick={() => void decideRequisition(item, "approve")}>Approve</Button></>}{item.canAddCandidate && <Button size="xs" variant="outline" onClick={() => { selectRequisition(item.id); setShowCandidateForm(true) }}>Add candidate</Button>}<Button size="xs" variant="ghost" onClick={() => selectRequisition(item.id)}>Review</Button></div></td></tr>)}</tbody></table></div>{!visibleRequisitions.length && <p className="p-10 text-center text-sm text-muted-foreground">No requisitions match these filters.</p>}<div className="border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground">Showing {visibleRequisitions.length} of {data.requisitions.length} operational requisitions</div></CardContent></Card>

    <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between"><div><CardTitle>Candidate pipeline</CardTitle><CardDescription>{selectedRequisition ? `Candidates for ${selectedRequisition.position}` : "Candidates across active requisitions"}</CardDescription></div><div className="flex flex-wrap gap-1.5">{["active", ...hiringCandidateStages, "all"].map((stage) => <button key={stage} type="button" onClick={() => setCandidateStage(stage)} className={cn("h-8 rounded-md border px-3 text-sm", candidateStage === stage ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:bg-muted")}><span className="capitalize">{stage}</span>{stage !== "all" && <span className="ml-1.5 tabular-nums">{stage === "active" ? data.summary.activeCandidates : data.stageCounts.find((item) => item.stage === stage)?.count ?? 0}</span>}</button>)}</div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left"><thead className="bg-muted/50"><tr>{["Candidate", "Role", "Stage", "Owner", "Next step", "Due", ""].map((heading) => <th key={heading} className="px-4 py-3 text-muted-foreground">{heading}</th>)}</tr></thead><tbody>{visibleCandidates.map((candidate) => { const advance = nextStage(candidate.stage); return <tr key={candidate.id} className="border-t border-border/60 hover:bg-muted/20"><td className="px-4 py-3"><p className="font-semibold">{candidate.fullName}</p><p className="text-meta text-muted-foreground">{candidate.email} · {candidate.source}</p></td><td className="px-4 py-3"><button type="button" className="text-left hover:text-primary" onClick={() => selectRequisition(candidate.requisitionId)}>{candidate.requisitionTitle}<span className="block text-meta text-muted-foreground">{candidate.location}</span></button></td><td className="px-4 py-3"><span className={cn("text-status font-semibold", statusTone(candidate.stage))}>{candidate.stage}</span></td><td className="px-4 py-3">{candidate.ownerName}</td><td className="max-w-xs px-4 py-3 text-muted-foreground">{candidate.nextStep}</td><td className={cn("px-4 py-3 whitespace-nowrap", candidate.isOverdue ? "font-semibold text-destructive" : "text-muted-foreground")}>{formatDate(candidate.nextStepDueAt)}</td><td className="px-4 py-3 text-right">{activeCandidateStages.has(candidate.stage) && <div className="flex justify-end gap-2">{advance && <Button size="xs" onClick={() => setCandidateUpdate({ candidate, stage: advance })}>Advance</Button>}<Button size="xs" variant="outline" onClick={() => setCandidateUpdate({ candidate, stage: "Rejected" })}>Reject</Button><Button size="xs" variant="ghost" onClick={() => setCandidateUpdate({ candidate, stage: candidate.stage })}>Edit</Button></div>}</td></tr>})}</tbody></table></div>{!visibleCandidates.length && <p className="p-10 text-center text-sm text-muted-foreground">No candidates match this pipeline view.</p>}<div className="border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground">Showing {visibleCandidates.length} of {data.candidates.length} candidates</div></CardContent></Card>

    <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle>Recent filled roles</CardTitle><CardDescription>Operational hires recorded from completed requisitions.</CardDescription></CardHeader><CardContent className="divide-y divide-border p-0">{data.recentHires.length ? data.recentHires.map((hire) => <div key={hire.id} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_180px_160px_120px] sm:items-center"><div><p className="font-semibold">{hire.position}</p><p className="text-meta text-muted-foreground">{hire.department} · {hire.location}</p></div><p>{hire.source}</p><p className="text-muted-foreground">Filled {formatDate(hire.hiringDate)}</p><p className="text-right font-semibold tabular-nums">{hire.timeToHireDays === null ? "—" : `${hire.timeToHireDays} days`}</p></div>) : <p className="p-8 text-center text-sm text-muted-foreground">No completed operational hires are recorded.</p>}</CardContent></Card>
  </div>
}
