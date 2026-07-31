"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, Check, ExternalLink, LoaderCircle, Mail, Search, Users, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Employee = {
  employee_id: string
  display_name: string
  work_email: string | null
  department: string
  job_title: string
  data_source: string
  employment_status: string
}

type Draft = {
  id: string
  type: "calendar_invite" | "employee_email"
  title: string
  status: string
  recipientCount: number
  summary: string
  createdAt: string
}

type CreatedWorkflow = {
  draft: Draft
  launchUrl: string
  confirmation: string
}

function localInputValue(offsetHours: number): string {
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000)
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function EmployeePicker({
  employees,
  selected,
  onChange,
}: {
  employees: Employee[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const selectedEmployees = employees.filter((employee) => selected.includes(employee.employee_id))
  const matches = employees.filter((employee) => {
    const value = `${employee.display_name} ${employee.work_email} ${employee.department} ${employee.job_title}`.toLowerCase()
    return value.includes(query.trim().toLowerCase())
  }).slice(0, 10)

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id].slice(0, 20))
  }

  return (
    <div>
      <label className="text-xs font-medium text-foreground">Employees</label>
      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
          placeholder="Search operational employee records"
          className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none"
        />
        {open && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
            {matches.map((employee) => {
              const checked = selected.includes(employee.employee_id)
              return (
                <button
                  key={employee.employee_id}
                  type="button"
                  onClick={() => toggle(employee.employee_id)}
                  className="flex w-full items-center gap-3 rounded px-2.5 py-2 text-left hover:bg-muted"
                >
                  <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-sm border", checked ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                    {checked && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{employee.display_name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{employee.job_title} · {employee.department} · {employee.work_email}</span>
                  </span>
                </button>
              )
            })}
            {!matches.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">No contactable employees match this search.</p>}
            <div className="border-t border-border px-2 py-1.5 text-right">
              <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-primary">Done</button>
            </div>
          </div>
        )}
      </div>
      {selectedEmployees.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedEmployees.map((employee) => (
            <span key={employee.employee_id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
              {employee.display_name}
              <button type="button" onClick={() => toggle(employee.employee_id)} aria-label={`Remove ${employee.display_name}`} className="text-muted-foreground hover:text-foreground"><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-muted-foreground">Only active operational records with work email addresses are available. Maximum 20 recipients.</p>
    </div>
  )
}

export function AgentWorkflows({ canPrepare }: { canPrepare: boolean }) {
  const [kind, setKind] = useState<"calendar_invite" | "employee_email">("calendar_invite")
  const [employees, setEmployees] = useState<Employee[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [readyLink, setReadyLink] = useState("")
  const [meeting, setMeeting] = useState({
    title: "Employee review meeting",
    start: localInputValue(24),
    end: localInputValue(25),
    timezone: "America/Los_Angeles",
    location: "",
    agenda: "Review current priorities, support needed, and agreed follow-up actions.",
  })
  const [email, setEmail] = useState({
    subject: "People Operations update",
    message: "Hello,\n\nYou are invited to review the following People Operations update.\n\nPlease reply if you have any questions.\n\nThank you.",
  })

  useEffect(() => {
    let active = true
    Promise.all([
      fetch("/api/v1/hr/people?status=Active&limit=250").then((response) => response.ok ? response.json() : Promise.reject(new Error("Employee records are unavailable."))),
      fetch("/api/v1/ai/workflows").then((response) => response.ok ? response.json() : Promise.reject(new Error("Workflow history is unavailable."))),
    ]).then(([peopleBody, draftBody]: [{ items?: Employee[] }, { items?: Draft[] }]) => {
      if (!active) return
      setEmployees((peopleBody.items ?? []).filter((employee) => employee.data_source !== "demo" && Boolean(employee.work_email)))
      setDrafts(draftBody.items ?? [])
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Workflow data is unavailable.")
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  const selectedCount = employeeIds.length
  const formReady = useMemo(() => {
    if (!canPrepare || selectedCount < 1) return false
    if (kind === "calendar_invite") return Boolean(meeting.title.trim() && meeting.start && meeting.end && meeting.agenda.trim())
    return Boolean(email.subject.trim() && email.message.trim())
  }, [canPrepare, email, kind, meeting, selectedCount])

  async function prepare() {
    if (!formReady || saving) return
    setSaving(true)
    setError("")
    setNotice("")
    setReadyLink("")
    const previewWindow = window.open("about:blank", "_blank")
    try {
      const payload = kind === "calendar_invite"
        ? { type: kind, employeeIds, ...meeting }
        : { type: kind, employeeIds, ...email }
      const response = await fetch("/api/v1/ai/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await response.json() as CreatedWorkflow & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "The workflow could not be prepared.")
      setDrafts((current) => [body.draft, ...current].slice(0, 12))
      setNotice(body.confirmation)
      setReadyLink(body.launchUrl)
      await fetch(`/api/v1/ai/workflows/${encodeURIComponent(body.draft.id)}`, { method: "POST" })
      if (previewWindow) previewWindow.location.href = body.launchUrl
      else window.open(body.launchUrl, "_blank", "noopener,noreferrer")
    } catch (reason) {
      previewWindow?.close()
      setError(reason instanceof Error ? reason.message : "The workflow could not be prepared.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex min-h-48 items-center justify-center rounded-lg border border-border bg-card"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-border bg-card">
        <div className="flex border-b border-border p-1">
          <button type="button" onClick={() => { setKind("calendar_invite"); setError(""); setNotice(""); setReadyLink("") }} className={cn("flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium", kind === "calendar_invite" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><CalendarDays className="size-4" />Calendar meeting</button>
          <button type="button" onClick={() => { setKind("employee_email"); setError(""); setNotice(""); setReadyLink("") }} className={cn("flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium", kind === "employee_email" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Mail className="size-4" />Employee email</button>
        </div>

        <div className="space-y-4 p-5">
          <EmployeePicker employees={employees} selected={employeeIds} onChange={setEmployeeIds} />

          {kind === "calendar_invite" ? (
            <>
              <Field label="Meeting title"><input value={meeting.title} onChange={(event) => setMeeting({ ...meeting, title: event.target.value })} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start"><input type="datetime-local" value={meeting.start} onChange={(event) => setMeeting({ ...meeting, start: event.target.value })} /></Field>
                <Field label="End"><input type="datetime-local" value={meeting.end} onChange={(event) => setMeeting({ ...meeting, end: event.target.value })} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Time zone"><select value={meeting.timezone} onChange={(event) => setMeeting({ ...meeting, timezone: event.target.value })}><option value="America/Los_Angeles">Pacific Time</option><option value="America/New_York">Eastern Time</option><option value="Europe/London">London</option><option value="Asia/Kolkata">India Standard Time</option><option value="UTC">UTC</option></select></Field>
                <Field label="Location or meeting link"><input value={meeting.location} onChange={(event) => setMeeting({ ...meeting, location: event.target.value })} placeholder="Optional" /></Field>
              </div>
              <Field label="Agenda"><textarea value={meeting.agenda} onChange={(event) => setMeeting({ ...meeting, agenda: event.target.value })} rows={4} /></Field>
            </>
          ) : (
            <>
              <Field label="Subject"><input value={email.subject} onChange={(event) => setEmail({ ...email, subject: event.target.value })} /></Field>
              <Field label="Message"><textarea value={email.message} onChange={(event) => setEmail({ ...email, message: event.target.value })} rows={8} /></Field>
            </>
          )}

          {!canPrepare && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Your current role can analyze workforce data but cannot prepare employee communications.</p>}
          {!employees.length && <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Add operational employee records with work email addresses before preparing a communication.</p>}
          {error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
          {notice && <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{notice}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">{selectedCount} recipient{selectedCount === 1 ? "" : "s"} selected · You confirm the final action in Google.</p>
            <div className="flex gap-2">
              {readyLink && <Button nativeButton={false} variant="outline" render={<a href={readyLink} target="_blank" rel="noreferrer" />}><ExternalLink className="size-4" />Open again</Button>}
              <Button type="button" onClick={() => void prepare()} disabled={!formReady || saving}>
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : kind === "calendar_invite" ? <CalendarDays className="size-4" /> : <Mail className="size-4" />}
                {kind === "calendar_invite" ? "Prepare in Calendar" : "Prepare in Gmail"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <aside className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Recent preparations</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Drafts created by your account</p>
        </div>
        <div className="divide-y divide-border">
          {drafts.length ? drafts.map((draft) => (
            <div key={draft.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary">{draft.type === "calendar_invite" ? <CalendarDays className="size-4" /> : <Mail className="size-4" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{draft.title}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{draft.recipientCount} recipient{draft.recipientCount === 1 ? "" : "s"} · {draft.summary}</p>
                  <p className="mt-1 text-[10px] capitalize text-muted-foreground">{draft.status} · {new Date(draft.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )) : <div className="flex min-h-40 flex-col items-center justify-center px-5 text-center"><Users className="size-5 text-muted-foreground" /><p className="mt-2 text-sm font-medium">No prepared workflows</p><p className="mt-1 text-xs text-muted-foreground">Calendar and email drafts will appear here.</p></div>}
        </div>
      </aside>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-foreground">{label}<span className="mt-1.5 block [&_input]:h-10 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:text-sm [&_input]:outline-none [&_select]:h-10 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:text-sm [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-border [&_textarea]:bg-background [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:text-sm [&_textarea]:outline-none">{children}</span></label>
}
