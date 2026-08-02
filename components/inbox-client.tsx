"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw } from "lucide-react"

import { WorkflowCreator } from "@/components/workflow-creator"
import type { InboxItem, ManagedEmployee, WorkflowActorContext } from "@/lib/people-types"
import { cn } from "@/lib/utils"
import { MetricStrip, WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"

type QueueView = "my_work" | "decisions" | "managers" | "employees" | "overdue" | "completed"
type DomainFilter = "all" | InboxItem["type"]

const queueOptions: Array<{ id: QueueView; label: string }> = [
  { id: "my_work", label: "My work" },
  { id: "decisions", label: "Awaiting my decision" },
  { id: "managers", label: "Assigned to managers" },
  { id: "employees", label: "Awaiting employee" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
]

const domainOptions: Array<{ id: DomainFilter; label: string }> = [
  { id: "all", label: "All work" },
  { id: "leave", label: "Leave" },
  { id: "hiring", label: "Hiring" },
  { id: "training", label: "Training" },
]

const domainMeta: Record<InboxItem["type"], { label: string }> = {
  leave: { label: "Leave" },
  hiring: { label: "Hiring" },
  training: { label: "Training" },
}

function validQueue(value: string | null): QueueView {
  return queueOptions.some((option) => option.id === value) ? value as QueueView : "my_work"
}

function validDomain(value: string | null): DomainFilter {
  return domainOptions.some((option) => option.id === value) ? value as DomainFilter : "all"
}

function matchesQueue(item: InboxItem, queue: QueueView): boolean {
  if (queue === "my_work") return !item.isCompleted
  if (queue === "decisions") return item.requiresDecision && !item.isCompleted
  if (queue === "managers") return item.assignedTo === "manager" && !item.isCompleted
  if (queue === "employees") return item.assignedTo === "employee" && !item.isCompleted
  if (queue === "overdue") return item.slaStatus === "overdue" && !item.isCompleted
  return item.isCompleted
}

function queueForItem(item: InboxItem): QueueView {
  if (item.isCompleted) return "completed"
  if (item.requiresDecision) return "decisions"
  if (item.assignedTo === "manager") return "managers"
  if (item.assignedTo === "employee") return "employees"
  return "my_work"
}

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled"
  const normalized = value.slice(0, 10)
  const parsed = new Date(`${normalized}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: parsed.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(parsed)
}

function slaLabel(item: InboxItem): string {
  if (item.slaStatus === "overdue") return "Overdue"
  if (item.slaStatus === "due_today") return "Due today"
  if (item.slaStatus === "due_soon") return "Due soon"
  if (item.slaStatus === "complete") return "Completed"
  if (item.slaStatus === "unscheduled") return "No due date"
  return "On track"
}

function statusTone(item: InboxItem): string {
  if (item.slaStatus === "overdue" || item.slaStatus === "due_today") return "text-destructive"
  if (item.isCompleted) return "text-emerald-700 dark:text-emerald-300"
  return "text-muted-foreground"
}

function ItemRow({ item, onAction, disabled, selected }: { item: InboxItem; onAction: (item: InboxItem, action: "approve" | "reject" | "complete") => void; disabled: boolean; selected: boolean }) {
  const meta = domainMeta[item.type]

  return (
    <article id={`work-${item.id}`} aria-current={selected ? "true" : undefined} className={cn("scroll-mt-24 border-t border-border/70 px-4 py-3.5 first:border-t-0", selected && "bg-accent/45 ring-1 ring-inset ring-primary/30")}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-meta font-semibold text-muted-foreground">{meta.label}</span>
            <span className={cn("text-status font-semibold", statusTone(item))}>{slaLabel(item)}</span>
            {item.priority === "high" && !item.isCompleted && <span className="text-status font-semibold text-destructive">High priority</span>}
          </div>
          <Link href={item.recordHref} className="mt-1.5 block text-sm font-semibold hover:text-primary hover:underline">{item.title}</Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.person && <span className="font-medium text-foreground">{item.person} · </span>}
            {item.detail}
          </p>

          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-meta text-muted-foreground"><span><b className="text-foreground">Action:</b> {item.nextAction}</span><span><b className="text-foreground">Owner:</b> {item.owner}</span><span><b className="text-foreground">Due:</b> {formatDate(item.dueDate)}</span></div>

          {(item.requestContext.length > 0 || item.attentionReason || item.completionEffect) && <details className="mt-2 text-meta"><summary className="w-fit font-semibold text-primary">View request details</summary><div className="mt-2 grid gap-3 rounded-md border border-border/70 bg-muted/20 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {item.requestContext.map((context) => <div key={context.label} className={context.label.toLowerCase().includes("justification") || context.label.toLowerCase().includes("note") ? "sm:col-span-2 xl:col-span-3" : undefined}><p className="font-semibold text-muted-foreground">{context.label}</p><p className="mt-0.5 text-foreground">{context.value}</p></div>)}
            <div><p className="font-semibold text-muted-foreground">Why it needs attention</p><p className="mt-0.5 text-foreground">{item.attentionReason}</p></div>
            <div><p className="font-semibold text-muted-foreground">Current state</p><p className="mt-0.5 text-foreground">{item.status} · {item.timeInStatusDays} day{item.timeInStatusDays === 1 ? "" : "s"}</p></div>
            <div><p className="font-semibold text-muted-foreground">After completion</p><p className="mt-0.5 text-foreground">{item.completionEffect}</p></div>
          </div></details>}

          {item.blockedReason && <p className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs"><span className="font-semibold">Blocked:</span> {item.blockedReason}</p>}
          {item.isCompleted && item.completionNotes && <p className="mt-3 text-xs text-muted-foreground">Completion record: {item.completionNotes}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2 xl:pt-4">
          <Link href={item.recordHref} className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">View record</Link>
          {item.actions?.includes("approve") ? (
            <>
              <button type="button" disabled={disabled} onClick={() => onAction(item, "reject")} className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">Decline</button>
              <button type="button" disabled={disabled} onClick={() => onAction(item, "approve")} className="inline-flex h-9 items-center rounded-md bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-50">Approve</button>
            </>
          ) : item.actions?.includes("complete") ? (
            <button type="button" disabled={disabled} onClick={() => onAction(item, "complete")} className="inline-flex h-9 items-center rounded-md bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-50">Mark complete</button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function InboxClient({ initialItems, actor, people }: { initialItems: InboxItem[]; actor: WorkflowActorContext; people: ManagedEmployee[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get("item")
  const initiallySelected = selectedId ? initialItems.find((item) => item.id === selectedId) : undefined
  const [items, setItems] = useState(initialItems)
  const [queue, setQueue] = useState<QueueView>(() => searchParams.get("view") ? validQueue(searchParams.get("view")) : initiallySelected ? queueForItem(initiallySelected) : "my_work")
  const [domain, setDomain] = useState<DomainFilter>(() => searchParams.get("type") ? validDomain(searchParams.get("type")) : initiallySelected?.type ?? "all")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const queueCounts = useMemo(() => Object.fromEntries(queueOptions.map((option) => [option.id, items.filter((item) => matchesQueue(item, option.id)).length])) as Record<QueueView, number>, [items])
  const visibleItems = useMemo(() => items.filter((item) => matchesQueue(item, queue) && (domain === "all" || item.type === domain)), [domain, items, queue])
  const openCount = items.filter((item) => !item.isCompleted).length
  const overdueCount = items.filter((item) => item.slaStatus === "overdue" && !item.isCompleted).length
  const decisionCount = items.filter((item) => item.requiresDecision && !item.isCompleted).length

  useEffect(() => {
    if (!selectedId || !visibleItems.some((item) => item.id === selectedId)) return
    const frame = window.requestAnimationFrame(() => document.getElementById(`work-${selectedId}`)?.scrollIntoView({ block: "center" }))
    return () => window.cancelAnimationFrame(frame)
  }, [selectedId, visibleItems])

  function updateUrl(nextQueue: QueueView, nextDomain: DomainFilter) {
    const params = new URLSearchParams()
    if (nextQueue !== "my_work") params.set("view", nextQueue)
    if (nextDomain !== "all") params.set("type", nextDomain)
    router.replace(params.size ? `/inbox?${params.toString()}` : "/inbox", { scroll: false })
  }

  function chooseQueue(next: QueueView) {
    setQueue(next)
    updateUrl(next, domain)
  }

  function chooseDomain(next: DomainFilter) {
    setDomain(next)
    updateUrl(queue, next)
  }

  async function refreshInbox(successMessage = "Inbox is up to date.") {
    setRefreshing(true)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/inbox", { cache: "no-store" })
      const result = await response.json() as { items?: InboxItem[]; error?: string }
      if (!response.ok || !result.items) throw new Error(result.error === "AUTH_REQUIRED" ? "Sign in is required to refresh the inbox." : result.error || "Inbox refresh failed.")
      setItems(result.items)
      setNotice(successMessage)
      window.setTimeout(() => setNotice(""), 2800)
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Inbox refresh failed.")
    } finally {
      setRefreshing(false)
    }
  }

  async function runAction(item: InboxItem, action: "approve" | "reject" | "complete") {
    setBusyId(item.id)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/v1/hr/workflows/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, type: item.type, action }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error === "AUTH_REQUIRED" ? "Sign in is required to update this workflow." : result.error || "The action could not be saved.")
      await refreshInbox(result.message ?? "Workflow updated.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The action could not be saved.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <WorkspacePage>
      <WorkspaceHeader
        title="Inbox"
        description="Requests, decisions, and follow-ups across HR operations."
        actions={<button type="button" onClick={() => void refreshInbox()} disabled={refreshing} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />Refresh</button>}
      />

      <MetricStrip metrics={[
        { label: "Open", value: openCount },
        { label: "Awaiting decision", value: decisionCount },
        { label: "Overdue", value: overdueCount },
      ]} />

      <WorkflowCreator actor={actor} people={people} initialType={searchParams.get("new") === "leave" ? "leave" : searchParams.get("new") === "hiring" ? "hiring" : searchParams.get("new") === "training" ? "training" : undefined} onCreated={(message) => void refreshInbox(message)} />

      <div className="overflow-x-auto border-b border-border" role="tablist" aria-label="Work queue">
        <div className="flex min-w-max">
          {queueOptions.map((option) => <button key={option.id} type="button" role="tab" aria-selected={queue === option.id} onClick={() => chooseQueue(option.id)} className={cn("inline-flex h-11 items-center gap-2 border-b-2 px-3 text-xs font-medium", queue === option.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{option.label}<span className="text-meta tabular-nums text-muted-foreground">{queueCounts[option.id]}</span></button>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="Domain filters">
        <span className="mr-1 text-meta font-semibold text-muted-foreground">Filter</span>
        {domainOptions.map((option) => <button key={option.id} type="button" onClick={() => chooseDomain(option.id)} className={cn("h-8 rounded-md border px-3 text-xs font-medium", domain === option.id ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>{option.label}</button>)}
      </div>

      {error && <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800 dark:border-rose-800/30 dark:bg-rose-950/20 dark:text-rose-200"><CircleAlert className="size-4 shrink-0" />{error}</div>}
      {notice && <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-200"><CheckCircle2 className="size-4 shrink-0" />{notice}</div>}
      {refreshing && <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Refreshing work queue</div>}

      {visibleItems.length ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={`${queueOptions.find((option) => option.id === queue)?.label} items`}>
          {visibleItems.map((item) => <ItemRow key={`${item.type}-${item.id}`} item={item} onAction={runAction} disabled={busyId !== null} selected={item.id === selectedId} />)}
        </section>
      ) : (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 text-center"><h3 className="text-base font-semibold">No matching work</h3><p className="mt-2 max-w-sm text-sm text-muted-foreground">There are no items in this queue for the selected domain.</p>{domain !== "all" && <button type="button" onClick={() => chooseDomain("all")} className="mt-4 text-xs font-semibold text-primary hover:underline">Clear domain filter</button>}</div>
      )}
    </WorkspacePage>
  )
}
