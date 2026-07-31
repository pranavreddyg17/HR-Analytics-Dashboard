import { z } from "zod"

import { ensureHrDatabase, type Database } from "@/lib/server/hr-database"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

const employeeIds = z.array(z.string().trim().min(1).max(60)).min(1).max(20)
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)

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

async function eligibleEmployees(db: Database, actor: RequestActor, requestedIds: string[]): Promise<ContactEmployee[]> {
  const rows = await db.prepare(`
    SELECT
      employee_id,
      TRIM(COALESCE(NULLIF(preferred_name, ''), first_name) || ' ' || last_name) AS display_name,
      work_email,
      manager_id,
      department,
      job_title
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

  const byId = new Map(available.map((employee) => [employee.employee_id, employee]))
  const selected = [...new Set(requestedIds)].map((id) => byId.get(id)).filter((employee): employee is ContactEmployee => Boolean(employee))
  if (selected.length !== new Set(requestedIds).size) {
    throw new PeopleError("Choose active operational employee records with work email addresses. Managers can only select direct reports.", 422)
  }
  return selected
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
