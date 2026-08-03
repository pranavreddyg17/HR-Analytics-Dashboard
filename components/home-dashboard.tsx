"use client"

import Link from "next/link"

import { Card, CardContent } from "@/components/ui/card"
import { MetricStrip, WorkspaceHeader, WorkspacePage, WorkspaceSectionHeader } from "@/components/workspace-ui"
import type { WorkforceAnalytics } from "@/lib/hr-types"
import type { InboxItem, ManagedEmployee } from "@/lib/people-types"
import { cn } from "@/lib/utils"
import { withReturnTo } from "@/lib/navigation"

type HomeDashboardProps = {
  analytics: WorkforceAnalytics
  inbox: InboxItem[]
  people: ManagedEmployee[]
}

function readableDate(value: string | null): string {
  if (!value) return "No due date"
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: parsed.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(parsed)
}

function urgency(item: InboxItem): number {
  if (item.slaStatus === "overdue") return 0
  if (item.slaStatus === "due_today") return 1
  if (item.slaStatus === "due_soon") return 2
  if (item.requiresDecision) return 3
  return 4
}

function dueLabel(item: InboxItem): string {
  if (item.slaStatus === "overdue") return `Overdue · ${readableDate(item.dueDate)}`
  if (item.slaStatus === "due_today") return "Due today"
  return item.dueDate ? `Due ${readableDate(item.dueDate)}` : "No due date"
}

export function HomeDashboard({ analytics, inbox, people }: HomeDashboardProps) {
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysDate = new Date()
  thirtyDaysDate.setUTCDate(thirtyDaysDate.getUTCDate() + 30)
  const thirtyDays = thirtyDaysDate.toISOString().slice(0, 10)
  const openItems = inbox.filter((item) => !item.isCompleted)
  const decisions = openItems.filter((item) => item.requiresDecision)
  const overdue = openItems.filter((item) => item.slaStatus === "overdue")
  const attention = [...openItems].sort((left, right) => urgency(left) - urgency(right) || (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999")).slice(0, 5)
  const upcoming = [
    ...people.filter((person) => person.hire_date >= today && person.hire_date <= thirtyDays).map((person) => ({ id: `start-${person.employee_id}`, date: person.hire_date, title: `${person.display_name} starts`, detail: `${person.job_title} · ${person.department}`, href: withReturnTo(`/people/${encodeURIComponent(person.employee_id)}`, "/") })),
    ...analytics.leave.upcoming.filter((leave) => leave.start_date >= today && leave.start_date <= thirtyDays && leave.approval_status.toLowerCase() === "approved").map((leave) => ({ id: `leave-${leave.id}`, date: leave.start_date, title: `${leave.leave_type} leave begins`, detail: `${people.find((person) => person.employee_id === leave.employee_id)?.display_name ?? leave.employee_id} · ${leave.department}`, href: withReturnTo(`/leaves?request=${encodeURIComponent(leave.id)}`, "/") })),
    ...openItems.filter((item) => item.type === "training" && item.dueDate && item.dueDate >= today && item.dueDate <= thirtyDays).map((item) => ({ id: `training-${item.id}`, date: item.dueDate as string, title: `${item.title} due`, detail: item.person || item.owner, href: withReturnTo(item.reviewHref, "/") })),
  ].sort((left, right) => left.date.localeCompare(right.date)).slice(0, 5)

  return (
    <WorkspacePage>
      <WorkspaceHeader
        title="Home"
        description="Work requiring attention."
        actions={<Link href={withReturnTo("/people?new=employee", "/")} className="inline-flex h-9 items-center rounded-md bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary/85">Add employee</Link>}
      />

      <MetricStrip metrics={[
        { label: "Awaiting decision", value: decisions.length.toLocaleString(), detail: "Requests requiring approval" },
        { label: "Overdue", value: overdue.length.toLocaleString(), detail: "Open actions past due" },
        { label: "Active employees", value: analytics.kpis.activeEmployees.toLocaleString(), detail: `${analytics.employeeAnalytics.onLeave} currently on leave` },
        { label: "Open requisitions", value: analytics.hiring.activeRequisitions.toLocaleString(), detail: `${analytics.hiring.offers} at offer` },
      ]} />

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <WorkspaceSectionHeader
          title="Needs attention"
          description="Decisions and overdue work."
          action={<Link href="/inbox" className="font-semibold text-primary hover:underline">View all</Link>}
        />
        <CardContent className="p-0">
          {attention.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-body">
                <thead className="bg-muted/40 text-label text-muted-foreground"><tr><th className="px-4 py-2.5">Work item</th><th className="px-4 py-2.5">Owner</th><th className="px-4 py-2.5">Due</th><th className="px-4 py-2.5"><span className="sr-only">Open</span></th></tr></thead>
                <tbody>{attention.map((item) => (
                  <tr key={`${item.type}-${item.id}`} className="border-t border-border/70 hover:bg-muted/20">
                    <td className="px-4 py-3"><p className="font-semibold">{item.title}</p><p className="text-meta text-muted-foreground">{item.nextAction}</p></td>
                    <td className="px-4 py-3">{item.owner}</td>
                    <td className={cn("whitespace-nowrap px-4 py-3", (item.slaStatus === "overdue" || item.slaStatus === "due_today") && "font-semibold text-destructive")}>{dueLabel(item)}</td>
                    <td className="px-4 py-3 text-right"><Link href={withReturnTo(item.reviewHref, "/")} className="font-semibold text-primary hover:underline">Review</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="px-5 py-10 text-center text-muted-foreground">No open work requires attention.</p>}
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <WorkspaceSectionHeader title="Upcoming" description="Next 30 days." />
        <CardContent className="divide-y divide-border p-0">
          {upcoming.length ? upcoming.map((event) => <Link key={event.id} href={event.href} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20"><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{event.title}</span><span className="block truncate text-meta text-muted-foreground">{event.detail}</span></span><time className="shrink-0 text-meta text-muted-foreground">{readableDate(event.date)}</time></Link>) : <p className="px-5 py-8 text-center text-muted-foreground">No upcoming events.</p>}
        </CardContent>
      </Card>
    </WorkspacePage>
  )
}
