"use client"

import { useEffect, useState } from "react"
import { CalendarDays, Check, ExternalLink, LoaderCircle, UserRound } from "lucide-react"
import { signIn } from "next-auth/react"

import { Button } from "@/components/ui/button"

type CalendarPlan = {
  title: string
  start: string
  end: string
  timezone: "America/Los_Angeles" | "America/New_York" | "Europe/London" | "Asia/Kolkata" | "UTC"
  location: string
  agenda: string
  employeeIds: string[]
  employees: Array<{
    employeeId: string
    name: string
    jobTitle: string
    department: string
    location: string
    tenureYears: number
  }>
  evidence: string
  sourceMode: string
  requiresConfirmation: boolean
}

const examples = [
  "Create a 45 minute employee review with Pranav G next Friday at 2pm.",
  "Invite Pranav G to a team review on 2026-08-07 at 11am.",
  "Schedule a career progression review with Pranav G tomorrow at 10am for 30 minutes Pacific time.",
]

function dateTimeLabel(value: string): string {
  const [dateValue, timeValue] = value.split("T")
  const [year, month, day] = dateValue.split("-").map(Number)
  const [hours, minutes] = timeValue.split(":").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (![year, month, day, hours, minutes].every(Number.isFinite)) return value.replace("T", " ")
  const dateLabel = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date)
  const timeLabel = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, 0, 1, hours, minutes)))
  return `${dateLabel}, ${timeLabel}`
}

export function AgentWorkflows({ canPrepare }: { canPrepare: boolean }) {
  const [calendarConnection, setCalendarConnection] = useState<"loading" | "connected" | "disconnected">("loading")
  const [prompt, setPrompt] = useState("")
  const [plan, setPlan] = useState<CalendarPlan | null>(null)
  const [draftId, setDraftId] = useState("")
  const [planning, setPlanning] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [errorCode, setErrorCode] = useState("")
  const [notice, setNotice] = useState("")
  const [eventUrl, setEventUrl] = useState("")

  useEffect(() => {
    let active = true
    fetch("/api/v1/ai/integrations/google-calendar")
      .then(async (response) => {
        const body = await response.json() as { connected?: boolean }
        if (!response.ok) throw new Error("Connection status unavailable")
        if (active) setCalendarConnection(body.connected ? "connected" : "disconnected")
      })
      .catch(() => { if (active) setCalendarConnection("disconnected") })
    return () => { active = false }
  }, [])

  function connectGoogleCalendar() {
    void signIn("google", { callbackUrl: "/ai-agents" }, {
      scope: "openid email profile https://www.googleapis.com/auth/calendar.events.owned",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    })
  }

  async function createPlan(text = prompt) {
    const request = text.trim()
    if (!request || planning) return
    setPrompt(request)
    setPlanning(true)
    setPlan(null)
    setDraftId("")
    setError("")
    setErrorCode("")
    setNotice("")
    setEventUrl("")
    try {
      const response = await fetch("/api/v1/ai/workflows/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: request }),
      })
      const body = await response.json() as CalendarPlan & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "The scheduling plan could not be created.")
      setPlan(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The scheduling plan could not be created.")
    } finally {
      setPlanning(false)
    }
  }

  async function createEvent() {
    if (!plan || sending) return
    setSending(true)
    setError("")
    setErrorCode("")
    setNotice("")
    try {
      let workflowId = draftId
      if (!workflowId) {
        const draftResponse = await fetch("/api/v1/ai/workflows", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "calendar_invite",
            employeeIds: plan.employeeIds,
            title: plan.title,
            start: plan.start,
            end: plan.end,
            timezone: plan.timezone,
            location: plan.location,
            agenda: plan.agenda,
          }),
        })
        const draftBody = await draftResponse.json() as { draft?: { id?: string }; error?: string }
        if (!draftResponse.ok || !draftBody.draft?.id) throw new Error(draftBody.error ?? "The calendar workflow could not be saved.")
        workflowId = draftBody.draft.id
        setDraftId(workflowId)
      }

      const response = await fetch(`/api/v1/ai/workflows/${encodeURIComponent(workflowId)}/execute`, { method: "POST" })
      const body = await response.json() as { message?: string; eventUrl?: string | null; error?: string; code?: string }
      if (!response.ok) {
        setErrorCode(body.code ?? "")
        if (body.code === "GOOGLE_CALENDAR_CONNECT_REQUIRED") setCalendarConnection("disconnected")
        throw new Error(body.error ?? "Google Calendar could not create the event.")
      }
      setNotice(body.message ?? "Calendar event created and invitations sent.")
      setEventUrl(body.eventUrl ?? "")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Google Calendar could not create the event.")
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Scheduling agent</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Describe the participants and timing. The agent resolves employees from operational records and prepares a review before any invitation is sent.</p>

          <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-background px-3 py-2.5">
            <div>
              <p className="text-xs font-medium">Google Calendar</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {calendarConnection === "loading" ? "Checking connection" : calendarConnection === "connected" ? "Connected for event creation" : "Not connected"}
              </p>
            </div>
            {calendarConnection === "disconnected" && canPrepare && <Button type="button" size="sm" variant="outline" onClick={connectGoogleCalendar}>Connect</Button>}
          </div>

          <form onSubmit={(event) => { event.preventDefault(); void createPlan() }} className="mt-5">
            <label className="text-xs font-medium text-foreground" htmlFor="calendar-agent-request">Request</label>
            <textarea
              id="calendar-agent-request"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              placeholder="Schedule a career progression review with Pranav G next Friday at 10am for 30 minutes."
              className="mt-1.5 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/30"
            />
            <Button type="submit" className="mt-3" disabled={!canPrepare || prompt.trim().length < 10 || planning}>
              {planning ? <LoaderCircle className="size-4 animate-spin" /> : <CalendarDays className="size-4" />}
              Build meeting plan
            </Button>
          </form>

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Examples</p>
            <div className="mt-2 space-y-1">
              {examples.map((example) => (
                <button key={example} type="button" onClick={() => void createPlan(example)} className="block w-full rounded-md px-2 py-2 text-left text-xs leading-5 text-muted-foreground hover:bg-muted hover:text-foreground">
                  {example}
                </button>
              ))}
            </div>
          </div>
          {!canPrepare && <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Your current role can analyze data but cannot create employee calendar events.</p>}
        </div>

        <div className="min-h-[420px] p-5">
          {!plan && !planning && (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <CalendarDays className="size-7 text-muted-foreground" />
              <h3 className="mt-3 text-sm font-semibold">No meeting plan yet</h3>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">The agent will show matched employees, source evidence, timing, and agenda here for confirmation.</p>
            </div>
          )}
          {planning && <div className="flex min-h-[360px] items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Reviewing employee and promotion records</div>}
          {plan && (
            <div>
              <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Review before sending</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight">{plan.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{dateTimeLabel(plan.start)}–{dateTimeLabel(plan.end).split(", ").at(-1)} · {plan.timezone}</p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">{plan.employees.length} attendee{plan.employees.length === 1 ? "" : "s"}</span>
              </div>

              <div className="grid gap-5 py-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold">Participants</p>
                  <div className="mt-2 divide-y divide-border rounded-md border border-border">
                    {plan.employees.map((employee) => (
                      <div key={employee.employeeId} className="flex gap-3 px-3 py-2.5">
                        <UserRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{employee.name}</p>
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{employee.jobTitle} · {employee.department} · {employee.employeeId}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold">Agenda</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{plan.agenda}</p>
                  <div className="mt-4 rounded-md bg-muted/45 p-3">
                    <p className="text-[10px] font-medium text-foreground">Evidence used</p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{plan.evidence}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Source: {plan.sourceMode}</p>
                  </div>
                </div>
              </div>

              {error && <div role="alert" className="mb-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</div>}
              {errorCode === "GOOGLE_CALENDAR_API_DISABLED" && (
                <a className="mb-3 inline-flex text-xs font-medium text-primary hover:underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Open Google Calendar API settings</a>
              )}
              {notice && <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"><Check className="size-4" />{notice}</div>}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="max-w-md text-[10px] leading-4 text-muted-foreground">Creating the event sends Google Calendar invitations to the listed employees. Confirm the participants and agenda first.</p>
                <div className="flex gap-2">
                  {eventUrl && <Button nativeButton={false} variant="outline" render={<a href={eventUrl} target="_blank" rel="noreferrer" />}><ExternalLink className="size-4" />Open event</Button>}
                  {!notice && calendarConnection === "connected" && <Button type="button" onClick={() => void createEvent()} disabled={sending}>{sending ? <LoaderCircle className="size-4 animate-spin" /> : <CalendarDays className="size-4" />}Create event and send invites</Button>}
                  {!notice && calendarConnection === "disconnected" && <Button type="button" onClick={connectGoogleCalendar}>Connect Google Calendar</Button>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
