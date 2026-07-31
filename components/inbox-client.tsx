"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react"

import { WorkflowCreator } from "@/components/workflow-creator"
import type { InboxItem, ManagedEmployee, WorkflowActorContext } from "@/lib/people-types"
import { cn } from "@/lib/utils"

type Filter = "all" | InboxItem["type"]

const filterOptions: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All work" },
  { id: "leave", label: "Leave" },
  { id: "hiring", label: "Hiring" },
  { id: "training", label: "Training" },
]

const groupOrder: InboxItem["type"][] = ["leave", "hiring", "training"]

const groupMeta: Record<InboxItem["type"], { title: string; description: string; href: string }> = {
  leave: { title: "Leave requests", description: "Pending and upcoming requests", href: "/time-off" },
  hiring: { title: "Hiring requests", description: "Open requisitions and approvals", href: "/hiring" },
  training: { title: "Training assignments", description: "Incomplete and mandatory assignments", href: "/learning" },
}

function validFilter(value: string | null): Filter {
  return filterOptions.some((option) => option.id === value) ? value as Filter : "all"
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: parsed.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(parsed)
}

function ItemRow({ item, onAction, disabled }: { item: InboxItem; onAction: (item: InboxItem, action: "approve" | "reject" | "complete") => void; disabled: boolean }) {
  const meta = groupMeta[item.type]
  const dueDate = formatDate(item.dueDate)
  const detailHref = item.employeeId ? `/people/${encodeURIComponent(item.employeeId)}` : meta.href

  return (
    <article
      className="group grid gap-4 border-t border-border/65 px-4 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={detailHref} className="truncate text-sm font-semibold tracking-[-0.01em] hover:text-primary hover:underline">{item.title}</Link>
            {item.priority === "high" && <span className="text-[10px] font-medium text-destructive">High priority</span>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {item.person && <span className="font-medium text-foreground">{item.person}<span className="mx-1.5 text-border">·</span></span>}
            {item.detail}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5 text-[10px] text-muted-foreground">
            <span className="capitalize">{item.status.replaceAll("_", " ")}</span>
            {dueDate && <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{item.type === "leave" ? "Starts" : "Opened"} {dueDate}</span>}
            {item.employeeId && <span>{item.employeeId}</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {item.actions?.includes("approve") ? (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAction(item, "reject")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-rose-800/40 dark:hover:bg-rose-950/20 dark:hover:text-rose-300"
            >
              <X className="size-3.5" /> Decline
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAction(item, "approve")}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[11px] font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Check className="size-3.5" /> Approve
            </button>
          </>
        ) : item.actions?.includes("complete") ? (
          <button type="button" disabled={disabled} onClick={() => onAction(item, "complete")} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[11px] font-semibold text-background disabled:opacity-50"><Check className="size-3.5" />Mark complete</button>
        ) : (
          <Link href={meta.href} aria-label={`Open ${meta.title}`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
    </article>
  )
}

export function InboxClient({ initialItems, actor, people }: { initialItems: InboxItem[]; actor: WorkflowActorContext; people: ManagedEmployee[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [items, setItems] = useState(initialItems)
  const [filter, setFilter] = useState<Filter>(() => validFilter(searchParams.get("type")))
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const counts = useMemo(() => Object.fromEntries(filterOptions.map((option) => [option.id, option.id === "all" ? items.length : items.filter((item) => item.type === option.id).length])) as Record<Filter, number>, [items])
  const visibleGroups = useMemo(() => groupOrder
    .filter((type) => filter === "all" || filter === type)
    .map((type) => ({ type, items: items.filter((item) => item.type === type) }))
    .filter((group) => group.items.length > 0), [filter, items])
  const urgentCount = items.filter((item) => item.priority === "high").length

  function chooseFilter(next: Filter) {
    setFilter(next)
    const url = next === "all" ? "/inbox" : `/inbox?type=${next}`
    router.replace(url, { scroll: false })
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
      window.setTimeout(() => setNotice(""), 2400)
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Inbox refresh failed.")
    } finally {
      setRefreshing(false)
    }
  }

  async function runAction(item: InboxItem, action: "approve" | "reject" | "complete") {
    const snapshot = items
    setBusyId(item.id)
    setError("")
    setNotice("")
    setItems((current) => current.filter((candidate) => !(candidate.type === item.type && candidate.id === item.id)))
    try {
      const response = await fetch("/api/v1/hr/workflows/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: item.id, type: item.type, action }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error === "AUTH_REQUIRED" ? "Sign in is required to update this workflow." : result.error || "The action could not be saved.")
      setNotice(result.message ?? "Workflow updated.")
      window.setTimeout(() => setNotice(""), 3200)
      router.refresh()
    } catch (reason) {
      setItems(snapshot)
      setError(reason instanceof Error ? reason.message : "The action could not be saved.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-10">
      <header className="border-b border-border pb-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">Review leave, hiring, and training items that require action.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-md border border-border bg-background px-3 py-2 text-right"><p className="text-[10px] text-muted-foreground">Open items</p><p className="text-lg font-semibold tabular-nums">{items.length}</p></div>
            <div className="rounded-md border border-border bg-background px-3 py-2 text-right"><p className="text-[10px] text-muted-foreground">High priority</p><p className="text-lg font-semibold tabular-nums">{urgentCount}</p></div>
            <button type="button" onClick={() => void refreshInbox()} disabled={refreshing} className="flex size-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" aria-label="Refresh inbox">
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            </button>
          </div>
        </div>
      </header>

      <WorkflowCreator actor={actor} people={people} initialType={searchParams.get("new") === "leave" ? "leave" : searchParams.get("new") === "hiring" ? "hiring" : searchParams.get("new") === "training" ? "training" : undefined} onCreated={(message) => void refreshInbox(message)} />

      <div className="flex gap-0 overflow-x-auto border-b border-border" role="tablist" aria-label="Inbox filters">
        {filterOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={filter === option.id}
            onClick={() => chooseFilter(option.id)}
            className={cn("inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", filter === option.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {option.label}
            <span className="text-[10px] tabular-nums text-muted-foreground">{counts[option.id]}</span>
          </button>
        ))}
      </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800 dark:border-rose-800/30 dark:bg-rose-950/20 dark:text-rose-200">
            <CircleAlert className="size-4 shrink-0" />{error}
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-200">
            <CheckCircle2 className="size-4 shrink-0" />{notice}
          </div>
        )}

      {refreshing && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Refreshing your work…</div>
      )}

      <div className="space-y-4">
        {visibleGroups.map(({ type, items: groupItems }) => {
          const meta = groupMeta[type]
          return (
            <section key={type} className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby={`inbox-${type}`}>
              <div className="flex items-center gap-3 border-b border-border/65 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 flex-1"><h3 id={`inbox-${type}`} className="text-sm font-semibold">{meta.title}</h3><p className="text-[10px] text-muted-foreground">{meta.description}</p></div>
                <span className="text-xs tabular-nums text-muted-foreground">{groupItems.length}</span>
                <Link href={meta.href} className="hidden text-[10px] font-medium text-primary hover:underline sm:inline-flex">Open</Link>
              </div>
                {groupItems.map((item) => <ItemRow key={`${item.type}-${item.id}`} item={item} onAction={runAction} disabled={busyId !== null} />)}
            </section>
          )
        })}
      </div>

      {!visibleGroups.length && (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-border bg-card px-6 text-center">
          <h3 className="text-base font-semibold">No open items</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">There are no items in {filter === "all" ? "the inbox" : `the ${filter} queue`}.</p>
          {filter !== "all" && <button type="button" onClick={() => chooseFilter("all")} className="mt-4 text-xs font-semibold text-primary hover:underline">View all work</button>}
        </div>
      )}

    </div>
  )
}
