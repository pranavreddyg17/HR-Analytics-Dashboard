"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { BrandLogo } from "@/components/brand-logo"
import { SignOutControl } from "@/components/sign-out-control"
import { SessionRevalidator } from "@/components/session-revalidator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type PortalData = {
  employee: {
    employee_id: string
    display_name: string
    department: string
    job_title: string
    location: string
    manager_name: string | null
    hire_date: string
    employment_status: string
  }
  projects: Array<Record<string, unknown>>
  compensation: Record<string, unknown> | null
  leave: Array<Record<string, unknown>>
  claims: Array<Record<string, unknown>>
  cases: Array<Record<string, unknown>>
  reviews: Array<Record<string, unknown>>
  meetings: Array<Record<string, unknown>>
  documents: Array<Record<string, unknown>>
  learning: Array<Record<string, unknown>>
}

type PortalView = "overview" | "requests" | "learning" | "reviews"
const portalViews: Array<{ value: PortalView; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "requests", label: "Requests" },
  { value: "learning", label: "Learning" },
  { value: "reviews", label: "Reviews" },
]

const fieldClass = "mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-body outline-none focus:ring-2 focus:ring-primary/20"
const textAreaClass = "mt-1 min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-body outline-none focus:ring-2 focus:ring-primary/20"

function date(value: unknown): string {
  if (!value) return "—"
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(parsed)
}

function money(value: unknown, currency: unknown): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return "—"
  return new Intl.NumberFormat("en", { style: "currency", currency: String(currency || "USD"), maximumFractionDigits: 2 }).format(amount)
}

function Status({ value }: { value: unknown }) {
  return <span className="rounded border border-border bg-muted/40 px-2 py-0.5 text-status font-semibold capitalize">{String(value || "unknown").replaceAll("_", " ")}</span>
}

export function EmployeePortal({ initialData, user }: { initialData: PortalData; user: { name: string; email: string; authenticated: boolean; workspaceAccess: boolean } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState(initialData)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const requestedView = searchParams.get("view")
  const active: PortalView = portalViews.some((item) => item.value === requestedView) ? requestedView as PortalView : "overview"

  function selectView(view: PortalView) {
    const next = new URLSearchParams(searchParams.toString())
    if (view === "overview") next.delete("view")
    else next.set("view", view)
    const query = next.toString()
    router.push(query ? `/employee?${query}` : "/employee", { scroll: false })
  }

  async function refresh() {
    const response = await fetch("/api/v1/employee", { cache: "no-store" })
    const body = await response.json() as PortalData & { error?: string }
    if (!response.ok) throw new Error(body.error || "Unable to refresh employee services.")
    setData(body)
  }

  async function submit(action: string, payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/v1/employee", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, payload }),
      })
      const body = await response.json() as { message?: string; error?: string }
      if (!response.ok) throw new Error(body.error || "Request could not be submitted.")
      setMessage(body.message || "Request submitted.")
      await refresh()
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request could not be submitted.")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function uploadDocument(file: File, documentType: "resume" | "receipt" | "profile_photo" | "supporting_document") {
    const form = new FormData()
    form.set("file", file)
    form.set("documentType", documentType)
    form.set("visibility", "employee")
    const response = await fetch("/api/v1/employee/documents", { method: "POST", body: form })
    const body = await response.json() as { id?: string; error?: string }
    if (!response.ok || !body.id) throw new Error(body.error || "Document could not be uploaded.")
    return body.id
  }

  async function submitDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const file = form.get("file")
    const documentType = String(form.get("documentType")) as "resume" | "profile_photo" | "supporting_document"
    if (!(file instanceof File) || !file.size) return
    setBusy(true); setMessage("")
    try {
      await uploadDocument(file, documentType)
      setMessage("Document uploaded.")
      formElement.reset()
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Document could not be uploaded.")
    } finally {
      setBusy(false)
    }
  }

  async function submitLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/v1/hr/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "leave",
          leaveType: form.get("leaveType"),
          startDate: form.get("startDate"),
          endDate: form.get("endDate"),
          note: form.get("note"),
        }),
      })
      const body = await response.json() as { message?: string; error?: string }
      if (!response.ok) throw new Error(body.error || "Leave request could not be submitted.")
      setMessage(body.message || "Leave request submitted.")
      formElement.reset()
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Leave request could not be submitted.")
    } finally {
      setBusy(false)
    }
  }

  async function submitExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setBusy(true); setMessage("")
    let receiptDocumentId: string | null = null
    try {
      const receipt = form.get("receipt")
      receiptDocumentId = receipt instanceof File && receipt.size ? await uploadDocument(receipt, "receipt") : null
      const saved = await submit("submit_expense", {
      category: form.get("category"),
      expenseDate: form.get("expenseDate"),
      amount: Number(form.get("amount")),
      currency: form.get("currency"),
      description: form.get("description"),
        receiptDocumentId,
      })
      if (saved) formElement.reset()
      else if (receiptDocumentId) {
        await fetch(`/api/v1/employee/documents?id=${encodeURIComponent(receiptDocumentId)}`, { method: "DELETE" }).catch(() => undefined)
        receiptDocumentId = null
      }
    } catch (error) {
      if (receiptDocumentId) await fetch(`/api/v1/employee/documents?id=${encodeURIComponent(receiptDocumentId)}`, { method: "DELETE" }).catch(() => undefined)
      setMessage(error instanceof Error ? error.message : "Reimbursement could not be submitted.")
    } finally {
      setBusy(false)
    }
  }

  async function submitCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const saved = await submit("open_case", {
      category: form.get("category"),
      subject: form.get("subject"),
      description: form.get("description"),
      confidentiality: form.get("confidentiality"),
    })
    if (saved) formElement.reset()
  }

  async function completeCourse(assignmentId: string) {
    setBusy(true); setMessage("")
    try {
      const response = await fetch(`/api/v1/hr/learning/assignments/${encodeURIComponent(assignmentId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Completion recorded through employee self-service." }),
      })
      const body = await response.json() as { message?: string; error?: string }
      if (!response.ok) throw new Error(body.error || "Course completion could not be recorded.")
      setMessage(body.message || "Course completed.")
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Course completion could not be recorded.") }
    finally { setBusy(false) }
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>, reviewId: string) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await submit("submit_self_review", {
      reviewId,
      selfReview: form.get("selfReview"),
      employeeRating: Number(form.get("employeeRating")),
    })
  }

  const primaryProject = data.projects.find((row) => Boolean(row.is_primary)) ?? data.projects[0]
  const openRequestCount = data.leave.filter((row) => String(row.approval_status).toLowerCase() === "pending").length
    + data.claims.filter((row) => ["submitted", "under_review"].includes(String(row.status).toLowerCase())).length
    + data.cases.filter((row) => !["resolved", "closed"].includes(String(row.status).toLowerCase())).length
  const requestHistory: Array<{ id: string; kind: string; title: string; status: unknown; submitted: unknown; outcome: unknown }> = [
    ...data.claims.map((row) => ({ id: String(row.id), kind: "Reimbursement", title: `${String(row.category)} · ${money(row.amount, row.currency)}`, status: row.status, submitted: row.submitted_at, outcome: row.decision_note })),
    ...data.cases.map((row) => ({ id: String(row.id), kind: "HR request", title: String(row.subject), status: row.status, submitted: row.submitted_at, outcome: row.resolution_note })),
    ...data.leave.map((row) => ({ id: String(row.id), kind: "Leave", title: `${String(row.leave_type)} · ${String(row.leave_days)} days`, status: row.approval_status, submitted: row.start_date, outcome: row.decision_note })),
  ].sort((a, b) => String(b.submitted || "").localeCompare(String(a.submitted || "")))
  return <div className="employee-shell min-h-screen text-foreground">
    <SessionRevalidator enabled={user.authenticated} />
    <header className="employee-shell__header">
      <div className="employee-shell__header-inner mx-auto flex min-h-14 max-w-[1280px] items-center gap-4 px-4 sm:px-6">
        <BrandLogo />
        <nav className="employee-shell__navigation" aria-label="Employee navigation">
          {portalViews.map((item) => <button key={item.value} type="button" aria-current={active === item.value ? "page" : undefined} onClick={() => selectView(item.value)} className={active === item.value ? "employee-shell__navigation-link employee-shell__navigation-link--active" : "employee-shell__navigation-link"}>{item.label}</button>)}
        </nav>
        <div className="employee-shell__account hidden text-right sm:block"><p className="text-card-title">{user.name}</p><p className="text-meta">{user.email}</p></div>
        <div className="ml-auto flex items-center gap-3">
          {user.workspaceAccess && <Link href="/" className="employee-shell__sign-out">HR workspace</Link>}
          <SignOutControl className="employee-shell__sign-out" />
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-[1280px] space-y-4 px-4 py-5 sm:px-6">
      <div><h1 className="text-page-title">Employee services</h1><p className="text-page-description text-muted-foreground">Profile, requests, learning, and reviews.</p></div>
      {message && <div className="rounded-md border border-border bg-background px-4 py-3 text-body" role="status">{message}</div>}

      {active === "overview" && <>
        <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="surface-card p-5">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-section-title">{data.employee.display_name}</h2><p className="mt-1 text-body text-muted-foreground">{data.employee.job_title} · {data.employee.department}</p></div><Status value={data.employee.employment_status} /></div>
            <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <div><dt className="text-label text-muted-foreground">Manager</dt><dd className="mt-1 text-body">{data.employee.manager_name || "Not assigned"}</dd></div>
              <div><dt className="text-label text-muted-foreground">Location</dt><dd className="mt-1 text-body">{data.employee.location}</dd></div>
              <div><dt className="text-label text-muted-foreground">Start date</dt><dd className="mt-1 text-body">{date(data.employee.hire_date)}</dd></div>
              <div><dt className="text-label text-muted-foreground">Employee ID</dt><dd className="mt-1 text-body">{data.employee.employee_id}</dd></div>
            </dl>
          </div>
          <div className="surface-card p-5"><h2 className="text-section-title">Current assignment</h2>{primaryProject ? <dl className="mt-4 space-y-3"><div><dt className="text-label text-muted-foreground">Project</dt><dd className="text-body">{String(primaryProject.name)}</dd></div><div><dt className="text-label text-muted-foreground">Role</dt><dd className="text-body">{String(primaryProject.role_title)}</dd></div><div><dt className="text-label text-muted-foreground">Allocation</dt><dd className="text-body">{String(primaryProject.allocation_percent)}%</dd></div>{Boolean(primaryProject.client_name) && <div><dt className="text-label text-muted-foreground">Client</dt><dd className="text-body">{String(primaryProject.client_name)}</dd></div>}</dl> : <p className="mt-3 text-body text-muted-foreground">No active project assignment.</p>}</div>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          <div className="surface-card p-5"><p className="text-kpi-label text-muted-foreground">Current compensation</p><p className="mt-1 text-kpi-value">{data.compensation ? money(data.compensation.annual_salary, data.compensation.currency) : "Not recorded"}</p>{data.compensation && <p className="text-meta text-muted-foreground">{String(data.compensation.pay_frequency)} · effective {date(data.compensation.effective_from)}</p>}</div>
          <div className="surface-card p-5"><p className="text-kpi-label text-muted-foreground">Open requests</p><p className="mt-1 text-kpi-value">{openRequestCount}</p><button type="button" onClick={() => selectView("requests")} className="mt-2 text-button">View requests</button></div>
          <div className="surface-card p-5"><p className="text-kpi-label text-muted-foreground">Learning assigned</p><p className="mt-1 text-kpi-value">{data.learning.filter((row) => String(row.status).toLowerCase() !== "completed").length}</p><p className="text-meta text-muted-foreground">Incomplete courses</p></div>
        </section>
        <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <form onSubmit={submitDocument} className="surface-card p-5">
            <h2 className="text-section-title">Documents</h2>
            <div className="mt-4 space-y-3">
              <label className="block text-label">Document type<select name="documentType" className={fieldClass} defaultValue="resume"><option value="resume">Resume</option><option value="profile_photo">Profile photo</option><option value="supporting_document">Supporting document</option></select></label>
              <label className="block text-label">File<Input required name="file" type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" className={fieldClass} /></label>
              <p className="text-meta text-muted-foreground">PDF, DOCX, JPEG, or PNG. Maximum 10 MB.</p>
              <Button type="submit" disabled={busy}>Upload document</Button>
            </div>
          </form>
          <div className="surface-card overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-section-title">Your files</h2></div><div className="divide-y divide-border">{data.documents.length ? data.documents.map((document) => <div key={String(document.id)} className="grid gap-1 px-5 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="text-card-title">{String(document.file_name)}</p><p className="text-meta capitalize text-muted-foreground">{String(document.document_type).replaceAll("_", " ")} · {Math.max(1, Math.round(Number(document.size_bytes) / 1024))} KB</p></div><span className="text-meta text-muted-foreground">{date(document.created_at)}</span><a className="text-button" href={`/api/v1/employee/documents?id=${encodeURIComponent(String(document.id))}`}>Download</a></div>) : <p className="px-5 py-8 text-center text-body text-muted-foreground">No documents uploaded.</p>}</div></div>
        </section>
      </>}

      {active === "requests" && <div className="grid gap-4 xl:grid-cols-3">
        <form onSubmit={submitLeave} className="surface-card p-5"><h2 className="text-section-title">Request leave</h2><div className="mt-4 space-y-3"><label className="block text-label">Leave type<select name="leaveType" className={fieldClass} defaultValue="Annual"><option>Annual</option><option>Sick</option><option>Parental</option><option>Personal</option><option>Caregiver</option><option>Unpaid</option></select></label><label className="block text-label">Start date<Input required name="startDate" type="date" className={fieldClass} /></label><label className="block text-label">End date<Input required name="endDate" type="date" className={fieldClass} /></label><label className="block text-label">Note<textarea name="note" className={textAreaClass} maxLength={600} /></label><Button type="submit" disabled={busy} className="w-full">Submit leave request</Button></div></form>
        <form onSubmit={submitExpense} className="surface-card p-5"><h2 className="text-section-title">Submit reimbursement</h2><div className="mt-4 space-y-3"><label className="block text-label">Category<select name="category" className={fieldClass} defaultValue="travel"><option value="travel">Travel</option><option value="meals">Meals</option><option value="office">Office</option><option value="training">Training</option><option value="wellness">Wellness</option><option value="other">Other</option></select></label><label className="block text-label">Expense date<Input required name="expenseDate" type="date" className={fieldClass} /></label><div className="grid grid-cols-[1fr_90px] gap-2"><label className="block text-label">Amount<Input required name="amount" type="number" min="0.01" step="0.01" className={fieldClass} /></label><label className="block text-label">Currency<Input required name="currency" defaultValue="USD" maxLength={3} className={fieldClass} /></label></div><label className="block text-label">Description<textarea required name="description" className={textAreaClass} minLength={5} maxLength={1000} /></label><label className="block text-label">Receipt<Input name="receipt" type="file" accept=".pdf,.jpg,.jpeg,.png" className={fieldClass} /></label><Button type="submit" disabled={busy} className="w-full">Submit reimbursement</Button></div></form>
        <form onSubmit={submitCase} className="surface-card p-5"><h2 className="text-section-title">Ask HR for help</h2><div className="mt-4 space-y-3"><label className="block text-label">Category<select name="category" className={fieldClass} defaultValue="payroll"><option value="payroll">Payroll</option><option value="benefits">Benefits</option><option value="workplace">Workplace</option><option value="equipment">Equipment</option><option value="access">Access</option><option value="policy">Policy</option><option value="other">Other</option></select></label><label className="block text-label">Subject<Input required name="subject" minLength={4} maxLength={160} className={fieldClass} /></label><label className="block text-label">Details<textarea required name="description" className={textAreaClass} minLength={10} maxLength={4000} /></label><label className="block text-label">Visible to<select name="confidentiality" className={fieldClass} defaultValue="hr"><option value="hr">HR</option><option value="manager">Manager and HR</option><option value="restricted">Restricted HR</option></select></label><Button type="submit" disabled={busy} className="w-full">Submit request</Button></div></form>
        <section className="surface-card overflow-hidden xl:col-span-3"><div className="border-b border-border px-5 py-4"><h2 className="text-section-title">Request history</h2></div><div className="divide-y divide-border">{requestHistory.map((row) => <div key={`${row.kind}-${row.id}`} className="grid gap-2 px-5 py-3 sm:grid-cols-[120px_minmax(0,1fr)_auto_auto] sm:items-start"><span className="text-meta text-muted-foreground">{row.kind}</span><div><p className="text-body font-semibold capitalize">{row.title}</p>{Boolean(row.outcome) && <p className="mt-1 text-meta text-muted-foreground">Response: {String(row.outcome)}</p>}</div><Status value={row.status} /><span className="text-meta text-muted-foreground">{date(row.submitted)}</span></div>)}</div></section>
      </div>}

      {active === "learning" && <section className="surface-card overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h2 className="text-section-title">Assigned learning</h2><p className="text-page-description text-muted-foreground">Courses assigned by HR or your manager.</p></div>
        <div className="divide-y divide-border">{data.learning.length ? data.learning.map((assignment) => {
          const completed = String(assignment.status).toLowerCase() === "completed"
          return <div key={String(assignment.id)} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="text-card-title">{String(assignment.title)}</p><p className="text-meta text-muted-foreground">{completed ? `Completed ${date(assignment.completed_at)}` : `Due ${date(assignment.due_date)}`}</p></div><Status value={assignment.status}/>{!completed ? <Button size="sm" disabled={busy} onClick={() => void completeCourse(String(assignment.id))}>Mark complete</Button> : <span className="text-meta text-muted-foreground">Recorded</span>}</div>
        }) : <p className="px-5 py-10 text-center text-body text-muted-foreground">No learning assignments.</p>}</div>
      </section>}

      {active === "reviews" && <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface-card overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-section-title">Performance reviews</h2></div><div className="divide-y divide-border">{data.reviews.length ? data.reviews.map((review) => <div key={String(review.id)} className="px-5 py-4"><div className="flex items-center justify-between gap-3"><p className="text-card-title">{String(review.cycle_name)}</p><Status value={review.status} /></div><p className="mt-1 text-meta text-muted-foreground">{date(review.starts_on)} – {date(review.ends_on)}</p>{Boolean(review.manager_review) && <p className="mt-3 text-body">{String(review.manager_review)}</p>}{["not_started", "self_review"].includes(String(review.status)) && <form className="mt-4 space-y-3 border-t border-border pt-4" onSubmit={(event) => void submitReview(event, String(review.id))}><label className="block text-label">Self-review<textarea required name="selfReview" minLength={50} maxLength={10000} className={textAreaClass} placeholder="Summarize outcomes, challenges, development, and support needed." /></label><label className="block text-label">Self-rating<select required name="employeeRating" className={fieldClass} defaultValue=""><option value="" disabled>Select rating</option><option value="1">1 – Below expectations</option><option value="2">2 – Developing</option><option value="3">3 – Meets expectations</option><option value="4">4 – Exceeds expectations</option><option value="5">5 – Exceptional</option></select></label><Button type="submit" disabled={busy}>Submit self-review</Button></form>}</div>) : <p className="px-5 py-8 text-center text-body text-muted-foreground">No review cycles assigned.</p>}</div></section>
        <section className="surface-card overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-section-title">One-on-ones</h2></div><div className="divide-y divide-border">{data.meetings.length ? data.meetings.map((meeting) => <div key={String(meeting.id)} className="px-5 py-4"><div className="flex items-center justify-between gap-3"><p className="text-card-title">{date(meeting.scheduled_at)}</p><Status value={meeting.status} /></div>{Boolean(meeting.ai_summary) && Boolean(meeting.summary_approved_at) && <p className="mt-3 text-body">{String(meeting.ai_summary)}</p>}</div>) : <p className="px-5 py-8 text-center text-body text-muted-foreground">No one-on-ones recorded.</p>}</div></section>
      </div>}
    </main>
  </div>
}
