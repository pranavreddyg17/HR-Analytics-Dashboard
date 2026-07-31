import { z } from "zod"

import { ensureHrDatabase, type Database } from "@/lib/server/hr-database"
import { createGoogleCalendarEvent } from "@/lib/server/google-calendar"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

const employeeIds = z.array(z.string().trim().min(1).max(60)).min(1).max(20)
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
const calendarAgentPrompt = z.object({ prompt: z.string().trim().min(10).max(1200) })

const draftSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("calendar_invite"),
    employeeIds,
    title: z.string().trim().min(3).max(160),
    start: localDateTime,
    end: localDateTime,
    timezone: z.enum(["America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Kolkata", "UTC"]),
    location: z.string().trim().max(200).optional().default(""),
    agenda: z.string().trim().min(3).max(2000),
  }),
  z.object({
    type: z.literal("employee_email"),
    employeeIds,
    subject: z.string().trim().min(3).max(160),
    message: z.string().trim().min(10).max(5000),
  }),
])

type ContactEmployee = {
  employee_id: string
  display_name: string
  work_email: string
  manager_id: string | null
  department: string
  job_title: string
  location: string
  tenure_years: number
  data_source: string
}

type DraftRow = {
  id: string
  type: "calendar_invite" | "employee_email"
  title: string
  status: string
  employee_ids_json: string
  details_json: string
  created_by_email: string
  opened_at: string | null
  created_at: string
}

async function database(): Promise<Database> {
  const db = await ensureHrDatabase()
  if (!db) throw new PeopleError("Workflow storage is unavailable.", 503)
  return db
}

async function availableEmployees(db: Database, actor: RequestActor): Promise<ContactEmployee[]> {
  const rows = await db.prepare(`
    SELECT
      employee_id,
      TRIM(COALESCE(NULLIF(preferred_name, ''), first_name) || ' ' || last_name) AS display_name,
      work_email,
      manager_id,
      department,
      job_title,
      location,
      tenure_years,
      data_source
    FROM employees
    WHERE archived_at IS NULL
      AND LOWER(employment_status) <> 'terminated'
      AND LOWER(data_source) <> 'demo'
      AND COALESCE(work_email, '') <> ''
  `).all<ContactEmployee>()

  let available = rows.results ?? []
  if (actor.role === "manager") {
    const manager = await db.prepare("SELECT employee_id FROM employees WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL")
      .bind(actor.email)
      .first<{ employee_id: string }>()
    if (!manager) throw new PeopleError("Your account is not linked to an employee record.", 409)
    available = available.filter((employee) => employee.manager_id === manager.employee_id)
  }
  return available
}

async function eligibleEmployees(db: Database, actor: RequestActor, requestedIds: string[]): Promise<ContactEmployee[]> {
  const available = await availableEmployees(db, actor)
  const byId = new Map(available.map((employee) => [employee.employee_id, employee]))
  const selected = [...new Set(requestedIds)].map((id) => byId.get(id)).filter((employee): employee is ContactEmployee => Boolean(employee))
  if (selected.length !== new Set(requestedIds).size) {
    throw new PeopleError("Choose active operational employee records with work email addresses. Managers can only select direct reports.", 422)
  }
  return selected
}

const timeZones = {
  pacific: "America/Los_Angeles",
  pt: "America/Los_Angeles",
  eastern: "America/New_York",
  et: "America/New_York",
  london: "Europe/London",
  uk: "Europe/London",
  india: "Asia/Kolkata",
  ist: "Asia/Kolkata",
  utc: "UTC",
} as const

function dateInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function parseTimeZone(prompt: string): (typeof timeZones)[keyof typeof timeZones] {
  const lower = prompt.toLowerCase()
  const match = Object.entries(timeZones).find(([label]) => new RegExp(`\\b${label}\\b`, "i").test(lower))
  return match?.[1] ?? "America/Los_Angeles"
}

function parseMeetingDate(prompt: string, timeZone: string): string {
  const iso = prompt.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
  if (iso) return iso
  const slash = prompt.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/)
  if (slash) {
    const [, first, second, year] = slash
    const dayFirst = Number(first) > 12
    const month = dayFirst ? second : first
    const day = dayFirst ? first : second
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
  }

  const today = dateInTimeZone(timeZone)
  if (/\btomorrow\b/i.test(prompt)) return shiftDate(today, 1)
  const weekday = prompt.match(/\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1]
  if (weekday) {
    const target = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weekday.toLowerCase())
    const current = new Date(`${today}T12:00:00Z`).getUTCDay()
    return shiftDate(today, (target - current + 7) % 7 || 7)
  }
  return shiftDate(today, 1)
}

function parseMeetingTime(prompt: string): { hours: number; minutes: number } {
  const twelveHour = prompt.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (twelveHour) {
    let hours = Number(twelveHour[1]) % 12
    if (twelveHour[3].toLowerCase() === "pm") hours += 12
    return { hours, minutes: Number(twelveHour[2] ?? 0) }
  }
  const twentyFourHour = prompt.match(/\bat\s+(\d{1,2}):(\d{2})\b/i)
  if (twentyFourHour) return { hours: Math.min(23, Number(twentyFourHour[1])), minutes: Math.min(59, Number(twentyFourHour[2])) }
  return { hours: 10, minutes: 0 }
}

function parseDuration(prompt: string): number {
  const minutes = prompt.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i)?.[1]
  if (minutes) return Math.min(240, Math.max(15, Number(minutes)))
  const hours = prompt.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i)?.[1]
  if (hours) return Math.min(240, Math.max(15, Math.round(Number(hours) * 60)))
  return 30
}

function localDateTimeValue(date: string, hours: number, minutes: number): string {
  return `${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function addMinutes(value: string, minutes: number): string {
  const date = new Date(`${value}:00Z`)
  date.setUTCMinutes(date.getUTCMinutes() + minutes)
  return date.toISOString().slice(0, 16)
}

export async function planAiCalendarWorkflow(value: unknown, actor: RequestActor) {
  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Your role cannot schedule employee meetings.", 403)
  const { prompt } = calendarAgentPrompt.parse(value)
  const lower = prompt.toLowerCase()
  if (/attrition\s+risk|high[-\s]?risk|likely\s+to\s+leave/i.test(prompt)) {
    throw new PeopleError("Historical attrition scores are anonymized and cannot identify live employees. Choose named employees, a department, or the mobility-review cohort instead.", 422)
  }

  const db = await database()
  const available = await availableEmployees(db, actor)
  const promoted = await db.prepare("SELECT DISTINCT employee_id FROM promotion_records").all<{ employee_id: string }>()
  const promotedIds = new Set((promoted.results ?? []).map((row) => row.employee_id))

  const exactMatches = available.filter((employee) => {
    const name = employee.display_name.toLowerCase()
    return lower.includes(employee.employee_id.toLowerCase()) || (name.length >= 3 && lower.includes(name))
  })
  const department = [...new Set(available.map((employee) => employee.department))]
    .find((name) => lower.includes(name.toLowerCase()))

  let cohort = "named employees"
  let selected = exactMatches
  if (!selected.length && /promot|mobility|career progression|career review/i.test(prompt)) {
    cohort = "active operational employees with at least three years of tenure and no recorded promotion"
    selected = available.filter((employee) => employee.tenure_years >= 3 && !promotedIds.has(employee.employee_id))
  } else if (!selected.length && department) {
    cohort = `active operational employees in ${department}`
    selected = available.filter((employee) => employee.department === department)
  } else if (!selected.length && /all\s+(?:active\s+)?employees|company[-\s]?wide/i.test(prompt)) {
    cohort = "all active operational employees with work email addresses"
    selected = available
  }

  if (!selected.length) {
    throw new PeopleError("Name an employee, employee ID, department, or a supported cohort such as mobility review.", 422)
  }
  if (selected.length > 20) {
    throw new PeopleError(`${selected.length} employees match. Narrow the request to a department or named group of no more than 20 people.`, 422)
  }

  const timezone = parseTimeZone(prompt)
  const meetingDate = parseMeetingDate(prompt, timezone)
  if (meetingDate < dateInTimeZone(timezone)) {
    throw new PeopleError("Choose a current or future meeting date.", 422)
  }
  const meetingTime = parseMeetingTime(prompt)
  const start = localDateTimeValue(meetingDate, meetingTime.hours, meetingTime.minutes)
  const end = addMinutes(start, parseDuration(prompt))
  const mobilityReview = /promot|mobility|career progression|career review/i.test(prompt)
  const title = mobilityReview ? "Career progression review" : department ? `${department} employee review` : "Employee review meeting"
  const agenda = mobilityReview
    ? "Review current role scope, career interests, internal mobility options, development support, and agreed follow-up actions. Confirm promotion history and employee preference before making decisions."
    : "Review current priorities, support needed, development opportunities, and agreed follow-up actions."

  return {
    prompt,
    title,
    start,
    end,
    timezone,
    location: "",
    agenda,
    employeeIds: selected.map((employee) => employee.employee_id),
    employees: selected.map((employee) => ({
      employeeId: employee.employee_id,
      name: employee.display_name,
      jobTitle: employee.job_title,
      department: employee.department,
      location: employee.location,
      tenureYears: employee.tenure_years,
    })),
    evidence: `${selected.length} ${cohort} matched the persisted employee and promotion records.`,
    sourceMode: "operational",
    requiresConfirmation: true,
  }
}

function calendarDate(value: string): string {
  return `${value.replace(/[-:T]/g, "")}00`
}

function calendarUrl(input: z.infer<typeof draftSchema> & { type: "calendar_invite" }, employees: ContactEmployee[]): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${calendarDate(input.start)}/${calendarDate(input.end)}`,
    ctz: input.timezone,
    details: input.agenda,
  })
  if (input.location) params.set("location", input.location)
  for (const employee of employees) params.append("add", employee.work_email)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function emailUrl(input: z.infer<typeof draftSchema> & { type: "employee_email" }, employees: ContactEmployee[]): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    bcc: employees.map((employee) => employee.work_email).join(","),
    su: input.subject,
    body: input.message,
  })
  return `https://mail.google.com/mail/?${params.toString()}`
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T } catch { return fallback }
}

function publicDraft(row: DraftRow) {
  const details = parseJson<Record<string, unknown>>(row.details_json, {})
  const ids = parseJson<string[]>(row.employee_ids_json, [])
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    recipientCount: ids.length,
    summary: typeof details.summary === "string" ? details.summary : "",
    openedAt: row.opened_at,
    createdAt: row.created_at,
  }
}

export async function listAiWorkflowDrafts(actor: RequestActor) {
  const db = await database()
  const rows = await db.prepare("SELECT * FROM ai_workflow_drafts WHERE LOWER(created_by_email)=LOWER(?) ORDER BY created_at DESC LIMIT 12")
    .bind(actor.email)
    .all<DraftRow>()
  return { items: (rows.results ?? []).map(publicDraft) }
}

export async function createAiWorkflowDraft(value: unknown, actor: RequestActor) {
  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Your role cannot prepare employee communications.", 403)
  const input = draftSchema.parse(value)
  if (input.type === "calendar_invite" && new Date(input.end).getTime() <= new Date(input.start).getTime()) {
    throw new PeopleError("Meeting end time must be after the start time.", 422)
  }

  const db = await database()
  const employees = await eligibleEmployees(db, actor, input.employeeIds)
  const id = `AIW-${crypto.randomUUID().toUpperCase()}`
  const title = input.type === "calendar_invite" ? input.title : input.subject
  const launchUrl = input.type === "calendar_invite" ? calendarUrl(input, employees) : emailUrl(input, employees)
  const summary = input.type === "calendar_invite"
    ? `${input.start.replace("T", " ")} · ${input.timezone}`
    : `${employees.length} employee${employees.length === 1 ? "" : "s"}`
  const details = input.type === "calendar_invite"
    ? { start: input.start, end: input.end, timezone: input.timezone, location: input.location, agenda: input.agenda, summary }
    : { subject: input.subject, message: input.message, summary }

  await db.prepare("INSERT INTO ai_workflow_drafts(id, type, title, status, employee_ids_json, details_json, created_by_email) VALUES (?, ?, ?, 'ready', ?, ?, ?)")
    .bind(id, input.type, title, JSON.stringify(employees.map((employee) => employee.employee_id)), JSON.stringify(details), actor.email)
    .run()

  return {
    draft: {
      id,
      type: input.type,
      title,
      status: "ready",
      recipientCount: employees.length,
      recipients: employees.map((employee) => ({ employeeId: employee.employee_id, name: employee.display_name, email: employee.work_email })),
      summary,
      createdAt: new Date().toISOString(),
    },
    launchUrl,
    confirmation: input.type === "calendar_invite"
      ? "Review the event in Google Calendar, then save it to send invitations."
      : "Review the message in Gmail, then send it when ready.",
  }
}

export async function markAiWorkflowOpened(id: string, actor: RequestActor) {
  const db = await database()
  const row = await db.prepare("SELECT * FROM ai_workflow_drafts WHERE id=?").bind(id).first<DraftRow>()
  if (!row) throw new PeopleError("Prepared workflow not found.", 404)
  if (row.created_by_email.toLowerCase() !== actor.email.toLowerCase() && !["admin", "hr"].includes(actor.role)) {
    throw new PeopleError("You cannot update this prepared workflow.", 403)
  }
  await db.prepare("UPDATE ai_workflow_drafts SET status='opened', opened_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(id)
    .run()
  return { ...publicDraft({ ...row, status: "opened", opened_at: new Date().toISOString() }), status: "opened" }
}

export async function executeAiCalendarWorkflow(id: string, actor: RequestActor, request: Request) {
  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Your role cannot schedule employee meetings.", 403)
  const db = await database()
  const row = await db.prepare("SELECT * FROM ai_workflow_drafts WHERE id=?").bind(id).first<DraftRow>()
  if (!row) throw new PeopleError("Prepared workflow not found.", 404)
  if (row.type !== "calendar_invite") throw new PeopleError("This workflow is not a calendar event.", 422)
  if (row.created_by_email.toLowerCase() !== actor.email.toLowerCase() && !["admin", "hr"].includes(actor.role)) {
    throw new PeopleError("You cannot execute this workflow.", 403)
  }
  if (row.status === "sent") throw new PeopleError("This calendar event has already been created.", 409)

  const details = parseJson<Record<string, unknown>>(row.details_json, {})
  const input = draftSchema.parse({
    type: "calendar_invite",
    employeeIds: parseJson<string[]>(row.employee_ids_json, []),
    title: row.title,
    start: details.start,
    end: details.end,
    timezone: details.timezone,
    location: details.location ?? "",
    agenda: details.agenda,
  })
  if (input.type !== "calendar_invite") throw new PeopleError("Invalid calendar workflow.", 422)
  const employees = await eligibleEmployees(db, actor, input.employeeIds)
  const event = await createGoogleCalendarEvent(request, {
    title: input.title,
    start: input.start,
    end: input.end,
    timezone: input.timezone,
    location: input.location,
    agenda: input.agenda,
    attendees: employees.map((employee) => ({ email: employee.work_email, name: employee.display_name })),
  })
  await db.prepare("UPDATE ai_workflow_drafts SET status='sent', opened_at=CURRENT_TIMESTAMP, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(JSON.stringify({ ...details, eventId: event.eventId, eventUrl: event.eventUrl }), id)
    .run()
  return {
    id,
    status: "sent",
    eventUrl: event.eventUrl,
    message: `Calendar event created and ${employees.length} invitation${employees.length === 1 ? "" : "s"} sent.`,
  }
}
