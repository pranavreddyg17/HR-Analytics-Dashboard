"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  Gauge,
  GraduationCap,
  History,
  Mail,
  Pencil,
  Phone,
  RefreshCcw,
  ShieldAlert,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmployeeDrawer } from "@/components/people/employee-drawer"
import { PersonAvatar, StatusPill, formatDate, plural } from "@/components/people/people-ui"
import type { EmployeeActivity, EmployeeDirectoryResponse, EmployeeProfileResponse, ManagedEmployee } from "@/lib/people-types"
import { cn } from "@/lib/utils"
import { formatWorkspaceDateTime } from "@/lib/date-format"
import { WorkspacePage } from "@/components/workspace-ui"
import { safeReturnTo } from "@/lib/navigation"

type ProfileTab = "overview" | "job" | "time-off" | "growth" | "activity"

const tabs: Array<{ id: ProfileTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "job", label: "Job" },
  { id: "time-off", label: "Leave" },
  { id: "growth", label: "Growth" },
  { id: "activity", label: "Activity" },
]

export function PeopleProfile({ employeeId, returnTo }: { employeeId: string; returnTo?: string }) {
  const [data, setData] = useState<EmployeeProfileResponse | null>(null)
  const [managerPool, setManagerPool] = useState<ManagedEmployee[]>([])
  const [revision, setRevision] = useState(0)
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<ProfileTab>("overview")
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const requestRevision = revision
    fetch(`/api/v1/hr/people/${encodeURIComponent(employeeId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as EmployeeProfileResponse & { error?: string }
        if (!response.ok) throw new Error(body.error ?? "This employee profile is unavailable.")
        return body
      })
      .then((body) => { setData(body); setError("") })
      .catch((reason: unknown) => { if ((reason as { name?: string }).name !== "AbortError") setError(reason instanceof Error ? reason.message : "This employee profile is unavailable.") })
      .finally(() => { if (!controller.signal.aborted) setLoadedRevision(requestRevision) })
    return () => controller.abort()
  }, [employeeId, revision])

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/v1/hr/people?limit=250", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<EmployeeDirectoryResponse> : null)
      .then((body) => { if (body) setManagerPool(body.items) })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  const closeEdit = useCallback(() => setEditOpen(false), [])
  const refreshProfile = useCallback(() => setRevision((current) => current + 1), [])
  const loading = loadedRevision !== revision

  if (!data && loading) return <ProfileSkeleton />
  if (!data) return (
    <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center text-center">
      <h2 className="text-xl font-semibold">Profile unavailable</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error || "We could not find this employee."}</p>
      <Button nativeButton={false} variant="outline" className="mt-5" render={<Link href="/people" />}><ArrowLeft className="size-4" />Back to people</Button>
    </div>
  )

  const employee = data.employee
  const backHref = safeReturnTo(returnTo, "/people")
  return (
    <WorkspacePage>
      <div className="flex items-center justify-between gap-3">
        <Button nativeButton={false} variant="ghost" size="sm" className="-ml-2 text-muted-foreground" render={<Link href={backHref} />}><ArrowLeft className="size-4" />{backHref === "/people" ? "All people" : "Back to results"}</Button>
        {loading && <span className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCcw className="size-3.5 animate-spin" />Refreshing</span>}
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-none">
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-end">
          <PersonAvatar employeeId={employee.employee_id} initials={employee.initials} size="xl" />
          <div className="min-w-0 flex-1">
            {employee.archived_at && <div className="mb-2 text-meta font-semibold text-muted-foreground">Archived {formatDate(employee.archived_at)}</div>}
            <h1 className="truncate text-page font-semibold">{employee.display_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{employee.job_title} · {employee.department} · {employee.location}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={employee.employment_status} />
            <Button variant="outline" onClick={() => setEditOpen(true)} disabled={Boolean(employee.archived_at)}><Pencil className="size-3.5" />Edit profile</Button>
            <Button variant={employee.archived_at ? "outline" : "ghost"} className={cn(!employee.archived_at && "text-muted-foreground hover:text-destructive")} onClick={() => setArchiveOpen(true)}>{employee.archived_at ? <RefreshCcw className="size-3.5" /> : <Archive className="size-3.5" />}{employee.archived_at ? "Restore" : "Archive"}</Button>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-border/60 px-3 sm:px-5">
          <nav aria-label="Employee profile sections" className="flex min-w-max gap-1">
            {tabs.map((item) => {
              const active = tab === item.id
              return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold", active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{item.label}</button>
            })}
          </nav>
        </div>
      </section>

      <div>
          {tab === "overview" && <OverviewTab data={data} />}
          {tab === "job" && <JobTab data={data} />}
          {tab === "time-off" && <TimeOffTab data={data} />}
          {tab === "growth" && <GrowthTab data={data} />}
          {tab === "activity" && <ActivityTab data={data} />}
      </div>

      <EmployeeDrawer
        open={editOpen}
        mode="edit"
        employee={employee}
        managers={managerPool}
        dimensions={{ departments: [...new Set(managerPool.map((item) => item.department))], locations: [...new Set(managerPool.map((item) => item.location))] }}
        onClose={closeEdit}
        onSaved={refreshProfile}
      />
      <ArchiveDialog open={archiveOpen} employee={employee} onClose={() => setArchiveOpen(false)} onChanged={() => { setArchiveOpen(false); refreshProfile() }} />
    </WorkspacePage>
  )
}

function OverviewTab({ data }: { data: EmployeeProfileResponse }) {
  const { employee } = data
  const latestLeave = data.leave[0]
  const completedTraining = data.training.filter((item) => item.completion_status.toLowerCase() === "completed").length
  return <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
    <div className="grid gap-5 md:grid-cols-2">
      <InfoCard title="Contact" icon={Mail}>
        <InfoLine label="Work email" value={employee.work_email ?? "Not added"} href={employee.work_email ? `mailto:${employee.work_email}` : undefined} />
        <InfoLine label="Phone" value={employee.phone ?? "Not added"} href={employee.phone ? `tel:${employee.phone}` : undefined} />
        <InfoLine label="Location" value={employee.location} />
      </InfoCard>
      <InfoCard title="Employment" icon={BriefcaseBusiness}>
        <InfoLine label="Employee ID" value={employee.employee_id} />
        <InfoLine label="Hire date" value={formatDate(employee.hire_date)} />
        <InfoLine label="Employment" value={employee.employment_type} />
      </InfoCard>
      <InfoCard title="Reporting line" icon={UsersRound}>
        {data.manager ? <PersonLink employee={data.manager} detail="Manager" /> : <p className="text-sm text-muted-foreground">No manager assigned</p>}
        <div className="border-t border-border/60 pt-3"><p className="text-xs text-muted-foreground">Direct reports</p><p className="mt-1 text-lg font-semibold">{employee.direct_reports}</p></div>
      </InfoCard>
      <InfoCard title="Summary" icon={Gauge}>
        <InfoLine label="Tenure" value={`${employee.tenure_years.toFixed(1)} years`} />
        <InfoLine label="Training" value={`${completedTraining} of ${data.training.length} complete`} />
        <InfoLine label="Latest time off" value={latestLeave ? `${latestLeave.leave_type} · ${formatDate(latestLeave.start_date)}` : "No leave recorded"} />
      </InfoCard>
    </div>
    <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none">
      <div className="border-b border-border/60 px-5 py-4"><h3 className="font-semibold">Recent activity</h3><p className="mt-1 text-xs text-muted-foreground">Latest recorded profile and workflow changes</p></div>
      <div className="p-5">{data.activity.length ? <Timeline activity={data.activity.slice(0, 6)} compact /> : <EmptyState icon={History} title="No activity yet" detail="Profile changes and HR events will appear here." />}</div>
    </Card>
  </div>
}

function JobTab({ data }: { data: EmployeeProfileResponse }) {
  const { employee } = data
  return <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
    <div className="space-y-5">
      <InfoCard title="Current role" icon={BriefcaseBusiness}>
        <InfoLine label="Title" value={employee.job_title} />
        <InfoLine label="Department" value={employee.department} />
        <InfoLine label="Location" value={employee.location} />
        <InfoLine label="Employment type" value={employee.employment_type} />
      </InfoCard>
      <InfoCard title="Manager" icon={UserRound}>{data.manager ? <PersonLink employee={data.manager} detail={data.manager.job_title} /> : <p className="text-sm text-muted-foreground">No manager assigned</p>}</InfoCard>
    </div>
    <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none">
      <SectionHeader title="Team" detail={plural(data.directReports.length, "direct report")} icon={UsersRound} />
      <div className="divide-y divide-border/60">{data.directReports.length ? data.directReports.map((report) => <PersonLink key={report.employee_id} employee={report} detail={`${report.job_title} · ${report.location}`} roomy />) : <div className="p-8"><EmptyState icon={UsersRound} title="No direct reports" detail="Reporting relationships will appear here." /></div>}</div>
    </Card>
    <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none xl:col-span-2">
      <SectionHeader title="Promotion history" detail="Recorded job-title changes" icon={TrendingUp} />
      {data.promotions.length ? <div className="divide-y divide-border/60">{data.promotions.map((promotion) => <div key={promotion.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[130px_1fr_auto] sm:items-center"><p className="text-xs font-semibold text-muted-foreground">{formatDate(promotion.promotion_date)}</p><div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">{promotion.previous_title}</span><ArrowUpRight className="size-3.5 text-primary" /><span className="font-semibold">{promotion.new_title}</span></div><span className="text-xs text-muted-foreground">After {promotion.months_since_previous_promotion} months</span></div>)}</div> : <div className="p-8"><EmptyState icon={TrendingUp} title="No promotions recorded" detail="Promotion records will appear here." /></div>}
    </Card>
  </div>
}

function TimeOffTab({ data }: { data: EmployeeProfileResponse }) {
  const approvedDays = data.leave.filter((item) => item.approval_status.toLowerCase() === "approved").reduce((sum, item) => sum + item.leave_days, 0)
  const pending = data.leave.filter((item) => item.approval_status.toLowerCase() === "pending").length
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Approved days" value={approvedDays.toLocaleString()} detail="Across recorded requests" /><MetricCard label="Pending requests" value={pending.toLocaleString()} detail="Awaiting HR review" /><MetricCard label="Total requests" value={data.leave.length.toLocaleString()} detail="Complete leave history" /></div>
    <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title="Time-off history" detail="Requests, dates, and approval status" icon={CalendarDays} />{data.leave.length ? <div className="divide-y divide-border/60">{data.leave.map((leave) => <div key={leave.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><p className="text-sm font-semibold">{leave.leave_type}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(leave.start_date)} – {formatDate(leave.end_date)}</p></div><p className="text-sm"><b>{leave.leave_days}</b> {leave.leave_days === 1 ? "day" : "days"}</p><RecordStatus status={leave.approval_status} /></div>)}</div> : <div className="p-10"><EmptyState icon={CalendarDays} title="No time off recorded" detail="Leave requests for this employee will show up here." /></div>}</Card>
  </div>
}

function GrowthTab({ data }: { data: EmployeeProfileResponse }) {
  const completed = data.training.filter((item) => item.completion_status.toLowerCase() === "completed")
  const totalHours = data.training.reduce((sum, item) => sum + item.training_hours, 0)
  const scores = completed.map((item) => item.assessment_score).filter((score): score is number => score !== null)
  const averageScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Completed" value={`${completed.length}/${data.training.length}`} detail="Assigned programmes" /><MetricCard label="Learning hours" value={totalHours.toLocaleString()} detail="Total assigned time" /><MetricCard label="Average score" value={averageScore === null ? "—" : `${averageScore}%`} detail="Completed assessments" /></div>
    <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title="Learning" detail="Training programmes and progress" icon={GraduationCap} />{data.training.length ? <div className="divide-y divide-border/60">{data.training.map((training) => <div key={training.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-sm font-semibold">{training.training_program}</p><p className="mt-1 text-xs text-muted-foreground">{training.training_hours} hours{training.completion_date ? ` · Completed ${formatDate(training.completion_date)}` : ""}</p></div><div className="flex items-center gap-3"><RecordStatus status={training.completion_status} />{training.assessment_score !== null && <span className="font-mono text-sm font-semibold">{training.assessment_score}%</span>}</div></div>)}</div> : <div className="p-10"><EmptyState icon={GraduationCap} title="No learning assigned" detail="Training progress will appear here." /></div>}</Card>
      <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title="Promotions" detail={plural(data.promotions.length, "promotion")} icon={TrendingUp} /><div className="p-5">{data.promotions.length ? <div className="space-y-4">{data.promotions.map((promotion) => <div key={promotion.id} className="relative border-l-2 border-primary/25 pl-4"><span className="absolute -left-[5px] top-1 size-2 rounded-full bg-primary" /><p className="text-sm font-semibold">{promotion.new_title}</p><p className="mt-1 text-xs text-muted-foreground">Previous title: {promotion.previous_title}</p><p className="mt-2 text-meta font-semibold text-primary">{formatDate(promotion.promotion_date)}</p></div>)}</div> : <EmptyState icon={TrendingUp} title="No promotions recorded" detail="Promotion records will appear here." />}</div></Card>
    </div>
  </div>
}

function ActivityTab({ data }: { data: EmployeeProfileResponse }) {
  return <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
    <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title="Change history" detail="Recorded profile and workflow changes" icon={History} /><div className="p-5">{data.activity.length ? <Timeline activity={data.activity} /> : <EmptyState icon={History} title="No activity recorded" detail="Profile and workflow changes will appear here." />}</div></Card>
    <div className="space-y-5">
      <InfoCard title="Record details" icon={ShieldAlert}><InfoLine label="Version" value={`v${data.employee.version}`} /><InfoLine label="Last updated" value={data.employee.updated_at ? formatWorkspaceDateTime(data.employee.updated_at) : "Not recorded"} /></InfoCard>
      {data.attritionModel && <InfoCard title="Historical model context" icon={Gauge}>
        <InfoLine label="Risk band" value={`${data.attritionModel.risk_level} · ${Number(data.attritionModel.risk_score).toFixed(1)}%`} />
        <InfoLine label="Observed outcome" value={data.attritionModel.observed_attrition === "Yes" ? "Recorded exit" : "No recorded exit"} />
        <InfoLine label="Model version" value={data.attritionModel.model_version} />
        <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">{data.attritionModel.top_driver}</p>
      </InfoCard>}
      {data.attrition.length > 0 && <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title="Exit records" detail="Recorded employee departures" icon={Archive} /><div className="divide-y divide-border/60">{data.attrition.map((item) => <div key={item.id} className="p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{item.exit_reason}</p><RecordStatus status={item.exit_type} /></div><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.exit_date)} · {item.tenure_years} years tenure</p></div>)}</div></Card>}
    </div>
  </div>
}

function InfoCard({ title, icon, children }: { title: string; icon: typeof UserRound; children: React.ReactNode }) {
  return <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title={title} icon={icon} /><div className="space-y-4 p-5">{children}</div></Card>
}

function SectionHeader({ title, detail }: { title: string; detail?: string; icon: typeof UserRound }) {
  return <div className="border-b border-border/60 px-5 py-4"><h3 className="font-semibold">{title}</h3>{detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}</div>
}

function InfoLine({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = <><span className="text-xs text-muted-foreground">{label}</span><span className={cn("max-w-[65%] truncate text-right text-sm font-semibold", href && "text-primary")}>{value}</span></>
  return href ? <a href={href} className="flex items-center justify-between gap-4 hover:underline">{content}</a> : <div className="flex items-center justify-between gap-4">{content}</div>
}

function PersonLink({ employee, detail, roomy = false }: { employee: ManagedEmployee; detail: string; roomy?: boolean }) {
  return <Link href={`/people/${encodeURIComponent(employee.employee_id)}`} className={cn("group flex items-center gap-3 rounded-md transition-colors hover:bg-primary/[0.04]", roomy ? "rounded-none px-5 py-4" : "-mx-2 p-2")}><PersonAvatar employeeId={employee.employee_id} initials={employee.initials} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold group-hover:text-primary">{employee.display_name}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div><ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-primary" /></Link>
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="gap-1 rounded-lg border-border/70 p-5 shadow-none"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></Card>
}

function RecordStatus({ status }: { status: string }) {
  const positive = /approved|completed|voluntary/i.test(status)
  const pending = /pending|incomplete|open/i.test(status)
  return <span className={cn("inline-flex w-fit items-center rounded-sm border px-2.5 py-1 text-status font-semibold", positive ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300" : pending ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300" : "border-border bg-muted text-muted-foreground")}>{status}</span>
}

function Timeline({ activity, compact = false }: { activity: EmployeeActivity[]; compact?: boolean }) {
  return <div className="divide-y divide-border">{activity.map((item) => {
    const changedFields = parseChangedFields(item.changes_json)
    return <div key={item.id} className="py-3 first:pt-0 last:pb-0"><p className="text-sm font-semibold">{item.summary}</p><p className="mt-1 text-meta text-muted-foreground">{formatWorkspaceDateTime(item.created_at)} · {item.actor_email}</p>{!compact && changedFields.length > 0 && <p className="mt-2 text-meta text-muted-foreground">Fields changed: {changedFields.map(friendlyField).join(", ")}</p>}</div>
  })}</div>
}

function parseChangedFields(value: string | null): string[] {
  if (!value) return []
  try { const parsed = JSON.parse(value) as Record<string, unknown>; return Object.keys(parsed).slice(0, 8) } catch { return [] }
}

function friendlyField(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

function EmptyState({ title, detail }: { icon: typeof UserRound; title: string; detail: string }) {
  return <div className="text-center"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
}

function ArchiveDialog({ open, employee, onClose, onChanged }: { open: boolean; employee: ManagedEmployee; onClose: () => void; onChanged: () => void }) {
  const reduceMotion = useReducedMotion()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const restoring = Boolean(employee.archived_at)

  async function changeStatus() {
    setBusy(true); setError("")
    try {
      const action = restoring ? "restore" : "archive"
      const response = await fetch(`/api/v1/hr/people/${encodeURIComponent(employee.employee_id)}/${action}`, { method: "POST" })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? `Unable to ${action} this employee.`)
      onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update this profile.") }
    finally { setBusy(false) }
  }

  return <AnimatePresence>{open && <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"><motion.button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} /><motion.div role="alertdialog" aria-modal="true" className="relative w-full max-w-md rounded-lg border border-border bg-background p-6" initial={{ opacity: 0, scale: reduceMotion ? 1 : .98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}><button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><X className="size-4" /></button><h3 className="text-lg font-semibold">{restoring ? "Restore employee?" : "Archive employee?"}</h3><p className="mt-2 text-sm text-muted-foreground">{restoring ? `${employee.display_name} will return to the active directory with an Active status.` : `${employee.display_name} will be removed from the active directory. The employee history will be retained.`}</p>{error && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}<div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant={restoring ? "default" : "destructive"} onClick={() => void changeStatus()} disabled={busy}>{busy ? "Updating…" : restoring ? "Restore employee" : "Archive employee"}</Button></div></motion.div></div>}</AnimatePresence>
}

function ProfileSkeleton() {
  return <div className="mx-auto w-full max-w-[1500px] space-y-5"><div className="h-8 w-24 animate-pulse rounded-lg bg-muted" /><div className="rounded-lg border border-border bg-card p-7"><div className="flex items-center gap-5"><div className="size-20 animate-pulse rounded-full bg-muted" /><div className="space-y-3"><div className="h-7 w-56 animate-pulse rounded bg-muted" /><div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" /></div></div><div className="mt-7 h-10 animate-pulse rounded bg-muted" /></div><div className="grid gap-5 md:grid-cols-2"><div className="h-64 animate-pulse rounded-lg bg-muted" /><div className="h-64 animate-pulse rounded-lg bg-muted" /></div></div>
}
