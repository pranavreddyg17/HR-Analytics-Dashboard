"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import {
  ArrowLeft,
  ArrowUpRight,
  Pencil,
  RefreshCcw,
  Trash2,
  UserMinus,
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

type ProfileTab = "overview" | "job" | "time-off" | "growth" | "management" | "activity"

const tabs: Array<{ id: ProfileTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "job", label: "Job" },
  { id: "time-off", label: "Leave" },
  { id: "growth", label: "Growth" },
  { id: "management", label: "Management" },
  { id: "activity", label: "Activity" },
]

export function PeopleProfile({ employeeId, returnTo }: { employeeId: string; returnTo?: string }) {
  const router = useRouter()
  const [data, setData] = useState<EmployeeProfileResponse | null>(null)
  const [managerPool, setManagerPool] = useState<ManagedEmployee[]>([])
  const [revision, setRevision] = useState(0)
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<ProfileTab>("overview")
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

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
  const visibleTabs = tabs.filter((item) => item.id !== "management" || data.permissions.canManageEmployment || data.permissions.canManageMeetings)
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
            {employee.archived_at && <div className="mb-2 text-meta font-semibold text-muted-foreground">Employment ended {formatDate(employee.archived_at)}</div>}
            <h1 className="truncate text-page font-semibold">{employee.display_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{employee.job_title} · {employee.department} · {employee.location}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={employee.employment_status} />
            <Button variant="outline" onClick={() => setEditOpen(true)} disabled={Boolean(employee.archived_at)}><Pencil className="size-3.5" />Edit profile</Button>
            <Button variant={employee.archived_at ? "outline" : "ghost"} className={cn(!employee.archived_at && "text-muted-foreground hover:text-destructive")} onClick={() => setArchiveOpen(true)}>{employee.archived_at ? <RefreshCcw className="size-3.5" /> : <UserMinus className="size-3.5" />}{employee.archived_at ? "Restore" : "Terminate"}</Button>
            {data.permissions.canDeleteEmployee && (employee.archived_at || ["terminated", "resigned"].includes(employee.employment_status.toLowerCase())) && <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="size-3.5" />Delete record</Button>}
          </div>
        </div>

        <div className="overflow-x-auto border-t border-border/60 px-3 sm:px-5">
          <nav aria-label="Employee profile sections" className="flex min-w-max gap-1">
            {visibleTabs.map((item) => {
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
          {tab === "management" && <ManagementTab data={data} onChanged={refreshProfile} />}
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
      <DeleteEmployeeDialog open={deleteOpen} employee={employee} onClose={() => setDeleteOpen(false)} onDeleted={() => { setDeleteOpen(false); router.replace("/people?population=former"); router.refresh() }} />
    </WorkspacePage>
  )
}

const managementFieldClass = "mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-control font-normal outline-none focus:ring-2 focus:ring-primary/20"
const managementTextAreaClass = "mt-1 min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-control font-normal outline-none focus:ring-2 focus:ring-primary/20"

function ManagementTab({ data, onChanged }: { data: EmployeeProfileResponse; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [followUpUrl, setFollowUpUrl] = useState("")
  const endpoint = `/api/v1/hr/people/${encodeURIComponent(data.employee.employee_id)}/management`
  const today = new Date().toISOString().slice(0, 10)
  const scheduledMeetings = data.meetings.filter((meeting) => String(meeting.status) === "scheduled")
  const serviceRequests = [
    ...data.reimbursements.map((row) => ({ id: String(row.id), submittedAt: String(row.submitted_at ?? ""), requestType: "Reimbursement", requestTitle: `${String(row.category)} · ${formatMoney(row.amount, row.currency)}`, requestStatus: String(row.status), requestNote: row.decision_note, inboxType: "reimbursement" })),
    ...data.cases.map((row) => ({ id: String(row.id), submittedAt: String(row.submitted_at ?? ""), requestType: "Employee request", requestTitle: String(row.subject), requestStatus: String(row.status), requestNote: row.resolution_note, inboxType: "case" })),
  ].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))

  async function submit(payload: Record<string, unknown>, form?: HTMLFormElement) {
    setBusy(true); setMessage("")
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      const body = await response.json() as { error?: string; message?: string; emailDraft?: { launchUrl?: string | null } }
      if (!response.ok) throw new Error(body.error ?? "The employee record could not be updated.")
      setMessage(body.message ?? "Employee record updated.")
      setFollowUpUrl(body.emailDraft?.launchUrl ?? "")
      form?.reset()
      onChanged()
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The employee record could not be updated.") }
    finally { setBusy(false) }
  }

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    form.set("employeeId", data.employee.employee_id)
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/v1/employee/documents", { method: "POST", body: form })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "The document could not be uploaded.")
      setMessage("Document uploaded to the employee profile.")
      formElement.reset()
      onChanged()
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "The document could not be uploaded.") }
    finally { setBusy(false) }
  }

  const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim()
  return <div className="space-y-4">
    {message && <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3 text-body" role="status"><span>{message}</span>{followUpUrl && <a href={followUpUrl} target="_blank" rel="noreferrer" className="text-button">Review follow-up email</a>}</div>}
    {data.permissions.canManageReviews && data.reviews.length > 0 && <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none">
      <SectionHeader title="Performance reviews" detail="Employee self-reviews awaiting manager input and completed review records." />
      <div className="divide-y divide-border/60">
        {data.reviews.map((review) => <div key={String(review.id)} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-card-title font-semibold">{String(review.cycle_name)}</p><p className="mt-1 text-meta text-muted-foreground">{formatDate(String(review.starts_on))} to {formatDate(String(review.ends_on))}</p></div><RecordStatus status={String(review.status)} /></div>
          {Boolean(review.self_review) && <div className="mt-4 rounded-md bg-muted/35 p-3"><p className="text-label font-semibold">Employee self-review</p><p className="mt-1 whitespace-pre-wrap text-body text-muted-foreground">{String(review.self_review)}</p>{Boolean(review.employee_rating) && <p className="mt-2 text-meta text-muted-foreground">Self-rating: {String(review.employee_rating)} / 5</p>}</div>}
          {String(review.status) === "manager_review" && <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void submit({ action: "submit_manager_review", reviewId: String(review.id), managerReview: value(values, "managerReview"), managerRating: Number(value(values, "managerRating")) }, form) }}>
            <label className="block text-label text-muted-foreground">Manager review<textarea required name="managerReview" minLength={50} maxLength={10000} className={managementTextAreaClass} placeholder="Record outcomes, strengths, development priorities, and agreed support." /></label>
            <label className="block max-w-xs text-label text-muted-foreground">Manager rating<select required name="managerRating" defaultValue="" className={managementFieldClass}><option value="" disabled>Select rating</option><option value="1">1 – Below expectations</option><option value="2">2 – Developing</option><option value="3">3 – Meets expectations</option><option value="4">4 – Exceeds expectations</option><option value="5">5 – Exceptional</option></select></label>
            <Button type="submit" size="sm" className="w-fit" disabled={busy}>Complete manager review</Button>
          </form>}
          {Boolean(review.manager_review) && <div className="mt-4"><p className="text-label font-semibold">Manager review</p><p className="mt-1 whitespace-pre-wrap text-body text-muted-foreground">{String(review.manager_review)}</p>{Boolean(review.manager_rating) && <p className="mt-2 text-meta text-muted-foreground">Manager rating: {String(review.manager_rating)} / 5</p>}</div>}
        </div>)}
      </div>
    </Card>}
    {data.permissions.canManageMeetings && <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none">
      <SectionHeader title="One-on-ones" detail="Schedule meetings, prepare a synopsis, and approve the follow-up before an email draft is created." />
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const raw = value(values, "scheduledAt"); void submit({ action: "schedule_one_on_one", scheduledAt: new Date(raw).toISOString() }, form) }}>
          <p className="text-card-title font-semibold">Schedule meeting</p>
          <label className="block text-label text-muted-foreground">Date and time<input className={managementFieldClass} type="datetime-local" name="scheduledAt" required /></label>
          <Button type="submit" size="sm" disabled={busy}>Schedule</Button>
        </form>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void submit({ action: "complete_one_on_one", meetingId: value(values, "meetingId"), employeeNotes: value(values, "employeeNotes"), managerNotes: value(values, "managerNotes") }, form) }}>
          <p className="text-card-title font-semibold">Record outcome</p>
          <label className="block text-label text-muted-foreground">Scheduled meeting<select className={managementFieldClass} name="meetingId" required defaultValue=""><option value="" disabled>Select meeting</option>{scheduledMeetings.map((meeting) => <option key={String(meeting.id)} value={String(meeting.id)}>{formatWorkspaceDateTime(String(meeting.scheduled_at))}</option>)}</select></label>
          <label className="block text-label text-muted-foreground">Employee notes<textarea className={managementTextAreaClass} name="employeeNotes" maxLength={10000} /></label>
          <label className="block text-label text-muted-foreground">Manager notes<textarea className={managementTextAreaClass} name="managerNotes" minLength={20} maxLength={10000} required /></label>
          <Button type="submit" size="sm" disabled={busy || !scheduledMeetings.length}>Prepare synopsis</Button>
        </form>
      </div>
      <div className="border-t border-border/60">
        {data.meetings.length ? data.meetings.map((meeting) => <div key={String(meeting.id)} className="grid gap-2 border-b border-border/60 px-5 py-3 last:border-0 lg:grid-cols-[180px_100px_1fr_auto] lg:items-start"><p className="text-body font-semibold">{formatWorkspaceDateTime(String(meeting.scheduled_at))}</p><RecordStatus status={String(meeting.status)} /><p className="text-body text-muted-foreground">{meeting.ai_summary ? String(meeting.ai_summary) : "No synopsis recorded."}</p>{meeting.ai_summary && !meeting.summary_approved_at ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void submit({ action: "approve_one_on_one_summary", meetingId: String(meeting.id) })}>Approve follow-up</Button> : <span className="text-meta text-muted-foreground">{meeting.summary_approved_at ? "Approved" : ""}</span>}</div>) : <p className="px-5 py-8 text-center text-body text-muted-foreground">No one-on-ones recorded.</p>}
      </div>
    </Card>}

    {data.permissions.canManageEmployment && <div className="grid gap-4 xl:grid-cols-3">
      <form className="surface-card p-5" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void submit({ action: "set_compensation", annualSalary: Number(value(values, "annualSalary")), currency: value(values, "currency"), payFrequency: value(values, "payFrequency"), effectiveFrom: value(values, "effectiveFrom") }, form) }}>
        <h3 className="text-section-title">Compensation</h3><div className="mt-4 space-y-3"><label className="block text-label text-muted-foreground">Annual amount<input className={managementFieldClass} type="number" name="annualSalary" min="0" step="0.01" required /></label><div className="grid grid-cols-2 gap-2"><label className="block text-label text-muted-foreground">Currency<input className={managementFieldClass} name="currency" defaultValue="USD" maxLength={3} required /></label><label className="block text-label text-muted-foreground">Frequency<select className={managementFieldClass} name="payFrequency" defaultValue="annual"><option value="annual">Annual</option><option value="monthly">Monthly</option><option value="biweekly">Biweekly</option><option value="weekly">Weekly</option><option value="hourly">Hourly</option></select></label></div><label className="block text-label text-muted-foreground">Effective date<input className={managementFieldClass} type="date" name="effectiveFrom" defaultValue={today} required /></label><Button type="submit" size="sm" disabled={busy}>Save compensation</Button></div>
      </form>
      <form className="surface-card p-5" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void submit({ action: "assign_project", projectCode: value(values, "projectCode"), projectName: value(values, "projectName"), clientName: value(values, "clientName") || null, roleTitle: value(values, "roleTitle"), allocationPercent: Number(value(values, "allocationPercent")), startsOn: value(values, "startsOn"), endsOn: value(values, "endsOn") || null, isPrimary: values.get("isPrimary") === "on" }, form) }}>
        <h3 className="text-section-title">Project assignment</h3><div className="mt-4 space-y-3"><div className="grid grid-cols-2 gap-2"><label className="block text-label text-muted-foreground">Project code<input className={managementFieldClass} name="projectCode" maxLength={40} required /></label><label className="block text-label text-muted-foreground">Allocation %<input className={managementFieldClass} type="number" name="allocationPercent" min="1" max="100" defaultValue="100" required /></label></div><label className="block text-label text-muted-foreground">Project name<input className={managementFieldClass} name="projectName" maxLength={160} required /></label><label className="block text-label text-muted-foreground">Client<input className={managementFieldClass} name="clientName" maxLength={160} /></label><label className="block text-label text-muted-foreground">Role<input className={managementFieldClass} name="roleTitle" defaultValue={data.employee.job_title} maxLength={160} required /></label><div className="grid grid-cols-2 gap-2"><label className="block text-label text-muted-foreground">Starts<input className={managementFieldClass} type="date" name="startsOn" defaultValue={today} required /></label><label className="block text-label text-muted-foreground">Ends<input className={managementFieldClass} type="date" name="endsOn" /></label></div><label className="flex items-center gap-2 text-body"><input type="checkbox" name="isPrimary" />Primary assignment</label><Button type="submit" size="sm" disabled={busy}>Assign project</Button></div>
      </form>
      <form className="surface-card p-5" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); void submit({ action: "create_review", cycleName: value(values, "cycleName"), startsOn: value(values, "startsOn"), endsOn: value(values, "endsOn") }, form) }}>
        <h3 className="text-section-title">Performance review</h3><div className="mt-4 space-y-3"><label className="block text-label text-muted-foreground">Cycle name<input className={managementFieldClass} name="cycleName" maxLength={160} required /></label><label className="block text-label text-muted-foreground">Starts<input className={managementFieldClass} type="date" name="startsOn" defaultValue={today} required /></label><label className="block text-label text-muted-foreground">Ends<input className={managementFieldClass} type="date" name="endsOn" required /></label><Button type="submit" size="sm" disabled={busy}>Assign review</Button></div>
      </form>
    </div>}
    {data.permissions.canManageEmployment && <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none">
      <SectionHeader title="Employee documents" detail="Files are stored privately in Azure Blob Storage and access follows the selected visibility." />
      <form onSubmit={uploadDocument} className="grid gap-3 border-b border-border/60 p-5 md:grid-cols-[160px_160px_minmax(220px,1fr)_auto] md:items-end">
        <label className="block text-label text-muted-foreground">Document type<select name="documentType" defaultValue="supporting_document" className={managementFieldClass}><option value="resume">Resume</option><option value="profile_photo">Profile photo</option><option value="supporting_document">Supporting document</option></select></label>
        <label className="block text-label text-muted-foreground">Visible to<select name="visibility" defaultValue="employee" className={managementFieldClass}><option value="employee">Employee and HR</option><option value="manager">Manager and HR</option><option value="hr">HR only</option></select></label>
        <label className="block text-label text-muted-foreground">File<input required name="file" type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" className={managementFieldClass} /></label>
        <Button type="submit" size="sm" disabled={busy}>Upload</Button>
      </form>
      <div className="divide-y divide-border/60">{data.documents.length ? data.documents.map((document) => <div key={String(document.id)} className="grid gap-2 px-5 py-3 sm:grid-cols-[1fr_120px_160px_auto] sm:items-center"><div><p className="text-card-title font-semibold">{String(document.file_name)}</p><p className="text-meta capitalize text-muted-foreground">{String(document.document_type).replaceAll("_", " ")}</p></div><span className="text-meta capitalize text-muted-foreground">{String(document.visibility)}</span><span className="text-meta text-muted-foreground">{formatWorkspaceDateTime(String(document.created_at))}</span><a className="text-button" href={`/api/v1/employee/documents?id=${encodeURIComponent(String(document.id))}`}>Download</a></div>) : <p className="px-5 py-8 text-center text-body text-muted-foreground">No documents uploaded.</p>}</div>
    </Card>}
    {data.permissions.canManageEmployment && <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none">
      <SectionHeader title="Employee service requests" detail="Reimbursements and employee-raised cases use the same records shown in Inbox and employee self-service." />
      <div className="divide-y divide-border/60">
        {serviceRequests.map((request) => <div key={`${request.inboxType}-${request.id}`} className="grid gap-2 px-5 py-3 md:grid-cols-[130px_minmax(0,1fr)_120px_auto] md:items-start">
            <span className="text-meta text-muted-foreground">{request.requestType}</span>
            <div><p className="text-card-title font-semibold capitalize">{request.requestTitle}</p>{Boolean(request.requestNote) && <p className="mt-1 text-meta text-muted-foreground">Outcome: {String(request.requestNote)}</p>}</div>
            <RecordStatus status={String(request.requestStatus)} />
            <Link className="text-button" href={`/inbox?type=${request.inboxType}&item=${encodeURIComponent(request.id)}&returnTo=${encodeURIComponent(`/people/${data.employee.employee_id}`)}`}>Open in Inbox</Link>
          </div>)}
        {!data.reimbursements.length && !data.cases.length && <p className="px-5 py-8 text-center text-body text-muted-foreground">No employee service requests.</p>}
      </div>
    </Card>}
  </div>
}

function OverviewTab({ data }: { data: EmployeeProfileResponse }) {
  const { employee } = data
  const latestLeave = data.leave[0]
  const completedTraining = data.training.filter((item) => item.completion_status.toLowerCase() === "completed").length
  const currentProject = data.projects.find((item) => Boolean(item.is_primary)) ?? data.projects.find((item) => String(item.status) === "active")
  return <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
    <div className="grid gap-5 md:grid-cols-2">
      <InfoCard title="Contact">
        <InfoLine label="Work email" value={employee.work_email ?? "Not added"} href={employee.work_email ? `mailto:${employee.work_email}` : undefined} />
        <InfoLine label="Phone" value={employee.phone ?? "Not added"} href={employee.phone ? `tel:${employee.phone}` : undefined} />
        <InfoLine label="Location" value={employee.location} />
      </InfoCard>
      <InfoCard title="Employment">
        <InfoLine label="Employee ID" value={employee.employee_id} />
        <InfoLine label="Hire date" value={formatDate(employee.hire_date)} />
        <InfoLine label="Employment" value={employee.employment_type} />
      </InfoCard>
      <InfoCard title="Reporting line">
        {data.manager ? <PersonLink employee={data.manager} detail="Manager" /> : <p className="text-sm text-muted-foreground">No manager assigned</p>}
        <div className="border-t border-border/60 pt-3"><p className="text-xs text-muted-foreground">Direct reports</p><p className="mt-1 text-lg font-semibold">{employee.direct_reports}</p></div>
      </InfoCard>
      <InfoCard title="Summary">
        <InfoLine label="Tenure" value={`${employee.tenure_years.toFixed(1)} years`} />
        <InfoLine label="Training" value={`${completedTraining} of ${data.training.length} complete`} />
        <InfoLine label="Latest time off" value={latestLeave ? `${latestLeave.leave_type} · ${formatDate(latestLeave.start_date)}` : "No leave recorded"} />
        <InfoLine label="Current project" value={currentProject ? String(currentProject.name) : "Not assigned"} />
        {data.compensation && <InfoLine label="Annual salary" value={formatMoney(data.compensation.annual_salary, data.compensation.currency)} />}
      </InfoCard>
      <InfoCard title="Assigned assets">
        {data.assets.length ? data.assets.map((asset) => <Link key={asset.id} href={`/assets/${encodeURIComponent(asset.assetTag)}`} className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0 hover:text-primary"><span><span className="block text-sm font-semibold">{asset.assetTag}</span><span className="text-xs text-muted-foreground">{asset.assetType} · {asset.condition}</span></span><ArrowUpRight className="size-4" /></Link>) : <p className="text-sm text-muted-foreground">No assets currently assigned</p>}
      </InfoCard>
      <InfoCard title="Exit status">
        {data.exits.length ? data.exits.slice(0, 2).map((exit) => <Link key={exit.id} href={`/exits?exit=${encodeURIComponent(exit.id)}`} className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0 hover:text-primary"><span><span className="block text-sm font-semibold">{exit.status}</span><span className="text-xs text-muted-foreground">{exit.exitType} · {formatDate(exit.expectedExitDate)}</span></span><ArrowUpRight className="size-4" /></Link>) : <p className="text-sm text-muted-foreground">No exit workflow recorded</p>}
      </InfoCard>
    </div>
    <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none">
      <div className="border-b border-border/60 px-5 py-4"><h3 className="font-semibold">Recent activity</h3><p className="mt-1 text-xs text-muted-foreground">Latest recorded profile and workflow changes</p></div>
      <div className="p-5">{data.activity.length ? <Timeline activity={data.activity.slice(0, 6)} compact /> : <EmptyState title="No activity yet" detail="Profile changes and HR events will appear here." />}</div>
    </Card>
  </div>
}

function JobTab({ data }: { data: EmployeeProfileResponse }) {
  const { employee } = data
  return <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
    <div className="space-y-5">
      <InfoCard title="Current role">
        <InfoLine label="Title" value={employee.job_title} />
        <InfoLine label="Department" value={employee.department} />
        <InfoLine label="Location" value={employee.location} />
        <InfoLine label="Employment type" value={employee.employment_type} />
      </InfoCard>
      <InfoCard title="Manager">{data.manager ? <PersonLink employee={data.manager} detail={data.manager.job_title} /> : <p className="text-sm text-muted-foreground">No manager assigned</p>}</InfoCard>
      <InfoCard title="Project assignments">{data.projects.length ? data.projects.map((project) => <div key={String(project.id)} className="border-b border-border/60 pb-3 last:border-0 last:pb-0"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{String(project.name)}</p><span className="text-xs text-muted-foreground">{String(project.allocation_percent)}%</span></div><p className="mt-1 text-xs text-muted-foreground">{String(project.role_title)}{Boolean(project.client_name) ? ` · ${String(project.client_name)}` : ""}</p></div>) : <p className="text-sm text-muted-foreground">No project assignments recorded</p>}</InfoCard>
    </div>
    <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none">
      <SectionHeader title="Team" detail={plural(data.directReports.length, "direct report")} />
      <div className="divide-y divide-border/60">{data.directReports.length ? data.directReports.map((report) => <PersonLink key={report.employee_id} employee={report} detail={`${report.job_title} · ${report.location}`} roomy />) : <div className="p-8"><EmptyState title="No direct reports" detail="Reporting relationships will appear here." /></div>}</div>
    </Card>
    <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none xl:col-span-2">
      <SectionHeader title="Promotion history" detail="Recorded job-title changes" />
      {data.promotions.length ? <div className="divide-y divide-border/60">{data.promotions.map((promotion) => <div key={promotion.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[130px_1fr_auto] sm:items-center"><p className="text-xs font-semibold text-muted-foreground">{formatDate(promotion.promotion_date)}</p><div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">{promotion.previous_title}</span><ArrowUpRight className="size-3.5 text-primary" /><span className="font-semibold">{promotion.new_title}</span></div><span className="text-xs text-muted-foreground">After {promotion.months_since_previous_promotion} months</span></div>)}</div> : <div className="p-8"><EmptyState title="No promotions recorded" detail="Promotion records will appear here." /></div>}
    </Card>
  </div>
}

function TimeOffTab({ data }: { data: EmployeeProfileResponse }) {
  const approvedDays = data.leave.filter((item) => item.approval_status.toLowerCase() === "approved").reduce((sum, item) => sum + item.leave_days, 0)
  const pending = data.leave.filter((item) => item.approval_status.toLowerCase() === "pending").length
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard label="Approved days" value={approvedDays.toLocaleString()} detail="Across recorded requests" /><MetricCard label="Pending requests" value={pending.toLocaleString()} detail="Awaiting HR review" /><MetricCard label="Total requests" value={data.leave.length.toLocaleString()} detail="Complete leave history" /></div>
    <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title="Leave history" detail="Requests, dates, and status" />{data.leave.length ? <div className="divide-y divide-border/60">{data.leave.map((leave) => <div key={leave.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><p className="text-sm font-semibold">{leave.leave_type}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(leave.start_date)} – {formatDate(leave.end_date)}</p></div><p className="text-sm"><b>{leave.leave_days}</b> {leave.leave_days === 1 ? "day" : "days"}</p><RecordStatus status={leave.approval_status} /></div>)}</div> : <div className="p-10"><EmptyState title="No leave recorded" detail="Leave requests will appear here." /></div>}</Card>
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
      <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title="Learning" detail="Courses and progress" />{data.training.length ? <div className="divide-y divide-border/60">{data.training.map((training) => <div key={training.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-sm font-semibold">{training.training_program}</p><p className="mt-1 text-xs text-muted-foreground">{training.training_hours} hours{training.completion_date ? ` · Completed ${formatDate(training.completion_date)}` : ""}</p></div><div className="flex items-center gap-3"><RecordStatus status={training.completion_status} />{training.assessment_score !== null && <span className="font-mono text-sm font-semibold">{training.assessment_score}%</span>}</div></div>)}</div> : <div className="p-10"><EmptyState title="No learning assigned" detail="Training progress will appear here." /></div>}</Card>
      <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title="Promotions" detail={plural(data.promotions.length, "promotion")} /><div className="p-5">{data.promotions.length ? <div className="space-y-4">{data.promotions.map((promotion) => <div key={promotion.id} className="relative border-l-2 border-primary/25 pl-4"><span className="absolute -left-[5px] top-1 size-2 rounded-full bg-primary" /><p className="text-sm font-semibold">{promotion.new_title}</p><p className="mt-1 text-xs text-muted-foreground">Previous title: {promotion.previous_title}</p><p className="mt-2 text-meta font-semibold text-primary">{formatDate(promotion.promotion_date)}</p></div>)}</div> : <EmptyState title="No promotions recorded" detail="Promotion records will appear here." />}</div></Card>
    </div>
  </div>
}

function ActivityTab({ data }: { data: EmployeeProfileResponse }) {
  return <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
    <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title="Change history" detail="Profile and workflow changes" /><div className="p-5">{data.activity.length ? <Timeline activity={data.activity} /> : <EmptyState title="No activity recorded" detail="Profile and workflow changes will appear here." />}</div></Card>
    <div className="space-y-5">
      <InfoCard title="Record details"><InfoLine label="Version" value={`v${data.employee.version}`} /><InfoLine label="Last updated" value={data.employee.updated_at ? formatWorkspaceDateTime(data.employee.updated_at) : "Not recorded"} /></InfoCard>
      {data.attritionModel && <InfoCard title="Historical model context">
        <InfoLine label="Risk band" value={`${data.attritionModel.risk_level} · ${Number(data.attritionModel.risk_score).toFixed(1)}%`} />
        <InfoLine label="Observed outcome" value={data.attritionModel.observed_attrition === "Yes" ? "Recorded exit" : "No recorded exit"} />
        <InfoLine label="Model version" value={data.attritionModel.model_version} />
        <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">{data.attritionModel.top_driver}</p>
      </InfoCard>}
      {data.attrition.length > 0 && <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title="Exit records" detail="Recorded departures" /><div className="divide-y divide-border/60">{data.attrition.map((item) => <div key={item.id} className="p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{item.exit_reason}</p><RecordStatus status={item.exit_type} /></div><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.exit_date)} · {item.tenure_years} years tenure</p></div>)}</div></Card>}
    </div>
  </div>
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="gap-0 overflow-hidden rounded-lg border-border/70 shadow-none"><SectionHeader title={title} /><div className="space-y-4 p-5">{children}</div></Card>
}

function SectionHeader({ title, detail }: { title: string; detail?: string }) {
  return <div className="border-b border-border/60 px-5 py-4"><h3 className="font-semibold">{title}</h3>{detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}</div>
}

function InfoLine({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = <><span className="text-xs text-muted-foreground">{label}</span><span className={cn("max-w-[65%] truncate text-right text-sm font-semibold", href && "text-primary")}>{value}</span></>
  return href ? <a href={href} className="flex items-center justify-between gap-4 hover:underline">{content}</a> : <div className="flex items-center justify-between gap-4">{content}</div>
}

function formatMoney(value: unknown, currency: unknown): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return "Not recorded"
  return new Intl.NumberFormat("en", { style: "currency", currency: String(currency || "USD"), maximumFractionDigits: 0 }).format(amount)
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

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="text-center"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
}

function ArchiveDialog({ open, employee, onClose, onChanged }: { open: boolean; employee: ManagedEmployee; onClose: () => void; onChanged: () => void }) {
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

  if (!open) return null
  return <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"><button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/30" onClick={onClose} /><div role="alertdialog" aria-modal="true" className="relative w-full max-w-md rounded-lg border border-border bg-background p-6"><button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><X className="size-4" /></button><h3 className="text-lg font-semibold">{restoring ? "Restore employee?" : "Terminate employment?"}</h3><p className="mt-2 text-sm text-muted-foreground">{restoring ? `${employee.display_name} will return to the current directory with an Active status.` : `${employee.display_name} will move to Former employees and immediately lose employee self-service access. Their HR history will be retained.`}</p>{error && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}<div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant={restoring ? "default" : "destructive"} onClick={() => void changeStatus()} disabled={busy}>{busy ? "Updating…" : restoring ? "Restore employee" : "Terminate employee"}</Button></div></div></div>
}

function DeleteEmployeeDialog({ open, employee, onClose, onDeleted }: { open: boolean; employee: ManagedEmployee; onClose: () => void; onDeleted: () => void }) {
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function removeEmployee() {
    if (confirmation !== employee.employee_id) return
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/v1/hr/people/${encodeURIComponent(employee.employee_id)}`, { method: "DELETE" })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Unable to delete this employee record.")
      onDeleted()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete this employee record.") }
    finally { setBusy(false) }
  }

  if (!open) return null
  return <div className="fixed inset-0 z-[95] flex items-center justify-center p-4"><button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/35" onClick={onClose} /><div role="alertdialog" aria-modal="true" className="relative w-full max-w-md rounded-lg border border-destructive/30 bg-background p-6"><button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><X className="size-4" /></button><h3 className="text-lg font-semibold">Permanently delete employee?</h3><p className="mt-2 text-sm text-muted-foreground">This deletes {employee.display_name}&apos;s employee record and linked HR transactions. Their sign-in email can then start a new employee onboarding profile. This action cannot be undone.</p><label className="mt-5 block"><span className="text-xs font-semibold">Enter {employee.employee_id} to confirm</span><input autoFocus value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError("") }} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20" /></label>{error && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}<div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="destructive" onClick={() => void removeEmployee()} disabled={busy || confirmation !== employee.employee_id}>{busy ? "Deleting…" : "Delete employee record"}</Button></div></div></div>
}

function ProfileSkeleton() {
  return <div className="mx-auto w-full max-w-[1500px] space-y-5"><div className="h-8 w-24 animate-pulse rounded-lg bg-muted" /><div className="rounded-lg border border-border bg-card p-7"><div className="flex items-center gap-5"><div className="size-20 animate-pulse rounded-full bg-muted" /><div className="space-y-3"><div className="h-7 w-56 animate-pulse rounded bg-muted" /><div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" /></div></div><div className="mt-7 h-10 animate-pulse rounded bg-muted" /></div><div className="grid gap-5 md:grid-cols-2"><div className="h-64 animate-pulse rounded-lg bg-muted" /><div className="h-64 animate-pulse rounded-lg bg-muted" /></div></div>
}
