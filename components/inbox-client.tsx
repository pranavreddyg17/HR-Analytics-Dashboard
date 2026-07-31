"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  GraduationCap,
  Inbox,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { Badge } from "@/components/ui/badge"
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

const groupMeta: Record<InboxItem["type"], { title: string; description: string; icon: typeof Inbox; iconClass: string; href: string }> = {
  leave: { title: "Leave requests", description: "Review upcoming time away", icon: CalendarCheck2, iconClass: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300", href: "/time-off" },
  hiring: { title: "Hiring follow-ups", description: "Open roles and offers in motion", icon: BriefcaseBusiness, iconClass: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300", href: "/hiring" },
  training: { title: "Training & compliance", description: "Mandatory assignments needing attention", icon: GraduationCap, iconClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", href: "/learning" },
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
  const Icon = meta.icon
  const dueDate = formatDate(item.dueDate)
  const detailHref = item.employeeId ? `/people/${encodeURIComponent(item.employeeId)}` : meta.href

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="group grid gap-4 border-t border-border/65 px-4 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
    >
      <div className="flex min-w-0 items-start gap-3.5">
        <span className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl", meta.iconClass)}><Icon className="size-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={detailHref} className="truncate text-sm font-semibold tracking-[-0.01em] hover:text-primary hover:underline">{item.title}</Link>
            {item.priority === "high" && <Badge variant="destructive" className="h-4.5 px-1.5 text-[9px]">Priority</Badge>}
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

      <div className="flex items-center gap-2 pl-[3.4rem] sm:pl-0">
        {item.actions?.includes("approve") ? (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAction(item, "reject")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-rose-800/40 dark:hover:bg-rose-950/20 dark:hover:text-rose-300"
            >
              <X className="size-3.5" /> Decline
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAction(item, "approve")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[11px] font-semibold text-background shadow-sm transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Check className="size-3.5" /> Approve
            </button>
          </>
        ) : item.actions?.includes("complete") ? (
          <button type="button" disabled={disabled} onClick={() => onAction(item, "complete")} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[11px] font-semibold text-background shadow-sm transition-transform hover:-translate-y-px disabled:opacity-50"><Check className="size-3.5" />Mark complete</button>
        ) : (
          <Link href={meta.href} aria-label={`Open ${meta.title}`} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
    </motion.article>
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
      <header className="rounded-lg border border-border bg-card px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-primary"><Inbox className="size-4" />Workflow queue</div>
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Inbox</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Review pending decisions, training assignments, and recruitment requests.</p>
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

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card p-1.5 shadow-sm" role="tablist" aria-label="Inbox filters">
        {filterOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={filter === option.id}
            onClick={() => chooseFilter(option.id)}
            className={cn("inline-flex h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", filter === option.id ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground")}
          >
            {option.label}
            <span className={cn("min-w-5 rounded-full px-1.5 py-0.5 text-[9px] tabular-nums", filter === option.id ? "bg-background/15" : "bg-muted")}>{counts[option.id]}</span>
          </button>
        ))}
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800 dark:border-rose-800/30 dark:bg-rose-950/20 dark:text-rose-200">
            <CircleAlert className="size-4 shrink-0" />{error}
          </motion.div>
        )}
        {notice && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-950/20 dark:text-emerald-200">
            <CheckCircle2 className="size-4 shrink-0" />{notice}
          </motion.div>
        )}
      </AnimatePresence>

      {refreshing && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Refreshing your work…</div>
      )}

      <div className="space-y-4">
        {visibleGroups.map(({ type, items: groupItems }) => {
          const meta = groupMeta[type]
          const Icon = meta.icon
          return (
            <motion.section layout key={type} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_34px_rgba(15,23,42,0.04)] ring-1 ring-foreground/8" aria-labelledby={`inbox-${type}`}>
              <div className="flex items-center gap-3 border-b border-border/65 px-4 py-3.5 sm:px-5">
                <span className={cn("flex size-8 items-center justify-center rounded-lg", meta.iconClass)}><Icon className="size-4" /></span>
                <div className="min-w-0 flex-1"><h3 id={`inbox-${type}`} className="text-sm font-semibold">{meta.title}</h3><p className="text-[10px] text-muted-foreground">{meta.description}</p></div>
                <Badge variant="secondary" className="font-normal">{groupItems.length}</Badge>
                <Link href={meta.href} className="hidden items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground sm:inline-flex">Open workspace <ArrowRight className="size-3" /></Link>
              </div>
              <AnimatePresence initial={false} mode="popLayout">
                {groupItems.map((item) => <ItemRow key={`${item.type}-${item.id}`} item={item} onAction={runAction} disabled={busyId !== null} />)}
              </AnimatePresence>
            </motion.section>
          )
        })}
      </div>

      {!visibleGroups.length && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><CheckCircle2 className="size-5" /></span>
          <h3 className="mt-4 text-lg font-semibold">No open items</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">There are no items in {filter === "all" ? "the inbox" : `the ${filter} queue`}. New requests will appear here.</p>
          {filter !== "all" && <button type="button" onClick={() => chooseFilter("all")} className="mt-4 text-xs font-semibold text-primary hover:underline">View all work</button>}
        </motion.div>
      )}

      <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-[10px] leading-relaxed text-muted-foreground sm:flex-row sm:items-center">
        <CircleAlert className="size-3.5 shrink-0" />
        <p className="flex-1">This queue contains real workflow and imported records only. Demo records are excluded. Decisions and completions update the database and employee audit history.</p>
        <Link href="/ai-agents" className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline">Ask Laidback AI <ChevronRight className="size-3" /></Link>
      </div>
    </div>
  )
}
