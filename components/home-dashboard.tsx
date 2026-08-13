"use client"

import Link from "next/link"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MetricStrip, WorkspaceHeader, WorkspacePage, WorkspaceSectionHeader } from "@/components/workspace-ui"
import type { InboxOperations } from "@/lib/inbox-types"
import { withReturnTo } from "@/lib/navigation"
import type { InboxItem } from "@/lib/people-types"
import type { HomeSnapshot } from "@/lib/server/home"
import { cn } from "@/lib/utils"

type HomeDashboardProps = {
  snapshot: HomeSnapshot
  inbox: InboxOperations
  actorEmail: string
}

function readableDate(value: string | null): string {
  if (!value) return "No due date"
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: parsed.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(parsed)
}

function urgency(item: InboxItem): number {
  if (item.requiresDecision && item.actionable) return 0
  if (item.slaStatus === "overdue") return 1
  if (item.slaStatus === "due_today") return 2
  if (item.slaStatus === "due_soon") return 3
  return 4
}

function dueLabel(item: InboxItem): string {
  if (item.slaStatus === "overdue") return `Overdue · ${readableDate(item.dueDate)}`
  if (item.slaStatus === "due_today") return "Due today"
  return item.dueDate ? `Due ${readableDate(item.dueDate)}` : "No due date"
}

function actionLabel(item: InboxItem): string {
  if (item.actions?.includes("approve")) return "Decide"
  if (item.actions?.includes("complete")) return "Complete"
  if (item.type === "hiring") return "Manage"
  return "Open"
}

export function HomeDashboard({ snapshot, inbox, actorEmail }: HomeDashboardProps) {
  const assigned = inbox.items.filter((item) => !item.isCompleted && (item.actionable || item.ownerEmail?.toLowerCase() === actorEmail.toLowerCase()))
  const decisions = assigned.filter((item) => item.requiresDecision && item.actionable)
  const overdue = assigned.filter((item) => item.slaStatus === "overdue")
  const reimbursements = assigned.filter((item) => item.type === "reimbursement")
  const attention = [...assigned].sort((left, right) => urgency(left) - urgency(right) || (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999")).slice(0, 6)
  const upcoming = snapshot.upcoming

  return (
    <WorkspacePage>
      <WorkspaceHeader
        title="Home"
        description="Work requiring attention."
        actions={<Button nativeButton={false} render={<Link href={withReturnTo("/people?new=employee", "/")} />}>Add employee</Button>}
      />

      <MetricStrip metrics={[
        { label: "Assigned to you", value: assigned.length.toLocaleString(), detail: `${overdue.length} overdue` },
        { label: "Awaiting decision", value: decisions.length.toLocaleString(), detail: "Requests you can decide" },
        { label: "Away today", value: snapshot.awayToday.toLocaleString(), detail: `${snapshot.activeEmployees.toLocaleString()} active employees` },
        { label: "Open requisitions", value: snapshot.activeRequisitions.toLocaleString(), detail: `${snapshot.offers} at offer` },
        { label: "Reimbursements", value: reimbursements.length.toLocaleString(), detail: "Claims requiring review" },
      ]} />

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <WorkspaceSectionHeader
          title="Needs attention"
          description="Work assigned to you or awaiting your decision."
          action={<Link href="/inbox?view=my_work" className="font-semibold text-primary hover:underline">View inbox</Link>}
        />
        <CardContent className="p-0">
          {attention.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-body">
                <thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr><th className="px-4 py-2.5">Work item</th><th className="px-4 py-2.5">Owner</th><th className="px-4 py-2.5">Due</th><th className="px-4 py-2.5"><span className="sr-only">Action</span></th></tr></thead>
                <tbody>{attention.map((item) => (
                  <tr key={`${item.type}-${item.id}`} className="border-t border-border/70 hover:bg-muted/20">
                    <td className="px-4 py-3"><p className="font-semibold">{item.title}</p><p className="text-meta text-muted-foreground">{item.nextAction}</p></td>
                    <td className="px-4 py-3"><p>{item.owner}</p><p className="text-meta text-muted-foreground">{item.type === "training" ? "Learning" : item.type === "insight" ? "Insights" : item.type[0].toUpperCase() + item.type.slice(1)}</p></td>
                    <td className={cn("whitespace-nowrap px-4 py-3", (item.slaStatus === "overdue" || item.slaStatus === "due_today") && "font-semibold text-destructive")}>{dueLabel(item)}</td>
                    <td className="px-4 py-3 text-right"><Link href={withReturnTo(item.recordHref, "/")} className="font-semibold text-primary hover:underline">{actionLabel(item)}</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="px-5 py-10 text-center text-muted-foreground">No work is currently assigned to you.</p>}
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <WorkspaceSectionHeader title="Upcoming" description="Starts, approved leave, and mandatory learning due in the next 30 days." />
        <CardContent className="divide-y divide-border p-0">
          {upcoming.length ? upcoming.map((event) => <Link key={event.id} href={withReturnTo(event.href, "/")} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20"><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{event.title}</span><span className="block truncate text-meta text-muted-foreground">{event.detail}</span></span><time className="shrink-0 text-meta text-muted-foreground">{readableDate(event.date)}</time></Link>) : <p className="px-5 py-8 text-center text-muted-foreground">No workforce events are scheduled in the next 30 days.</p>}
        </CardContent>
      </Card>
    </WorkspacePage>
  )
}
