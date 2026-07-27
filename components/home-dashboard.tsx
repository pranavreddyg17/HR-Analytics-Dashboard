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
  viewer: { displayName: string; email: string | null }
  analytics: WorkforceAnalytics
  inbox: InboxItem[]
  people: ManagedEmployee[]
}

type Priority = {
  label: string
  detail: string
  count: number
  href: string
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

function firstName(displayName: string): string {
  if (displayName === "HR team") return displayName
  return displayName.trim().split(/\s+/)[0] || "there"
}

function greeting(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

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

function Metric({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Users; tone: string }) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
      <Card className="h-full gap-3 border-0 bg-card/95 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.04)] ring-1 ring-foreground/8">
        <CardContent className="flex items-start gap-3 px-4">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone)}>
            <Icon className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-[-0.03em] tabular-nums">{value}</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</p>
          </div>
        </CardContent>
      </Card>
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

export function HomeDashboard({ viewer, analytics, inbox, people }: HomeDashboardProps) {
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
      icon: CalendarCheck2,
      tone: pendingLeave ? "rose" : "green",
    },
    {
      label: "Mandatory training",
      detail: incompleteTraining ? "Assignments need a follow-up" : "Your compliance queue is clear",
      count: incompleteTraining,
      href: "/inbox?type=training",
      icon: GraduationCap,
      tone: incompleteTraining ? "amber" : "green",
    },
    {
      label: "Hiring pipeline",
      detail: offers ? `${offers} offer${offers === 1 ? "" : "s"} ready to progress` : `${hiringItems.length} open hiring items`,
      count: hiringItems.length,
      href: "/inbox?type=hiring",
      icon: BriefcaseBusiness,
      tone: offers ? "blue" : "green",
    },
    {
      label: "Career conversations",
      detail: "3+ years without a recorded move",
      count: analytics.promotions.withoutPromotionOver36Months,
      href: "/insights?view=promotions",
      icon: TrendingUp,
      tone: analytics.promotions.withoutPromotionOver36Months ? "amber" : "green",
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 pb-8">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative isolate overflow-hidden rounded-[1.75rem] border border-primary/10 bg-gradient-to-br from-card via-card to-primary/10 px-5 py-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] sm:px-7 sm:py-7"
      >
        <div className="pointer-events-none absolute -right-16 -top-24 -z-10 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-1/3 -z-10 size-60 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] xl:items-end">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(generatedAt)}</span>
              <span className="size-1 rounded-full bg-border" />
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" />People workspace</span>
            </div>
            <h2 className="max-w-3xl font-serif text-[clamp(2rem,4vw,3.65rem)] leading-[0.98] font-semibold tracking-[-0.045em] text-foreground">
              {greeting(generatedAt)}, {firstName(viewer.displayName)}.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              Here is what needs attention today—decisions first, context close by, and no spreadsheet hunting.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/people?new=employee" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <UserPlus className="size-4" /> Add employee
              </Link>
              <Link href="/inbox" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background/80 px-4 text-sm font-semibold shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Inbox className="size-4" /> Review inbox
                {inbox.length > 0 && <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] text-background tabular-nums">{inbox.length}</span>}
              </Link>
              <Link href="/ai-agents" className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Sparkles className="size-4 text-primary" /> Ask Laidback AI
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">My day</p>
                <p className="mt-1 text-sm font-medium">{highPriority ? `${highPriority} high-priority item${highPriority === 1 ? "" : "s"}` : "No urgent blockers"}</p>
              </div>
              <span className={cn("flex size-10 items-center justify-center rounded-full", highPriority ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300")}>
                {highPriority ? <CircleAlert className="size-[18px]" /> : <CheckCircle2 className="size-[18px]" />}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-border/80 border-t border-border/70 pt-4">
              <div className="pr-3"><p className="text-xl font-semibold tracking-tight tabular-nums">{pendingLeave}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Leave</p></div>
              <div className="px-3"><p className="text-xl font-semibold tracking-tight tabular-nums">{offers}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Offers</p></div>
              <div className="pl-3"><p className="text-xl font-semibold tracking-tight tabular-nums">{incompleteTraining}</p><p className="mt-0.5 text-[10px] text-muted-foreground">Training</p></div>
            </div>
          </div>
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
            <h3 id="priorities-heading" className="mt-1 text-lg font-semibold tracking-tight">What needs your attention</h3>
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
          <h3 id="pulse-heading" className="mt-1 text-lg font-semibold tracking-tight">A clear read on your people</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active employees" value={compactNumber.format(analytics.kpis.activeEmployees)} detail={`${analytics.employeeAnalytics.onLeave} currently on leave`} icon={Users} tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" />
          <Metric label="Hiring velocity" value={`${percent.format(analytics.kpis.averageTimeToHire)}d`} detail={`${analytics.kpis.hires} completed hires`} icon={Clock3} tone="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" />
          <Metric label="Training complete" value={`${percent.format(analytics.kpis.trainingCompletionRate)}%`} detail={`${incompleteTraining} mandatory follow-ups`} icon={GraduationCap} tone="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" />
          <Metric label="Attrition rate" value={`${percent.format(analytics.kpis.attritionRate)}%`} detail={`${analytics.attrition.totalExits} recorded exits`} icon={TrendingDown} tone="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" />
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
              <Link href="/ai-agents" className="inline-flex h-9 items-center gap-2 rounded-xl bg-foreground px-3.5 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"><Sparkles className="size-3.5" />Ask a follow-up</Link>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><CheckCircle2 className="size-3 text-emerald-600" />Human review stays in control</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
