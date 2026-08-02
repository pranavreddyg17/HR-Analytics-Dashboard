"use client"

import Link from "next/link"
import { Inbox, UserPlus } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatWorkspaceDateTime } from "@/lib/date-format"
import type { WorkforceAnalytics } from "@/lib/hr-types"
import type { InboxItem, ManagedEmployee } from "@/lib/people-types"
import { cn } from "@/lib/utils"

type HomeDashboardProps = {
  analytics: WorkforceAnalytics
  inbox: InboxItem[]
  people: ManagedEmployee[]
}

const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 1 })

function readableDate(value: string | null): string {
  if (!value) return "Not scheduled"
  const normalized = value.slice(0, 10)
  const parsed = new Date(`${normalized}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: parsed.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(parsed)
}

function itemHref(item: InboxItem): string {
  if (item.employeeId) return `/people/${encodeURIComponent(item.employeeId)}`
  return item.type === "hiring" ? "/hiring" : item.type === "training" ? "/learning" : "/time-off"
}

function dueLabel(item: InboxItem): string {
  if (item.slaStatus === "overdue") return `Overdue · ${readableDate(item.dueDate)}`
  if (item.slaStatus === "due_today") return "Due today"
  return `Due ${readableDate(item.dueDate)}`
}

function SummaryMetric({ label, value, detail, href }: { label: string; value: string; detail: string; href: string }) {
  return <Link href={href} className="rounded-md border border-border bg-card px-4 py-3 hover:bg-muted/20"><p className="text-meta font-medium text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{value}</p><p className="mt-1 text-meta text-muted-foreground">{detail}</p></Link>
}

export function HomeDashboard({ analytics, inbox, people }: HomeDashboardProps) {
  const generatedAt = new Date(analytics.generatedAt)
  const today = new Date().toISOString().slice(0, 10)
  const sevenDaysAgoDate = new Date()
  sevenDaysAgoDate.setUTCDate(sevenDaysAgoDate.getUTCDate() - 7)
  const sevenDaysAgo = sevenDaysAgoDate.toISOString().slice(0, 10)
  const thirtyDaysDate = new Date()
  thirtyDaysDate.setUTCDate(thirtyDaysDate.getUTCDate() + 30)
  const thirtyDays = thirtyDaysDate.toISOString().slice(0, 10)

  const openItems = inbox.filter((item) => !item.isCompleted)
  const decisions = openItems.filter((item) => item.requiresDecision).slice(0, 6)
  const overdueItems = openItems.filter((item) => item.slaStatus === "overdue")
  const dueSoonItems = openItems.filter((item) => item.slaStatus === "due_today" || item.slaStatus === "due_soon")
  const managerActions = openItems.filter((item) => item.assignedTo === "manager").slice(0, 5)

  const alerts = [
    { label: "Leave decisions overdue", count: overdueItems.filter((item) => item.type === "leave").length, href: "/inbox?view=overdue&type=leave" },
    { label: "Hiring follow-ups overdue", count: overdueItems.filter((item) => item.type === "hiring").length, href: "/inbox?view=overdue&type=hiring" },
    { label: "Training assignments overdue", count: overdueItems.filter((item) => item.type === "training").length, href: "/inbox?view=overdue&type=training" },
    { label: "Items due within three days", count: dueSoonItems.length, href: "/inbox" },
  ]

  const recentCreated = inbox.filter((item) => item.createdAt.slice(0, 10) >= sevenDaysAgo)
  const recentCompleted = inbox.filter((item) => item.completedAt && item.completedAt.slice(0, 10) >= sevenDaysAgo)
  const recentExits = analytics.attrition.rows.filter((row) => row.exit_date >= sevenDaysAgo && row.exit_date <= today).length
  const recentPromotions = analytics.promotions.rows.filter((row) => row.promotion_date >= sevenDaysAgo && row.promotion_date <= today).length
  const changes = [
    { label: "Leave requests submitted", value: recentCreated.filter((item) => item.type === "leave").length },
    { label: "Hiring requests opened", value: recentCreated.filter((item) => item.type === "hiring").length },
    { label: "Training completions recorded", value: recentCompleted.filter((item) => item.type === "training").length },
    { label: "Recorded exits", value: recentExits },
    { label: "Promotions recorded", value: recentPromotions },
  ]

  const upcomingEvents = [
    ...people.filter((person) => person.hire_date >= today && person.hire_date <= thirtyDays).map((person) => ({ id: `start-${person.employee_id}`, date: person.hire_date, label: `${person.display_name} starts`, detail: `${person.job_title} · ${person.department}`, href: `/people/${encodeURIComponent(person.employee_id)}` })),
    ...analytics.leave.upcoming.filter((leave) => leave.start_date >= today && leave.start_date <= thirtyDays && leave.approval_status.toLowerCase() === "approved").map((leave) => ({ id: `leave-${leave.id}`, date: leave.start_date, label: `${leave.leave_type} leave begins`, detail: `${leave.employee_id} · ${leave.department}`, href: `/people/${encodeURIComponent(leave.employee_id)}` })),
    ...openItems.filter((item) => item.type === "training" && item.dueDate && item.dueDate >= today && item.dueDate <= thirtyDays).map((item) => ({ id: `due-${item.id}`, date: item.dueDate as string, label: `${item.title} due`, detail: item.person || item.owner, href: itemHref(item) })),
  ].sort((left, right) => left.date.localeCompare(right.date)).slice(0, 8)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-10">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-semibold">My HR workday</h1><p className="mt-1 text-sm text-muted-foreground">Decisions, deadlines, and workforce events requiring attention.</p><p className="mt-2 text-xs text-muted-foreground">Updated {formatWorkspaceDateTime(generatedAt)}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inbox" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted"><Inbox className="size-4" />Inbox{openItems.length > 0 && <span className="rounded bg-muted px-1.5 py-0.5 text-meta tabular-nums">{openItems.length}</span>}</Link>
          <Link href="/people?new=1" className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-sm font-medium text-background hover:opacity-90"><UserPlus className="size-4" />Add employee</Link>
        </div>
      </header>

      <section aria-labelledby="decision-heading">
        <div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="decision-heading" className="text-base font-semibold">Needs your decision</h2><p className="mt-0.5 text-xs text-muted-foreground">Requests that cannot progress without an HR or manager decision.</p></div><Link href="/inbox?view=decisions" className="text-xs font-semibold hover:underline">View decision queue</Link></div>
        <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardContent className="divide-y divide-border p-0">
          {decisions.length ? decisions.map((item) => <Link key={`${item.type}-${item.id}`} href={itemHref(item)} className="grid gap-3 px-5 py-4 hover:bg-muted/20 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)_auto] sm:items-center">
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.person ? `${item.person} · ` : ""}{item.detail}</p></div>
            <div className="min-w-0"><p className="text-meta font-medium text-muted-foreground">Decision needed</p><p className="mt-1 text-xs">{item.nextAction}</p><p className="mt-1 truncate text-meta text-muted-foreground">{item.attentionReason}</p></div>
            <div className="text-left sm:text-right"><p className={cn("text-xs font-semibold", item.slaStatus === "overdue" || item.slaStatus === "due_today" ? "text-destructive" : "text-foreground")}>{dueLabel(item)}</p><p className="mt-1 text-meta text-muted-foreground">{item.owner}</p></div>
          </Link>) : <div className="px-5 py-10 text-center"><p className="text-sm font-semibold">No decisions are waiting</p><p className="mt-1 text-xs text-muted-foreground">New requests requiring approval will appear here.</p></div>}
        </CardContent></Card>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="gap-0 py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle className="text-base">Deadlines and exceptions</CardTitle><CardDescription>Open work that is overdue or approaching its due date.</CardDescription></CardHeader><CardContent className="divide-y divide-border p-0">{alerts.map((alert) => <Link key={alert.label} href={alert.href} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/20"><span className="min-w-0 flex-1 text-sm font-medium">{alert.label}</span><span className={cn("text-sm font-semibold tabular-nums", alert.count > 0 ? "text-foreground" : "text-muted-foreground")}>{alert.count}</span></Link>)}</CardContent></Card>

        <Card className="gap-0 py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle className="text-base">Changes in the last seven days</CardTitle><CardDescription>Recorded operational changes, not all-time totals.</CardDescription></CardHeader><CardContent className="divide-y divide-border p-0">{changes.map((change) => <div key={change.label} className="flex items-center gap-4 px-5 py-3.5"><span className="min-w-0 flex-1 text-sm font-medium">{change.label}</span><span className="text-sm font-semibold tabular-nums">{change.value}</span></div>)}</CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="gap-0 py-0 shadow-none"><CardHeader className="flex-row items-start justify-between gap-3 border-b border-border px-5 py-4"><div><CardTitle className="text-base">Manager actions awaiting completion</CardTitle><CardDescription>Work currently assigned to a people manager.</CardDescription></div><Link href="/inbox?view=managers" className="text-xs font-semibold hover:underline">View all</Link></CardHeader><CardContent className="divide-y divide-border p-0">{managerActions.length ? managerActions.map((item) => <Link key={`${item.type}-${item.id}`} href={itemHref(item)} className="flex gap-4 px-5 py-3.5 hover:bg-muted/20"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.owner} · {item.nextAction}</span></span><span className={cn("shrink-0 text-xs", item.slaStatus === "overdue" ? "font-semibold text-destructive" : "text-muted-foreground")}>{dueLabel(item)}</span></Link>) : <p className="px-5 py-8 text-center text-sm text-muted-foreground">No manager-owned actions are open.</p>}</CardContent></Card>

        <Card className="gap-0 py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle className="text-base">Upcoming workforce events</CardTitle><CardDescription>Starts, approved leave, and recorded training deadlines in the next 30 days.</CardDescription></CardHeader><CardContent className="divide-y divide-border p-0">{upcomingEvents.length ? upcomingEvents.map((event) => <Link key={event.id} href={event.href} className="flex gap-4 px-5 py-3.5 hover:bg-muted/20"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{event.label}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{event.detail}</span></span><span className="shrink-0 text-xs text-muted-foreground">{readableDate(event.date)}</span></Link>) : <p className="px-5 py-8 text-center text-sm text-muted-foreground">No recorded workforce events are scheduled in the next 30 days.</p>}</CardContent></Card>
      </div>

      <section aria-labelledby="summary-heading"><div className="mb-3"><h2 id="summary-heading" className="text-sm font-semibold">Workforce summary</h2><p className="mt-0.5 text-xs text-muted-foreground">Small reference measures for the current workspace.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SummaryMetric label="Active employees" value={analytics.kpis.activeEmployees.toLocaleString()} detail={`${analytics.employeeAnalytics.onLeave} currently on leave`} href="/people" /><SummaryMetric label="Open HR work" value={openItems.length.toLocaleString()} detail={`${overdueItems.length} overdue`} href="/inbox" /><SummaryMetric label="Open requisitions" value={analytics.hiring.activeRequisitions.toLocaleString()} detail={`${analytics.hiring.offers} at offer`} href="/hiring" /><SummaryMetric label="Recorded attrition" value={`${percent.format(analytics.kpis.attritionRate)}%`} detail={`${analytics.attrition.totalExits} recorded exits`} href="/attrition" /></div></section>
    </div>
  )
}
