"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, CircleAlert, LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { WorkflowCreator, type WorkflowType } from "@/components/workflow-creator"
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import type { InboxOperations } from "@/lib/inbox-types"
import type { LeaveOperationRecord, LeaveOperations } from "@/lib/leave-types"
import { safeReturnTo, withReturnTo } from "@/lib/navigation"
import type { InboxItem, ManagedEmployee, WorkflowActorContext } from "@/lib/people-types"
import { cn } from "@/lib/utils"

type QueueView = "my_work" | "decisions" | "overdue" | "managers" | "employees" | "open" | "completed"
type DomainFilter = "all" | InboxItem["type"]
type WorkflowAction = "approve" | "reject" | "complete"

const queueOptions: Array<{ id: QueueView; label: string; count: keyof InboxOperations["summary"] }> = [
  { id: "my_work", label: "Assigned to me", count: "assignedToMe" },
  { id: "decisions", label: "Decisions", count: "decisions" },
  { id: "overdue", label: "Overdue", count: "overdue" },
  { id: "managers", label: "Manager queue", count: "managerQueue" },
  { id: "employees", label: "Employee queue", count: "employeeQueue" },
  { id: "open", label: "All open", count: "allOpen" },
  { id: "completed", label: "Completed", count: "completed" },
]

const domainOptions: Array<{ id: DomainFilter; label: string }> = [
  { id: "all", label: "All domains" },
  { id: "leave", label: "Leave" },
  { id: "hiring", label: "Talent acquisition" },
  { id: "training", label: "Learning" },
  { id: "insight", label: "Insights" },
  { id: "reimbursement", label: "Reimbursements" },
  { id: "case", label: "Employee requests" },
  { id: "onboarding", label: "Onboarding" },
  { id: "offboarding", label: "Exit management" },
]

const domainLabel: Record<InboxItem["type"], string> = { leave: "Leave", hiring: "Talent acquisition", training: "Learning", insight: "Insights", reimbursement: "Reimbursement", case: "Employee request", onboarding: "Onboarding", offboarding: "Exit management" }
const PAGE_SIZE = 10
const MIN_AUDIT_NOTE_LENGTH = 10
const inputClass = "h-9 w-full rounded-md border border-border bg-background px-3 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
const textareaClass = "min-h-20 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"

function validQueue(value: string | null): QueueView {
  return queueOptions.some((option) => option.id === value) ? value as QueueView : "my_work"
}

function validDomain(value: string | null): DomainFilter {
  return domainOptions.some((option) => option.id === value) ? value as DomainFilter : "all"
}

function assignedToActor(item: InboxItem, actorEmail: string): boolean {
  return !item.isCompleted && (item.actionable || item.ownerEmail?.toLowerCase() === actorEmail.toLowerCase())
}

function matchesQueue(item: InboxItem, queue: QueueView, actorEmail: string): boolean {
  if (queue === "my_work") return assignedToActor(item, actorEmail)
  if (queue === "decisions") return !item.isCompleted && item.requiresDecision && item.actionable
  if (queue === "overdue") return !item.isCompleted && item.slaStatus === "overdue"
  if (queue === "managers") return !item.isCompleted && item.assignedTo === "manager"
  if (queue === "employees") return !item.isCompleted && item.assignedTo === "employee"
  if (queue === "open") return !item.isCompleted
  return item.isCompleted
}

function queueForItem(item: InboxItem, actorEmail: string): QueueView {
  if (item.isCompleted) return "completed"
  if (item.requiresDecision && item.actionable) return "decisions"
  if (assignedToActor(item, actorEmail)) return "my_work"
  return "open"
}

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled"
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: parsed.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(parsed)
}

function dueLabel(item: InboxItem): string {
  if (item.slaStatus === "overdue") return `Overdue · ${formatDate(item.dueDate)}`
  if (item.slaStatus === "due_today") return "Due today"
  if (item.slaStatus === "complete") return item.completedAt ? `Completed ${formatDate(item.completedAt)}` : "Completed"
  return item.dueDate ? `Due ${formatDate(item.dueDate)}` : "No due date"
}

function actionLabel(item: InboxItem): string {
  if (item.actions?.includes("approve")) return "Decide"
  if (item.actions?.includes("complete")) return "Complete"
  return "Open"
}

function ItemRow({ item, onAction, selected, returnTo }: { item: InboxItem; onAction: (item: InboxItem) => void; selected: boolean; returnTo: string }) {
  const recordHref = withReturnTo(item.recordHref, returnTo)
  const hasAction = Boolean(item.actions?.length)
  return (
    <article id={`work-${item.id}`} aria-current={selected ? "true" : undefined} className={cn("scroll-mt-24 border-t border-border/70 px-4 py-3 first:border-t-0", selected && "bg-accent/45 ring-1 ring-inset ring-primary/30")}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_130px_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-status font-semibold">
            <span className="text-muted-foreground">{domainLabel[item.type]}</span>
            {item.priority === "high" && !item.isCompleted && <span className="text-destructive">High priority</span>}
          </div>
          <Link href={recordHref} className="mt-1 block truncate text-card-title font-semibold hover:text-primary hover:underline">{item.title}</Link>
          <p className="mt-0.5 truncate text-meta text-muted-foreground">{item.person ? `${item.person} · ` : ""}{item.detail}</p>
          <p className="mt-1 line-clamp-2 text-meta text-muted-foreground">{item.nextAction}</p>
        </div>
        <div className="min-w-0 text-meta">
          <p className="truncate font-semibold text-foreground">{item.owner}</p>
          <p className="truncate text-muted-foreground">{item.assignedTo === "employee" ? "Employee action" : item.assignedTo === "manager" ? "Manager action" : "People team"}</p>
        </div>
        <p className={cn("whitespace-nowrap text-meta", (item.slaStatus === "overdue" || item.slaStatus === "due_today") && !item.isCompleted ? "font-semibold text-destructive" : "text-muted-foreground")}>{dueLabel(item)}</p>
        <div className="flex justify-end gap-2">
          {hasAction ? <Button size="xs" onClick={() => onAction(item)}>{actionLabel(item)}</Button> : <Button nativeButton={false} size="xs" variant="outline" render={<Link href={recordHref} />}>Open</Button>}
        </div>
      </div>
    </article>
  )
}

function ActionDialog({ pending, leave, note, score, busy, error, onActionChange, onNoteChange, onScoreChange, onClose, onSubmit }: {
  pending: { item: InboxItem; action: WorkflowAction }
  leave: LeaveOperationRecord | null
  note: string
  score: string
  busy: boolean
  error: string
  onActionChange: (action: WorkflowAction) => void
  onNoteChange: (note: string) => void
  onScoreChange: (score: string) => void
  onClose: () => void
  onSubmit: (event: React.FormEvent) => void
}) {
  const { item, action } = pending
  const isDecision = item.actions?.includes("approve")
  const declineNeedsReason = action === "reject"
  const noteIsRequired = declineNeedsReason || item.type === "case"
  const noteLength = note.trim().length
  return <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <button type="button" aria-label="Close action" className="absolute inset-0 bg-slate-950/45" onClick={() => !busy && onClose()} />
    <form noValidate onSubmit={onSubmit} className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background shadow-xl">
      <header className="border-b border-border px-5 py-4 pr-14">
        <h2 className="text-section font-semibold">{isDecision ? item.type === "leave" ? "Leave decision" : item.type === "reimbursement" ? "Reimbursement decision" : item.type === "onboarding" ? "Onboarding verification" : "Headcount decision" : item.type === "case" ? "Resolve employee request" : "Record course completion"}</h2>
        <p className="mt-0.5 text-description text-muted-foreground">{item.title}{item.person ? ` · ${item.person}` : ""}</p>
      </header>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute right-5 top-5 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      <div className="space-y-4 p-5">
        <div className="grid gap-3 rounded-md border border-border bg-muted/25 p-3 sm:grid-cols-2">
          {item.requestContext.map((context) => <div key={context.label} className={context.label.toLowerCase().includes("justification") || context.label.toLowerCase().includes("note") ? "sm:col-span-2" : undefined}><p className="text-label font-semibold text-muted-foreground">{context.label}</p><p className="mt-0.5 text-body">{context.value}</p></div>)}
          {item.type === "leave" && leave && <div className="sm:col-span-2 border-t border-border pt-3"><p className="text-label font-semibold text-muted-foreground">Department coverage</p><p className="mt-0.5 text-body">{leave.coverage.approvedAway} of {leave.coverage.departmentHeadcount} employees already have approved overlapping leave; {leave.coverage.pendingRequests} other request{leave.coverage.pendingRequests === 1 ? " is" : "s are"} pending.</p></div>}
        </div>

        {isDecision && <div>
          <span className="mb-1.5 block text-label font-semibold">Decision</span>
          <div className="flex gap-2">
            <Button type="button" variant={action === "approve" ? "default" : "outline"} onClick={() => onActionChange("approve")}>Approve</Button>
            <Button type="button" variant={action === "reject" ? "destructive" : "outline"} onClick={() => onActionChange("reject")}>Decline</Button>
          </div>
        </div>}

        {item.type === "training" && <label className="block"><span className="mb-1.5 block text-label font-semibold">Assessment score</span><input type="number" min="0" max="100" step="1" value={score} onChange={(event) => onScoreChange(event.target.value)} className={inputClass} placeholder="Optional, 0–100" /></label>}
        <label className="block">
          <span className="mb-1.5 block text-label font-semibold">{declineNeedsReason ? "Reason" : item.type === "training" ? "Completion note" : item.type === "case" ? "Resolution" : "Decision note"}</span>
          <textarea aria-describedby={noteIsRequired ? "workflow-note-requirement" : undefined} required={noteIsRequired} value={note} onChange={(event) => onNoteChange(event.target.value)} className={textareaClass} placeholder={declineNeedsReason ? "Record a clear reason for the requester and audit history" : item.type === "case" ? "Record the resolution shared with the employee" : "Optional context for the audit history"} />
          {noteIsRequired && <span id="workflow-note-requirement" className={cn("mt-1 block text-meta", noteLength > 0 && noteLength < MIN_AUDIT_NOTE_LENGTH ? "text-destructive" : "text-muted-foreground")}>{noteLength < MIN_AUDIT_NOTE_LENGTH ? `${MIN_AUDIT_NOTE_LENGTH - noteLength} more character${MIN_AUDIT_NOTE_LENGTH - noteLength === 1 ? "" : "s"} required` : "Ready to save to the audit history"}</span>}
        </label>
        {error && <p role="alert" className="text-meta text-destructive">{error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" variant={action === "reject" ? "destructive" : "default"} disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin" />}{action === "approve" ? "Approve request" : action === "reject" ? "Decline request" : item.type === "case" ? "Resolve request" : "Record completion"}</Button>
      </footer>
    </form>
  </div>
}

export function InboxClient({ initialData, actor, people }: { initialData: InboxOperations; actor: WorkflowActorContext; people: ManagedEmployee[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get("returnTo"))
  const selectedId = searchParams.get("item")
  const initiallySelected = selectedId ? initialData.items.find((item) => item.id === selectedId) : undefined
  const [data, setData] = useState(initialData)
  const [queue, setQueue] = useState<QueueView>(() => searchParams.get("view") ? validQueue(searchParams.get("view")) : initiallySelected ? queueForItem(initiallySelected, actor.email) : "my_work")
  const [domain, setDomain] = useState<DomainFilter>(() => searchParams.get("type") ? validDomain(searchParams.get("type")) : initiallySelected?.type ?? "all")
  const [query, setQuery] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [page, setPage] = useState(0)
  const [pending, setPending] = useState<{ item: InboxItem; action: WorkflowAction } | null>(null)
  const [actionNote, setActionNote] = useState("")
  const [assessmentScore, setAssessmentScore] = useState("")
  const [actionError, setActionError] = useState("")
  const [actionBusy, setActionBusy] = useState(false)
  const [leaveContext, setLeaveContext] = useState<LeaveOperationRecord | null>(null)

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return data.items.filter((item) => matchesQueue(item, queue, actor.email)
      && (domain === "all" || item.type === domain)
      && (!normalized || [item.id, item.title, item.detail, item.person ?? "", item.owner, item.nextAction].some((value) => value.toLowerCase().includes(normalized))))
  }, [actor.email, data.items, domain, query, queue])
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE))
  const pagedItems = visibleItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const currentInboxHref = useMemo(() => {
    const params = new URLSearchParams()
    if (queue !== "my_work") params.set("view", queue)
    if (domain !== "all") params.set("type", domain)
    if (selectedId) params.set("item", selectedId)
    if (returnTo) params.set("returnTo", returnTo)
    return `/inbox${params.size ? `?${params.toString()}` : ""}`
  }, [domain, queue, returnTo, selectedId])

  useEffect(() => {
    if (!selectedId || !pagedItems.some((item) => item.id === selectedId)) return
    const frame = window.requestAnimationFrame(() => document.getElementById(`work-${selectedId}`)?.scrollIntoView({ block: "center" }))
    return () => window.cancelAnimationFrame(frame)
  }, [pagedItems, selectedId])

  function updateUrl(nextQueue: QueueView, nextDomain: DomainFilter) {
    const params = new URLSearchParams()
    if (nextQueue !== "my_work") params.set("view", nextQueue)
    if (nextDomain !== "all") params.set("type", nextDomain)
    if (returnTo) params.set("returnTo", returnTo)
    router.replace(params.size ? `/inbox?${params.toString()}` : "/inbox", { scroll: false })
  }

  function updateWorkflowType(next: WorkflowType | null) {
    const params = new URLSearchParams(currentInboxHref.split("?")[1] ?? "")
    params.delete("item")
    if (next) params.set("new", next); else params.delete("new")
    const href = `/inbox${params.size ? `?${params.toString()}` : ""}`
    if (next) router.push(href, { scroll: false }); else router.replace(href, { scroll: false })
  }

  async function refreshInbox(successMessage = "Inbox is up to date.") {
    setRefreshing(true)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/inbox", { cache: "no-store" })
      const result = await response.json() as InboxOperations & { error?: string }
      if (!response.ok || !result.items || !result.summary) throw new Error(result.error === "AUTH_REQUIRED" ? "Sign in is required to refresh the inbox." : result.error || "Inbox refresh failed.")
      setData(result)
      setNotice(successMessage)
      window.setTimeout(() => setNotice(""), 2800)
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Inbox refresh failed.")
    } finally {
      setRefreshing(false)
    }
  }

  async function openAction(item: InboxItem) {
    setActionError("")
    setActionNote("")
    setAssessmentScore("")
    setLeaveContext(null)
    setPending({ item, action: item.actions?.includes("approve") ? "approve" : "complete" })
    if (item.type !== "leave") return
    try {
      const response = await fetch(`/api/v1/hr/leave?id=${encodeURIComponent(item.id)}`, { cache: "no-store" })
      const result = await response.json() as LeaveOperations & { error?: string }
      if (!response.ok) throw new Error(result.error || "Leave coverage could not be loaded.")
      setLeaveContext(result.requests.find((row) => row.id === item.id) ?? null)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Leave coverage could not be loaded.")
    }
  }

  async function submitAction(event: React.FormEvent) {
    event.preventDefault()
    if (!pending) return
    const noteIsRequired = pending.action === "reject" || pending.item.type === "case"
    const normalizedNote = actionNote.trim()
    if (noteIsRequired && normalizedNote.length < MIN_AUDIT_NOTE_LENGTH) {
      setActionError(`Enter at least ${MIN_AUDIT_NOTE_LENGTH} characters so the requester has a clear outcome.`)
      return
    }
    setActionBusy(true)
    setActionError("")
    try {
      const { item, action } = pending
      const request = item.type === "leave"
        ? { url: `/api/v1/hr/leave/${encodeURIComponent(item.id)}/decision`, method: "POST", body: { decision: action === "approve" ? "Approved" : "Rejected", note: normalizedNote } }
        : item.type === "training"
          ? { url: `/api/v1/hr/learning/assignments/${encodeURIComponent(item.id)}`, method: "PATCH", body: { assessmentScore: assessmentScore ? Number(assessmentScore) : null, note: normalizedNote } }
          : { url: "/api/v1/hr/workflows/action", method: "POST", body: { id: item.id, type: item.type, action, note: normalizedNote } }
      const response = await fetch(request.url, { method: request.method, headers: { "content-type": "application/json" }, body: JSON.stringify(request.body) })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error === "AUTH_REQUIRED" ? "Sign in is required to update this work item." : result.error || "The update could not be saved.")
      setPending(null)
      await refreshInbox(result.message || "Work item updated.")
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "The update could not be saved.")
    } finally {
      setActionBusy(false)
    }
  }

  const selectedWorkflow = searchParams.get("new") === "leave" ? "leave" : searchParams.get("new") === "hiring" ? "hiring" : undefined
  return (
    <WorkspacePage>
      <WorkspaceHeader
        title="Inbox"
        description="Approvals and assigned work."
        actions={<div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refreshInbox()} disabled={refreshing}>{refreshing && <LoaderCircle className="size-3.5 animate-spin" />}Refresh</Button>
          <details className="relative">
            <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-md bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary/85">New</summary>
            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-border bg-card p-1 shadow-lg">
              <button type="button" onClick={() => updateWorkflowType("leave")} className="block w-full rounded px-3 py-2 text-left text-body hover:bg-muted">Request leave</button>
              {actor.canRequestHiring && <button type="button" onClick={() => updateWorkflowType("hiring")} className="block w-full rounded px-3 py-2 text-left text-body hover:bg-muted">Request position</button>}
              {actor.canAssignTraining && <Link href={withReturnTo("/courses?new=course", "/inbox")} className="block rounded px-3 py-2 text-body hover:bg-muted">Assign course</Link>}
            </div>
          </details>
        </div>}
      />

      <WorkflowCreator actor={actor} people={people} initialType={selectedWorkflow} showLauncher={false} onTypeChange={updateWorkflowType} onCreated={(message) => void refreshInbox(message)} />

      <section className="grid gap-2 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(220px,1fr)_190px_170px]" aria-label="Inbox filters">
        <label><span className="sr-only">Search work</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} placeholder="Search work, owner, or employee" className={inputClass} /></label>
        <label><span className="sr-only">Work queue</span><select value={queue} onChange={(event) => { const next = event.target.value as QueueView; setQueue(next); setPage(0); updateUrl(next, domain) }} className={inputClass}>{queueOptions.map((option) => <option key={option.id} value={option.id}>{option.label} ({Number(data.summary[option.count]).toLocaleString()})</option>)}</select></label>
        <label><span className="sr-only">Work domain</span><select value={domain} onChange={(event) => { const next = event.target.value as DomainFilter; setDomain(next); setPage(0); updateUrl(queue, next) }} className={inputClass}>{domainOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      </section>

      {error && <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-meta font-semibold text-rose-800 dark:border-rose-800/30 dark:bg-rose-950/20 dark:text-rose-200"><CircleAlert className="size-4 shrink-0" />{error}</div>}
      {notice && <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-meta font-semibold text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-200"><CheckCircle2 className="size-4 shrink-0" />{notice}</div>}

      <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={`${queueOptions.find((option) => option.id === queue)?.label} items`}>
        <header className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2.5">
          <p className="text-card-title font-semibold">{queueOptions.find((option) => option.id === queue)?.label}</p>
          <p className="text-meta text-muted-foreground">{visibleItems.length.toLocaleString()} item{visibleItems.length === 1 ? "" : "s"}</p>
        </header>
        {pagedItems.length ? pagedItems.map((item) => <ItemRow key={`${item.type}-${item.id}`} item={item} onAction={(selected) => void openAction(selected)} selected={item.id === selectedId} returnTo={currentInboxHref} />) : <div className="flex min-h-[160px] flex-col items-center justify-center px-6 text-center"><h3 className="text-subsection font-semibold">No matching work</h3><p className="mt-1 text-meta text-muted-foreground">Change the queue, domain, or search filter.</p></div>}
        {visibleItems.length > PAGE_SIZE && <footer className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-3"><p className="text-meta text-muted-foreground">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, visibleItems.length)} of {visibleItems.length}</p><div className="flex gap-2"><Button size="xs" variant="outline" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button><Button size="xs" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}>Next</Button></div></footer>}
      </section>

      {pending && <ActionDialog pending={pending} leave={leaveContext} note={actionNote} score={assessmentScore} busy={actionBusy} error={actionError} onActionChange={(action) => setPending({ ...pending, action })} onNoteChange={setActionNote} onScoreChange={setAssessmentScore} onClose={() => !actionBusy && setPending(null)} onSubmit={submitAction} />}
    </WorkspacePage>
  )
}
