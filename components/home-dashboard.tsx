"use client"

import Link from "next/link"
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  GraduationCap,
  Inbox,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react"
import { motion } from "motion/react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { WorkforceAnalytics } from "@/lib/hr-types"
import type { InboxItem, ManagedEmployee } from "@/lib/people-types"
import { cn } from "@/lib/utils"

type HomeDashboardProps = {
  analytics: WorkforceAnalytics
  inbox: InboxItem[]
  people: ManagedEmployee[]
}

type Priority = {
  label: string
  detail: string
  count: number
  href: string
  action: string
  icon: typeof Inbox
  tone: "rose" | "amber" | "blue" | "green"
}

const toneStyles: Record<Priority["tone"], { surface: string; icon: string; dot: string }> = {
  rose: { surface: "bg-rose-50/80 dark:bg-rose-950/20", icon: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", dot: "bg-rose-500" },
  amber: { surface: "bg-amber-50/80 dark:bg-amber-950/20", icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-500" },
  blue: { surface: "bg-sky-50/80 dark:bg-sky-950/20", icon: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300", dot: "bg-sky-500" },
  green: { surface: "bg-emerald-50/80 dark:bg-emerald-950/20", icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
}

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 1 })

function personInitials(person: ManagedEmployee): string {
  return person.initials || `${person.first_name?.[0] ?? ""}${person.last_name?.[0] ?? ""}` || "HR"
}

function readableDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(parsed)
}

function Avatar({ person, size = "md" }: { person: ManagedEmployee; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 font-semibold text-primary ring-1 ring-primary/15",
        size === "sm" ? "size-8 text-[11px]" : "size-10 text-xs",
      )}
    >
      {personInitials(person)}
    </span>
  )
}

function Metric({ label, value, detail, icon: Icon, tone, href }: { label: string; value: string; detail: string; icon: typeof Users; tone: string; href: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
      <Link href={href} aria-label={`Open ${label} report`} className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Card className="h-full gap-3 border-0 bg-card/95 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.04)] ring-1 ring-foreground/8 transition-shadow group-hover:shadow-md">
          <CardContent className="flex items-start gap-3 px-4">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone)}>
            <Icon className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-[-0.03em] tabular-nums">{value}</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</p>
            <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-primary">View report <ChevronRight className="size-3" /></p>
          </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
}

function EmptyPeople({ message }: { message: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 px-6 text-center">
      <CheckCircle2 className="mb-3 size-5 text-emerald-600" />
      <p className="text-sm font-medium">All clear</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{message}</p>
    </div>
  )
}

export function HomeDashboard({ analytics, inbox, people }: HomeDashboardProps) {
  const generatedAt = new Date(analytics.generatedAt)
  const highPriority = inbox.filter((item) => item.priority === "high").length
  const pendingLeave = inbox.filter((item) => item.type === "leave").length
  const hiringItems = inbox.filter((item) => item.type === "hiring")
  const offers = hiringItems.filter((item) => item.status.toLowerCase() === "offer").length
  const incompleteTraining = analytics.training.requiringMandatoryTraining
  const demoDomains = analytics.status.filter((item) => item.mode === "demo").map((item) => item.domain)
  const peopleById = new Map(people.map((person) => [person.employee_id, person]))
  const activePeople = people.filter((person) => person.employment_status.toLowerCase() !== "terminated")
  const newStarters = [...activePeople]
    .sort((left, right) => right.hire_date.localeCompare(left.hire_date))
    .slice(0, 4)
  const peopleOnLeave = activePeople.filter((person) => person.employment_status.toLowerCase() === "on leave").slice(0, 4)
  const trainingPeople = analytics.training.rows
    .filter((row) => row.completion_status.toLowerCase() !== "completed")
    .map((row) => peopleById.get(row.employee_id))
    .filter((person): person is ManagedEmployee => Boolean(person))
    .filter((person, index, list) => list.findIndex((candidate) => candidate.employee_id === person.employee_id) === index)
    .slice(0, 4)
  const departmentMax = Math.max(1, ...analytics.employeeAnalytics.byDepartment.map((item) => item.value))

  const priorities: Priority[] = [
    {
      label: "Leave decisions",
      detail: pendingLeave ? `${pendingLeave} request${pendingLeave === 1 ? "" : "s"} waiting for you` : "No requests awaiting review",
      count: pendingLeave,
      href: "/inbox?type=leave",
      action: pendingLeave ? "Review requests" : "Open leave queue",
      icon: CalendarCheck2,
      tone: pendingLeave ? "rose" : "green",
    },
    {
      label: "Mandatory training",
      detail: incompleteTraining ? "Assignments need a follow-up" : "Your compliance queue is clear",
      count: incompleteTraining,
      href: "/inbox?type=training",
      action: incompleteTraining ? "Review assignments" : "Open training queue",
      icon: GraduationCap,
      tone: incompleteTraining ? "amber" : "green",
    },
    {
      label: "Hiring pipeline",
      detail: offers ? `${offers} offer${offers === 1 ? "" : "s"} ready to progress` : `${hiringItems.length} open hiring items`,
      count: hiringItems.length,
      href: "/inbox?type=hiring",
      action: "Open hiring queue",
      icon: BriefcaseBusiness,
      tone: offers ? "blue" : "green",
    },
    {
      label: "Career conversations",
      detail: "3+ years without a recorded move",
      count: analytics.promotions.withoutPromotionOver36Months,
      href: "/insights?view=promotions",
      action: "Review promotion report",
      icon: TrendingUp,
      tone: analytics.promotions.withoutPromotionOver36Months ? "amber" : "green",
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 pb-8">
      <motion.section
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1424] text-white shadow-[0_18px_60px_rgba(15,23,42,0.14)]"
      >
        <div className="flex flex-col gap-6 p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              <span>Workforce command center</span><span className="size-1 rounded-full bg-[#35d6a5]" /><span>{new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(generatedAt)}</span>
            </div>
            <h1 className="text-[clamp(1.9rem,3vw,2.8rem)] font-bold leading-tight tracking-[-0.05em]">Workforce overview</h1>
            <p className="mt-2 text-sm text-slate-400">Priority work, operating metrics, and team changes in one view.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/inbox" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-800">
              <Inbox className="size-4 text-[#35d6a5]" /> Review inbox
              {inbox.length > 0 && <span className="rounded-full bg-[#35d6a5] px-1.5 py-0.5 text-[10px] font-bold text-[#08120f] tabular-nums">{inbox.length}</span>}
            </Link>
            <Link href="/people?new=employee" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#35d6a5] px-4 text-sm font-bold text-[#07140f] transition hover:bg-[#4de2b5]">
              <UserPlus className="size-4" /> Add employee
            </Link>
          </div>
        </div>
        <div className="grid border-t border-slate-800 sm:grid-cols-4">
          <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-4 sm:border-b-0 sm:border-r"><span className={cn("size-2 rounded-full", highPriority ? "bg-rose-400" : "bg-[#35d6a5]")} /><div><p className="text-lg font-bold tabular-nums">{highPriority}</p><p className="text-[10px] uppercase tracking-wider text-slate-500">High priority</p></div></div>
          <div className="border-b border-slate-800 px-5 py-4 sm:border-b-0 sm:border-r"><p className="text-lg font-bold tabular-nums">{pendingLeave}</p><p className="text-[10px] uppercase tracking-wider text-slate-500">Leave requests</p></div>
          <div className="border-b border-slate-800 px-5 py-4 sm:border-b-0 sm:border-r"><p className="text-lg font-bold tabular-nums">{offers}</p><p className="text-[10px] uppercase tracking-wider text-slate-500">Offers active</p></div>
          <div className="px-5 py-4"><p className="text-lg font-bold tabular-nums">{incompleteTraining}</p><p className="text-[10px] uppercase tracking-wider text-slate-500">Training gaps</p></div>
        </div>
      </motion.section>

      {demoDomains.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-amber-950 shadow-sm dark:border-amber-800/30 dark:bg-amber-950/20 dark:text-amber-100 sm:flex-row sm:items-center">
          <CircleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="flex-1 text-xs leading-relaxed">
            <span className="font-semibold">Demo workspace:</span> {demoDomains.join(", ")} currently use sample operational records. Import your own HR data when you are ready; model predictions remain labelled separately.
          </p>
          <Link href="/data" className="inline-flex items-center gap-1 text-xs font-semibold hover:underline">Open Data Hub <ArrowRight className="size-3" /></Link>
        </div>
      )}

      <section aria-labelledby="priorities-heading">
        <div className="mb-3 flex items-end justify-between gap-3 px-0.5">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-primary uppercase">Today</p>
            <h3 id="priorities-heading" className="mt-1 text-lg font-bold tracking-[-0.025em]">Priority work</h3>
          </div>
          <Link href="/inbox" className="hidden items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground sm:inline-flex">View all work <ChevronRight className="size-3.5" /></Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {priorities.map((item, index) => {
            const Icon = item.icon
            const styles = toneStyles[item.tone]
            return (
              <motion.div key={item.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * index, duration: 0.25 }} whileHover={{ y: -2 }}>
                <Link href={item.href} className={cn("group flex h-full min-h-32 flex-col rounded-2xl border border-border/70 p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", styles.surface)}>
                  <div className="flex items-start justify-between gap-3">
                    <span className={cn("flex size-9 items-center justify-center rounded-xl", styles.icon)}><Icon className="size-4" /></span>
                    <span className="text-2xl font-semibold tracking-[-0.04em] tabular-nums">{item.count}</span>
                  </div>
                  <div className="mt-auto pt-4">
                    <p className="flex items-center gap-2 text-sm font-semibold"><span className={cn("size-1.5 rounded-full", styles.dot)} />{item.label}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p>
                    <p className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-foreground">{item.action}<ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" /></p>
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="pulse-heading">
        <div className="mb-3 px-0.5">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-primary uppercase">Workforce pulse</p>
          <h3 id="pulse-heading" className="mt-1 text-lg font-bold tracking-[-0.025em]">Core workforce metrics</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active employees" value={compactNumber.format(analytics.kpis.activeEmployees)} detail={`${analytics.employeeAnalytics.onLeave} currently on leave`} icon={Users} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" href="/insights?view=employees" />
          <Metric label="Hiring velocity" value={`${percent.format(analytics.kpis.averageTimeToHire)}d`} detail={`${analytics.kpis.hires} completed hires`} icon={Clock3} tone="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" href="/hiring" />
          <Metric label="Training complete" value={`${percent.format(analytics.kpis.trainingCompletionRate)}%`} detail={`${incompleteTraining} mandatory follow-ups`} icon={GraduationCap} tone="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" href="/insights?view=training" />
          <Metric label="Attrition rate" value={`${percent.format(analytics.kpis.attritionRate)}%`} detail={`${analytics.attrition.totalExits} recorded exits`} icon={TrendingDown} tone="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" href="/insights?view=attrition" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.16fr_0.84fr]">
        <Card className="gap-4 border-0 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.05)] ring-1 ring-foreground/8">
          <CardHeader className="flex-row items-start justify-between gap-4 px-5">
            <div>
              <CardTitle>People, at a glance</CardTitle>
              <CardDescription>Recent starters and colleagues away</CardDescription>
            </div>
            <Link href="/people" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Open directory <ChevronRight className="size-3" /></Link>
          </CardHeader>
          <CardContent className="grid gap-5 px-5 md:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">New & recent starters</p>
                <Badge variant="secondary" className="font-normal">{newStarters.length}</Badge>
              </div>
              <div className="space-y-1">
                {newStarters.map((person) => (
                  <Link key={person.employee_id} href={`/people/${encodeURIComponent(person.employee_id)}`} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                    <Avatar person={person} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{person.display_name}</span><span className="block truncate text-[11px] text-muted-foreground">{person.job_title} · {person.department}</span></span>
                    <span className="text-[10px] text-muted-foreground">{readableDate(person.hire_date)}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">Currently on leave</p>
                <Badge variant="secondary" className="font-normal">{analytics.employeeAnalytics.onLeave}</Badge>
              </div>
              {peopleOnLeave.length ? (
                <div className="space-y-1">
                  {peopleOnLeave.map((person) => (
                    <Link key={person.employee_id} href={`/people/${encodeURIComponent(person.employee_id)}`} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60">
                      <Avatar person={person} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{person.display_name}</span><span className="block truncate text-[11px] text-muted-foreground">{person.department} · {person.location}</span></span>
                      <CalendarDays className="size-4 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              ) : <EmptyPeople message="No active employee profiles are marked as on leave." />}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-4 border-0 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.05)] ring-1 ring-foreground/8">
          <CardHeader className="px-5">
            <CardTitle>Team shape</CardTitle>
            <CardDescription>Active employee records by department</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-5">
            {analytics.employeeAnalytics.byDepartment.slice(0, 6).map((item, index) => (
              <div key={item.label}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate font-medium">{item.label}</span><span className="text-muted-foreground tabular-nums">{item.value}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div className="h-full rounded-full bg-primary" initial={{ scaleX: 0 }} animate={{ scaleX: item.value / departmentMax }} transition={{ delay: 0.08 * index, duration: 0.45, ease: [0.22, 1, 0.36, 1] }} style={{ transformOrigin: "left" }} />
                </div>
              </div>
            ))}
            <Link href="/insights?view=employees" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Explore workforce analytics <ArrowRight className="size-3" /></Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="gap-4 border-0 py-5 shadow-sm ring-1 ring-foreground/8">
          <CardHeader className="flex-row items-start justify-between gap-3 px-5">
            <div><CardTitle>Compliance follow-up</CardTitle><CardDescription>Incomplete training assignments</CardDescription></div>
            <Badge variant={trainingPeople.length ? "destructive" : "secondary"}>{incompleteTraining}</Badge>
          </CardHeader>
          <CardContent className="px-5">
            {trainingPeople.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {trainingPeople.map((person) => (
                  <Link key={person.employee_id} href={`/people/${encodeURIComponent(person.employee_id)}`} className="flex items-center gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:bg-muted/50">
                    <Avatar person={person} size="sm" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{person.display_name}</span><span className="block truncate text-[10px] text-muted-foreground">{person.department}</span></span>
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            ) : <EmptyPeople message="No incomplete training assignments need attention." />}
          </CardContent>
        </Card>

        <Card className="gap-4 border-0 bg-gradient-to-br from-card to-primary/5 py-5 shadow-sm ring-1 ring-foreground/8">
          <CardHeader className="flex-row items-start justify-between gap-3 px-5">
            <div><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />People intelligence</CardTitle><CardDescription>Grounded signals—not automated people decisions</CardDescription></div>
          </CardHeader>
          <CardContent className="space-y-3 px-5">
            {(analytics.executiveInsights.length ? analytics.executiveInsights : ["Your workforce data is ready for review."]).slice(0, 2).map((insight, index) => (
              <div key={insight} className="flex gap-3 rounded-xl border border-border/60 bg-background/55 p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{index + 1}</span>
                <p className="text-xs leading-relaxed text-muted-foreground">{insight}</p>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Link href="/ai-agents" className="inline-flex h-9 items-center gap-2 rounded-xl bg-foreground px-3.5 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"><Sparkles className="size-3.5" />Open AI assistant</Link>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><CheckCircle2 className="size-3 text-emerald-600" />Human review stays in control</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
