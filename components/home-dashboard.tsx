"use client"

import Link from "next/link"
import {
  ChevronRight,
  Inbox,
  UserPlus,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatWorkspaceDateTime } from "@/lib/date-format"
import type { WorkforceAnalytics } from "@/lib/hr-types"
import type { InboxItem, ManagedEmployee } from "@/lib/people-types"

type HomeDashboardProps = {
  analytics: WorkforceAnalytics
  inbox: InboxItem[]
  people: ManagedEmployee[]
}

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 1 })

function readableDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(parsed)
}

function personInitials(person: ManagedEmployee): string {
  return person.initials || `${person.first_name?.[0] ?? ""}${person.last_name?.[0] ?? ""}` || "HR"
}

function SummaryMetric({
  label,
  value,
  detail,
  href,
}: {
  label: string
  value: string
  detail: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/25 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{detail}</p>
        <span className="text-[11px] font-medium text-foreground">View</span>
      </div>
    </Link>
  )
}

function StatusLabel({ count }: { count: number }) {
  if (count === 0) {
    return <span className="text-xs font-medium text-muted-foreground">Clear</span>
  }

  return <span className="text-xs font-medium text-foreground">{count} open</span>
}

export function HomeDashboard({ analytics, inbox, people }: HomeDashboardProps) {
  const generatedAt = new Date(analytics.generatedAt)
  const pendingLeave = inbox.filter((item) => item.type === "leave").length
  const hiringItems = inbox.filter((item) => item.type === "hiring").length
  const incompleteTraining = analytics.training.requiringMandatoryTraining
  const mobilityReviews = analytics.promotions.withoutPromotionOver36Months
  const peopleById = new Map(people.map((person) => [person.employee_id, person]))
  const activePeople = people.filter((person) => person.employment_status.toLowerCase() !== "terminated")
  const newStarters = [...activePeople]
    .sort((left, right) => right.hire_date.localeCompare(left.hire_date))
    .slice(0, 5)
  const awayToday = analytics.leave.currentlyAway
    .filter((leave, index, rows) => rows.findIndex((candidate) => candidate.employee_id === leave.employee_id) === index)
    .slice(0, 5)
  const departments = analytics.employeeAnalytics.activeByDepartment.slice(0, 8)
  const largestDepartment = Math.max(1, ...departments.map((item) => item.value))

  const workQueue = [
    {
      label: "Leave requests",
      definition: "Pending requests requiring an approval decision",
      count: pendingLeave,
      href: "/time-off#pending-decisions",
      action: "Review leave",
    },
    {
      label: "Mandatory training",
      definition: "Employees with an incomplete mandatory assignment",
      count: incompleteTraining,
      href: "/learning",
      action: "Review training",
    },
    {
      label: "Hiring activity",
      definition: "Open hiring items currently in the workflow",
      count: hiringItems,
      href: "/hiring",
      action: "Open hiring",
    },
    {
      label: "Career reviews",
      definition: "Active employees without a recorded move in 36 months",
      count: mobilityReviews,
      href: "/insights",
      action: "Review workforce",
    },
  ]

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 pb-10">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
          <p className="mt-1 text-sm text-muted-foreground">Current workforce status and work requiring attention.</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Updated {formatWorkspaceDateTime(generatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inbox" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted">
            <Inbox className="size-4" />
            Inbox
            {inbox.length > 0 && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">{inbox.length}</span>}
          </Link>
          <Link href="/people?new=1" className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-sm font-medium text-background transition-opacity hover:opacity-90">
            <UserPlus className="size-4" /> Add employee
          </Link>
        </div>
      </header>

      <section aria-labelledby="workforce-summary-heading">
        <div className="mb-3">
          <h2 id="workforce-summary-heading" className="text-sm font-semibold">Workforce summary</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Operational measures from the current database view.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <SummaryMetric label="Active employees" value={compactNumber.format(analytics.kpis.activeEmployees)} detail={`${analytics.employeeAnalytics.onLeave} recorded on leave`} href="/people" />
          <SummaryMetric label="Hires" value={compactNumber.format(analytics.kpis.hires)} detail={`${percent.format(analytics.kpis.averageTimeToHire)} day average`} href="/hiring" />
          <SummaryMetric label="Attrition rate" value={`${percent.format(analytics.kpis.attritionRate)}%`} detail={`${analytics.attrition.totalExits} recorded exits`} href="/attrition" />
          <SummaryMetric label="Pending leave" value={compactNumber.format(analytics.leave.pending)} detail={`${analytics.leave.approved} approved requests`} href="/time-off" />
          <SummaryMetric label="Training complete" value={`${percent.format(analytics.kpis.trainingCompletionRate)}%`} detail={`${incompleteTraining} require follow-up`} href="/learning" />
          <SummaryMetric label="Open requisitions" value={compactNumber.format(analytics.hiring.activeRequisitions)} detail={`${analytics.hiring.offers} active offers`} href="/hiring" />
        </div>
      </section>

      <Card className="gap-0 rounded-lg py-0 shadow-none">
        <CardHeader className="border-b border-border px-5 py-4">
          <CardTitle className="text-base">HR work queue</CardTitle>
          <CardDescription>Items that need review or follow-up.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/35 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Work item</th>
                  <th className="px-5 py-3 font-medium">Definition</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workQueue.map((item) => (
                  <tr key={item.label} className="hover:bg-muted/20">
                    <td className="px-5 py-3.5 font-medium">{item.label}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">{item.definition}</td>
                    <td className="px-5 py-3.5"><StatusLabel count={item.count} /></td>
                    <td className="px-5 py-3.5 text-right">
                      <Link href={item.href} className="inline-flex items-center gap-1 text-xs font-semibold hover:underline">
                        {item.action} <ChevronRight className="size-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="gap-0 rounded-lg py-0 shadow-none">
          <CardHeader className="flex-row items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <CardTitle className="text-base">Recent starters</CardTitle>
              <CardDescription>Most recent active employee records.</CardDescription>
            </div>
            <Link href="/people" className="shrink-0 text-xs font-semibold hover:underline">View directory</Link>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {newStarters.length ? newStarters.map((person) => (
              <Link key={person.employee_id} href={`/people/${encodeURIComponent(person.employee_id)}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/20">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-foreground">{personInitials(person)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{person.display_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{person.job_title} · {person.department}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{readableDate(person.hire_date)}</span>
              </Link>
            )) : (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No active employee records are available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-lg py-0 shadow-none">
          <CardHeader className="flex-row items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <CardTitle className="text-base">Away today</CardTitle>
              <CardDescription>Approved leave overlapping today.</CardDescription>
            </div>
            <Link href="/time-off" className="shrink-0 text-xs font-semibold hover:underline">Open time off</Link>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {awayToday.length ? awayToday.map((leave) => {
              const person = peopleById.get(leave.employee_id)
              return (
                <Link key={leave.id} href={person ? `/people/${encodeURIComponent(person.employee_id)}` : "/time-off"} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/20">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-foreground">
                    {person ? personInitials(person) : leave.employee_id.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{person?.display_name ?? leave.employee_id}</span>
                    <span className="block truncate text-xs text-muted-foreground">{leave.leave_type} · {leave.department}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">Returns {readableDate(leave.end_date)}</span>
                </Link>
              )
            }) : (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No approved leave overlaps today.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="gap-0 rounded-lg py-0 shadow-none">
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle className="text-base">Active employees by department</CardTitle>
            <CardDescription>Distribution of active employee records.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {departments.length ? (
              <div className="divide-y divide-border">
                {departments.map((department) => (
                  <div key={department.label} className="grid grid-cols-[minmax(0,1fr)_120px_56px] items-center gap-4 px-5 py-3">
                    <span className="truncate text-sm font-medium">{department.label}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(4, (department.value / largestDepartment) * 100)}%` }} />
                    </span>
                    <span className="text-right text-sm tabular-nums text-muted-foreground">{department.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No department data is available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-lg py-0 shadow-none">
          <CardHeader className="border-b border-border px-5 py-4">
            <CardTitle className="text-base">Workforce programs</CardTitle>
            <CardDescription>Operational status across core HR workflows.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {[
              { label: "Leaves", value: `${awayToday.length} away · ${analytics.leave.pending} pending`, href: "/time-off" },
              { label: "Assign Courses", value: `${percent.format(analytics.training.completionRate)}% complete`, href: "/learning" },
              { label: "Hiring", value: `${analytics.hiring.activeRequisitions} open roles · ${analytics.hiring.offers} offers`, href: "/hiring" },
              { label: "Attrition", value: `${percent.format(analytics.attrition.rate)}% rate · ${analytics.attrition.totalExits} exits`, href: "/attrition" },
              { label: "People", value: `${analytics.kpis.activeEmployees} active employee records`, href: "/people" },
            ].map((program) => {
              return (
                <Link key={program.label} href={program.href} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/20">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{program.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{program.value}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform" />
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
