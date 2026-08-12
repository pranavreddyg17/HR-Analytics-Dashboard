"use client"

import { useEffect, useRef, useState } from "react"
import { signIn } from "next-auth/react"

import { Button } from "@/components/ui/button"

type CalendarPlan = {
  type: "calendar_invite"
  calendarProvider: "google" | "microsoft_teams"
  title: string
  start: string
  end: string
  timezone: "America/Los_Angeles" | "America/New_York" | "Europe/London" | "Asia/Kolkata" | "UTC"
  location: string
  agenda: string
  employeeIds: string[]
  employees: Array<{ employeeId: string; name: string; jobTitle: string; department: string; location: string; tenureYears: number }>
  evidence: string
  requiresConfirmation: boolean
}

type LearningPlan = {
  type: "learning_assignment"
  title: string
  courseId: string
  courseTitle: string
  skillName: string
  targetType: "department" | "job_title" | "job_level" | "manager_team" | "job_profile"
  targetValue: string
  targetLabel: string
  dueDate: string
  hours: number
  note: string
  recipientCount: number
  alreadyCompleted: number
  openRequisitions: number
  evidence: string
  recommendationId: string
  requiresConfirmation: boolean
}

type HiringPlan = {
  type: "hiring_requisition"
  title: string
  position: string
  department: string
  location: string
  employmentType: "Full-time" | "Part-time" | "Contract" | "Intern" | "Temporary"
  justification: string
  activeEmployees: number
  evidence: string
  requiresConfirmation: boolean
}

type RetentionPlan = {
  type: "retention_review"
  title: string
  department: string
  population: number
  recordedAttritionRate: number
  aboveThresholdShare: number
  leadingExitReason: string
  priority: "Priority" | "Watch" | "Stable"
  currentReviewStatus: "not_started" | "pending" | "in_progress" | "completed"
  evidence: string
  requiresConfirmation: boolean
}

type WorkflowPlan = CalendarPlan | LearningPlan | HiringPlan | RetentionPlan

const examples = [
  "Recommend and assign the highest-priority capability course.",
  "Upskill Research Analysts based on current capability gaps.",
  "Request a full-time Platform Engineer in Research & Development, Remote, because the reliability programme needs additional delivery capacity.",
  "Create a retention review for the highest-priority department.",
  "Schedule a Teams career progression review with Pranav G next Friday at 10am Pacific time.",
]

type ConnectionState = "loading" | "connected" | "disconnected" | "unavailable"

function dateTimeLabel(value: string): string {
  const parsed = new Date(`${value}:00`)
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(parsed) : value.replace("T", " ")
}

export function AgentWorkflows({ canPrepare, initialPrompt = "" }: { canPrepare: boolean; initialPrompt?: string }) {
  const [calendarConnections, setCalendarConnections] = useState<Record<CalendarPlan["calendarProvider"], ConnectionState>>({ google: "loading", microsoft_teams: "loading" })
  const [prompt, setPrompt] = useState("")
  const [plan, setPlan] = useState<WorkflowPlan | null>(null)
  const [draftId, setDraftId] = useState("")
  const [planning, setPlanning] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState("")
  const [errorCode, setErrorCode] = useState("")
  const [notice, setNotice] = useState("")
  const [eventUrl, setEventUrl] = useState("")
  const initialPromptHandled = useRef(false)

  useEffect(() => {
    let active = true
    Promise.all([
      fetch("/api/v1/ai/integrations/google-calendar").then(async (response) => ({ provider: "google" as const, response, body: await response.json() as { connected?: boolean; configured?: boolean } })),
      fetch("/api/v1/ai/integrations/microsoft-teams").then(async (response) => ({ provider: "microsoft_teams" as const, response, body: await response.json() as { connected?: boolean; configured?: boolean } })),
    ]).then((results) => {
      if (!active) return
      setCalendarConnections((current) => {
        const next = { ...current }
        for (const result of results) {
          next[result.provider] = !result.response.ok || result.body.configured === false ? "unavailable" : result.body.connected ? "connected" : "disconnected"
        }
        return next
      })
    }).catch(() => { if (active) setCalendarConnections({ google: "disconnected", microsoft_teams: "unavailable" }) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!initialPrompt || initialPromptHandled.current || !canPrepare) return
    initialPromptHandled.current = true
    void createPlan(initialPrompt)
    // The handoff prompt is immutable for this mounted workflow workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, canPrepare])

  function connectGoogleCalendar() {
    void signIn("google", { redirectTo: `${window.location.origin}/assistant` }, {
      scope: "openid email profile https://www.googleapis.com/auth/calendar.events.owned",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    })
  }

  function connectMicrosoftTeams() {
    void signIn("microsoft-entra-id", { redirectTo: `${window.location.origin}/assistant` }, {
      scope: "openid profile email offline_access User.Read Calendars.ReadWrite",
      prompt: "consent",
    })
  }

  function connectCalendar(provider: CalendarPlan["calendarProvider"]) {
    if (provider === "microsoft_teams") connectMicrosoftTeams()
    else connectGoogleCalendar()
  }

  async function createPlan(text = prompt) {
    const request = text.trim()
    if (!request || planning) return
    setPrompt(request); setPlanning(true); setPlan(null); setDraftId(""); setError(""); setErrorCode(""); setNotice(""); setEventUrl("")
    try {
      const response = await fetch("/api/v1/ai/workflows/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: request }) })
      const body = await response.json() as WorkflowPlan & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "The workflow plan could not be created.")
      setPlan(body)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The workflow plan could not be created.") }
    finally { setPlanning(false) }
  }

  async function executePlan() {
    if (!plan || executing) return
    setExecuting(true); setError(""); setErrorCode(""); setNotice("")
    try {
      let workflowId = draftId
      if (!workflowId) {
        const payload = plan.type === "calendar_invite"
          ? { type: plan.type, calendarProvider: plan.calendarProvider, employeeIds: plan.employeeIds, title: plan.title, start: plan.start, end: plan.end, timezone: plan.timezone, location: plan.location, agenda: plan.agenda }
          : plan.type === "learning_assignment"
            ? { type: plan.type, targetType: plan.targetType, targetValue: plan.targetValue, courseId: plan.courseId, dueDate: plan.dueDate, hours: plan.hours, note: plan.note, recommendationId: plan.recommendationId }
            : plan.type === "hiring_requisition"
              ? { type: plan.type, position: plan.position, department: plan.department, location: plan.location, employmentType: plan.employmentType, justification: plan.justification }
              : { type: plan.type, department: plan.department }
        const response = await fetch("/api/v1/ai/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
        const body = await response.json() as { draft?: { id?: string }; error?: string }
        if (!response.ok || !body.draft?.id) throw new Error(body.error ?? "The workflow could not be saved.")
        workflowId = body.draft.id
        setDraftId(workflowId)
      }
      const response = await fetch(`/api/v1/ai/workflows/${encodeURIComponent(workflowId)}/execute`, { method: "POST" })
      const body = await response.json() as { message?: string; eventUrl?: string | null; error?: string; code?: string }
      if (!response.ok) {
        setErrorCode(body.code ?? "")
        if (body.code === "GOOGLE_CALENDAR_CONNECT_REQUIRED") setCalendarConnections((current) => ({ ...current, google: "disconnected" }))
        if (body.code === "MICROSOFT_TEAMS_CONNECT_REQUIRED") setCalendarConnections((current) => ({ ...current, microsoft_teams: "disconnected" }))
        throw new Error(body.error ?? "The workflow could not be completed.")
      }
      setNotice(body.message ?? "Workflow completed.")
      setEventUrl(body.eventUrl ?? "")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The workflow could not be completed.") }
    finally { setExecuting(false) }
  }

  const selectedCalendarConnection = plan?.type === "calendar_invite" ? calendarConnections[plan.calendarProvider] : "connected"
  const calendarNeedsConnection = plan?.type === "calendar_invite" && selectedCalendarConnection !== "connected"

  return <section className="grid gap-0 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
    <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
      <h3 className="text-subsection font-semibold">Prepare an action</h3>
      <p className="mt-1 text-description text-muted-foreground">Describe the outcome. The assistant will resolve the affected records before asking for confirmation.</p>
      <form onSubmit={(event) => { event.preventDefault(); void createPlan() }} className="mt-5">
        <label className="text-label font-semibold" htmlFor="workflow-agent-request">Request</label>
        <textarea id="workflow-agent-request" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} placeholder="Assign the highest-priority capability course to the relevant role cohort." className="mt-1.5 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5 text-control outline-none focus:ring-2 focus:ring-ring/30" />
        <Button type="submit" className="mt-3" disabled={!canPrepare || prompt.trim().length < 10 || planning}>{planning ? "Building plan" : "Build plan"}</Button>
      </form>
      <div className="mt-5 border-t border-border pt-4"><p className="text-label font-semibold text-muted-foreground">Examples</p><div className="mt-2 space-y-1">{examples.map((example) => <button key={example} type="button" onClick={() => void createPlan(example)} className="block w-full rounded-md px-2 py-2 text-left text-body text-muted-foreground hover:bg-muted hover:text-foreground">{example}</button>)}</div></div>
      {!canPrepare && <p className="mt-4 rounded-md border border-border bg-muted/35 px-3 py-2 text-meta text-muted-foreground">Your role can analyze data but cannot execute employee workflows.</p>}
    </div>

    <div className="min-h-[430px] p-5">
      {!plan && !planning && <div className="flex min-h-[370px] flex-col items-center justify-center text-center"><h3 className="text-subsection font-semibold">No plan prepared</h3><p className="mt-1 max-w-sm text-description text-muted-foreground">A bounded plan with evidence, affected records, and confirmation controls will appear here.</p></div>}
      {planning && <div className="flex min-h-[370px] items-center justify-center text-body text-muted-foreground">Resolving workspace records and policy controls…</div>}
      {plan && <div>
        <div className="border-b border-border pb-4"><p className="text-label font-semibold text-muted-foreground">Review before execution</p><h3 className="mt-1 text-section font-semibold">{plan.title}</h3><p className="mt-1 text-description text-muted-foreground">{plan.type === "calendar_invite" ? `${dateTimeLabel(plan.start)} · ${plan.timezone}` : plan.type === "learning_assignment" ? `${plan.targetLabel} · due ${plan.dueDate}` : plan.type === "hiring_requisition" ? `${plan.department} · ${plan.location} · ${plan.employmentType}` : `${plan.department} · ${plan.priority}`}</p></div>
        {plan.type === "calendar_invite" ? <div className="grid gap-5 py-5 sm:grid-cols-2"><div><p className="text-label font-semibold">Participants</p><div className="mt-2 divide-y divide-border rounded-md border border-border">{plan.employees.map((employee) => <div key={employee.employeeId} className="px-3 py-2.5"><p className="font-semibold">{employee.name}</p><p className="text-meta text-muted-foreground">{employee.jobTitle} · {employee.department} · {employee.employeeId}</p></div>)}</div></div><div><p className="text-label font-semibold">Agenda</p><p className="mt-2 text-body text-muted-foreground">{plan.agenda}</p></div></div>
          : plan.type === "learning_assignment" ? <div className="grid gap-4 py-5 sm:grid-cols-2"><div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Capability and course</p><p className="mt-1 font-semibold">{plan.skillName}</p><p className="text-meta text-muted-foreground">{plan.courseTitle} · {plan.hours} hours</p></div><div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Cohort impact</p><p className="mt-1 font-semibold">{plan.recipientCount} employees need evidence</p><p className="text-meta text-muted-foreground">{plan.alreadyCompleted} completed · {plan.openRequisitions} matching open roles</p></div></div>
            : plan.type === "hiring_requisition" ? <div className="grid gap-4 py-5 sm:grid-cols-2"><div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Position</p><p className="mt-1 font-semibold">{plan.position}</p><p className="text-meta text-muted-foreground">{plan.department} · {plan.location}</p></div><div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Business justification</p><p className="mt-1 text-body text-muted-foreground">{plan.justification}</p></div></div>
              : <div className="grid gap-4 py-5 sm:grid-cols-3"><div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Population</p><p className="mt-1 font-semibold tabular-nums">{plan.population}</p></div><div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Recorded attrition</p><p className="mt-1 font-semibold tabular-nums">{plan.recordedAttritionRate}%</p></div><div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Leading exit reason</p><p className="mt-1 font-semibold">{plan.leadingExitReason}</p></div></div>}
        <div className="rounded-md bg-muted/45 p-3"><p className="text-label font-semibold">Evidence</p><p className="mt-1 text-meta text-muted-foreground">{plan.evidence}</p></div>
        {plan.type === "calendar_invite" && <div className="mt-4 rounded-md border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-label font-semibold">Meeting service</p><p className="text-meta text-muted-foreground">Choose where the confirmed invitation will be created.</p></div><div className="flex rounded-md border border-border p-0.5"><button type="button" onClick={() => { setPlan({ ...plan, calendarProvider: "microsoft_teams" }); setDraftId("") }} className={`rounded px-3 py-1.5 text-meta font-semibold ${plan.calendarProvider === "microsoft_teams" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Microsoft Teams</button><button type="button" onClick={() => { setPlan({ ...plan, calendarProvider: "google" }); setDraftId("") }} className={`rounded px-3 py-1.5 text-meta font-semibold ${plan.calendarProvider === "google" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Google Calendar</button></div></div><div className="mt-3 flex items-center justify-between border-t border-border pt-3"><div><p className="font-semibold">{plan.calendarProvider === "microsoft_teams" ? "Microsoft Teams" : "Google Calendar"}</p><p className="text-meta text-muted-foreground">{selectedCalendarConnection === "loading" ? "Checking connection" : selectedCalendarConnection === "connected" ? "Connected" : selectedCalendarConnection === "unavailable" ? "Not configured" : "Connection required"}</p></div>{selectedCalendarConnection === "disconnected" && <Button size="sm" variant="outline" onClick={() => connectCalendar(plan.calendarProvider)}>Connect</Button>}</div></div>}
        {error && <p role="alert" className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-meta text-destructive">{error}</p>}
        {errorCode === "GOOGLE_CALENDAR_API_DISABLED" && <a className="mt-2 inline-flex text-body font-semibold text-primary hover:underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Open Google Calendar API settings</a>}
        {notice && <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-meta text-emerald-900">{notice}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="max-w-md text-meta text-muted-foreground">Nothing is written until you confirm. Execution uses the same audited domain service as the workspace UI.</p><div className="flex gap-2">{eventUrl && <Button nativeButton={false} variant="outline" render={<a href={eventUrl} target="_blank" rel="noreferrer" />}>Open {plan.type === "calendar_invite" && plan.calendarProvider === "microsoft_teams" ? "meeting" : "event"}</Button>}{!notice && (calendarNeedsConnection ? <Button onClick={() => plan.type === "calendar_invite" && connectCalendar(plan.calendarProvider)} disabled={selectedCalendarConnection === "loading" || selectedCalendarConnection === "unavailable"}>{selectedCalendarConnection === "unavailable" ? "Service unavailable" : `Connect ${plan.type === "calendar_invite" && plan.calendarProvider === "microsoft_teams" ? "Teams" : "Calendar"}`}</Button> : <Button onClick={() => void executePlan()} disabled={executing}>{executing ? "Executing" : plan.type === "calendar_invite" ? plan.calendarProvider === "microsoft_teams" ? "Create Teams meeting" : "Create event and send" : plan.type === "learning_assignment" ? "Create assignments" : plan.type === "hiring_requisition" ? "Submit requisition" : "Create retention review"}</Button>)}</div></div>
      </div>}
    </div>
  </section>
}
