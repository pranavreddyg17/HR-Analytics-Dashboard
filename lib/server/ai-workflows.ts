import { z } from "zod"

import { ensureHrDatabase, type Database } from "@/lib/server/hr-repository"
import { synthesizeWithAzureResponses } from "@/lib/server/azure-ai"
import { createGoogleCalendarEvent } from "@/lib/server/google-calendar"
import { assignLearningCourse, listLearningOperations } from "@/lib/server/learning"
import { PeopleError } from "@/lib/server/people"
import { createMicrosoftTeamsMeeting } from "@/lib/server/microsoft-teams"
import type { RequestActor } from "@/lib/server/request-user"
import { createRetentionReview, getRetentionIntelligence } from "@/lib/server/retention-intelligence"
import { createWorkflow } from "@/lib/server/workflows"

const employeeIds = z.array(z.string().trim().min(1).max(60)).min(1).max(20)
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
const calendarAgentPrompt = z.object({ prompt: z.string().trim().min(10).max(1200) })
const learningTargetType = z.enum(["department", "job_title", "job_level", "manager_team", "job_profile"])
const calendarProvider = z.enum(["google", "microsoft_teams"])

const draftSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("calendar_invite"),
    calendarProvider: calendarProvider.optional().default("google"),
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
  z.object({
    type: z.literal("learning_assignment"),
    targetType: learningTargetType,
    targetValue: z.string().trim().max(160).optional().default(""),
    courseId: z.string().trim().min(3).max(240),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hours: z.number().positive().max(500).optional(),
    note: z.string().trim().max(600).optional().default(""),
    recommendationId: z.string().trim().max(300).optional(),
  }),
  z.object({
    type: z.literal("hiring_requisition"),
    position: z.string().trim().min(2).max(120),
    department: z.string().trim().min(1).max(100),
    location: z.string().trim().min(1).max(120),
    employmentType: z.enum(["Full-time", "Part-time", "Contract", "Intern", "Temporary"]),
    justification: z.string().trim().min(10).max(800),
  }),
  z.object({
    type: z.literal("retention_review"),
    department: z.string().trim().min(1).max(120),
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
  type: "calendar_invite" | "employee_email" | "learning_assignment" | "hiring_requisition" | "retention_review"
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
    FROM employee_directory_view
    WHERE archived_at IS NULL
      AND LOWER(employment_status) <> 'terminated'
      AND LOWER(data_source) <> 'demo'
      AND COALESCE(work_email, '') <> ''
  `).all<ContactEmployee>()

  let available = rows.results ?? []
  if (actor.role === "manager") {
    const manager = await db.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL")
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

async function planAiCalendarWorkflow(value: unknown, actor: RequestActor) {
  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Your role cannot schedule employee meetings.", 403)
  const { prompt } = calendarAgentPrompt.parse(value)
  const lower = prompt.toLowerCase()
  if (/attrition\s+risk|high[-\s]?risk|likely\s+to\s+leave/i.test(prompt)) {
    throw new PeopleError("IBM attrition scores are linked only to synthetic demo employees, which cannot receive calendar invitations. Choose imported employees, a department, or the mobility-review cohort instead.", 422)
  }

  const db = await database()
  const available = await availableEmployees(db, actor)
  const promoted = await db.prepare("SELECT DISTINCT employee_id FROM promotion_events_view").all<{ employee_id: string }>()
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
  const selectedCalendarProvider = /\bgoogle(?:\s+calendar)?\b/i.test(prompt) ? "google" as const : "microsoft_teams" as const
  const agenda = mobilityReview
    ? "Review current role scope, career interests, internal mobility options, development support, and agreed follow-up actions. Confirm promotion history and employee preference before making decisions."
    : "Review current priorities, support needed, development opportunities, and agreed follow-up actions."

  return {
    type: "calendar_invite" as const,
    calendarProvider: selectedCalendarProvider,
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

function textScore(prompt: string, values: string[]): number {
  const normalized = prompt.toLowerCase()
  return values.reduce((score, value) => score + (value.length >= 3 && normalized.includes(value.toLowerCase()) ? value.split(/\s+/).length + 1 : 0), 0)
}

async function planAiLearningWorkflow(value: unknown, actor: RequestActor) {
  if (!["admin", "hr"].includes(actor.role)) throw new PeopleError("Only HR can prepare role-cohort learning assignments. Managers can assign direct reports from Learning.", 403)
  const { prompt } = calendarAgentPrompt.parse(value)
  const operations = await listLearningOperations(actor)
  const candidates = operations.recommendations.map((recommendation) => ({
    recommendation,
    score: textScore(prompt, [recommendation.skillName, recommendation.courseTitle, recommendation.jobTitle, recommendation.department, recommendation.category])
      + (recommendation.priority === "High" ? 2 : recommendation.priority === "Medium" ? 1 : 0),
  })).sort((left, right) => right.score - left.score || right.recommendation.employeesNeedingEvidence - left.recommendation.employeesNeedingEvidence)
  const selected = candidates[0]?.recommendation
  if (!selected) throw new PeopleError("No course is mapped to an unmet capability requirement. Review the capability mappings in Learning first.", 422)
  const explicitlyNamed = candidates[0]?.score && candidates[0].score > (selected.priority === "High" ? 2 : selected.priority === "Medium" ? 1 : 0)
  if (!explicitlyNamed && !/recommend|highest|priority|capability|skill|upskill|learning|course/i.test(prompt)) {
    throw new PeopleError("Name a role, department, skill, or course, or ask for the highest-priority capability recommendation.", 422)
  }
  const dueDate = shiftDate(dateInTimeZone("America/Los_Angeles"), selected.priority === "High" ? 14 : 30)
  return {
    type: "learning_assignment" as const,
    title: `Assign ${selected.courseTitle}`,
    courseId: selected.courseId,
    courseTitle: selected.courseTitle,
    skillName: selected.skillName,
    targetType: selected.targetType,
    targetValue: selected.targetValue,
    targetLabel: `${selected.jobTitle} · ${selected.department}`,
    dueDate,
    hours: operations.courses.find((course) => course.id === selected.courseId)?.defaultHours ?? 1,
    note: `Capability plan: ${selected.skillName}. Confirm relevance and access with each employee.`,
    recipientCount: selected.employeesNeedingEvidence,
    alreadyCompleted: selected.completedEvidence,
    openRequisitions: selected.openRequisitions,
    evidence: selected.reason,
    recommendationId: selected.id,
    requiresConfirmation: true,
  }
}

function cleanModelJson(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
}

async function classifyWorkflow(prompt: string): Promise<"calendar_invite" | "learning_assignment" | "hiring_requisition" | "retention_review" | null> {
  const output = await synthesizeWithAzureResponses({
    system: "Classify an HR workflow request. Return JSON only with one key named type. Allowed values: calendar_invite, learning_assignment, hiring_requisition, retention_review. Choose hiring_requisition for new position or headcount requests; learning_assignment for courses, skills, training, or upskilling; retention_review for a governed department attrition or retention review; calendar_invite for meetings or calendar events. Do not add fields or prose.",
    user: prompt,
  }).catch(() => null)
  if (!output) return null
  try {
    const type = (JSON.parse(cleanModelJson(output)) as { type?: string }).type
    return ["calendar_invite", "learning_assignment", "hiring_requisition", "retention_review"].includes(type ?? "")
      ? type as "calendar_invite" | "learning_assignment" | "hiring_requisition" | "retention_review"
      : null
  } catch { return null }
}

function phraseAfter(prompt: string, marker: RegExp): string | null {
  const match = prompt.match(marker)?.[1]?.trim()
  return match ? match.replace(/[.;]+$/, "").trim() : null
}

async function planAiHiringWorkflow(value: unknown, actor: RequestActor) {
  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Your role cannot request a position.", 403)
  const { prompt } = calendarAgentPrompt.parse(value)
  const db = await database()
  const [departmentResult, locationResult] = await Promise.all([
    db.prepare("SELECT DISTINCT department FROM employee_directory_view WHERE archived_at IS NULL AND department <> '' ORDER BY department").all<{ department: string }>(),
    db.prepare("SELECT DISTINCT location FROM employee_directory_view WHERE archived_at IS NULL AND location <> '' ORDER BY location").all<{ location: string }>(),
  ])
  const lower = prompt.toLowerCase()
  const department = (departmentResult.results ?? []).map((row) => row.department).find((value) => lower.includes(value.toLowerCase()))
  const location = (locationResult.results ?? []).map((row) => row.location).find((value) => lower.includes(value.toLowerCase()))
  if (!department || !location) throw new PeopleError("Include the department and work location for the position request.", 422)
  const rawPosition = phraseAfter(prompt, /(?:request|open|hire|recruit|onboard)\s+(?:a|an|the)?\s*([^,.;]+?)(?=\s+(?:in|for|at)\s+|[,.;]|$)/i)
  const position = rawPosition?.replace(/\b(?:full[- ]time|part[- ]time|contract|temporary|intern)\b/ig, "").trim()
  if (!position || position.length < 2) throw new PeopleError("Name the position you want to request.", 422)
  const justification = phraseAfter(prompt, /\b(?:because|justification(?:\s+is)?|business need(?:\s+is)?|to support)\s+(.+)$/i)
  if (!justification || justification.length < 10) throw new PeopleError("Include a short business justification using “because” or “to support”.", 422)
  const employmentType = /part[- ]time/i.test(prompt) ? "Part-time" as const
    : /\bcontract(?:or)?\b/i.test(prompt) ? "Contract" as const
      : /\bintern(?:ship)?\b/i.test(prompt) ? "Intern" as const
        : /\btemporary\b/i.test(prompt) ? "Temporary" as const : "Full-time" as const
  const existing = await db.prepare(`SELECT id, recruitment_status FROM hiring_requisitions_view
    WHERE LOWER(position)=LOWER(?) AND LOWER(department)=LOWER(?) AND LOWER(location)=LOWER(?)
      AND LOWER(recruitment_status) IN ('requested','open','offer')`)
    .bind(position, department, location).all<{ id: string; recruitment_status: string }>()
  if ((existing.results ?? []).length) throw new PeopleError(`An active ${position} requisition already exists for ${department} in ${location}. Review it in Onboarding before creating another.`, 409)
  const activeEmployees = await db.prepare(`SELECT COUNT(*)::int AS count FROM employee_directory_view
    WHERE archived_at IS NULL AND LOWER(employment_status) IN ('active','on leave') AND department=?`).bind(department).first<{ count: number }>()
  const departmentHeadcount = Number(activeEmployees?.count ?? 0)
  return {
    type: "hiring_requisition" as const,
    title: `Request ${position}`,
    position,
    department,
    location,
    employmentType,
    justification,
    activeEmployees: departmentHeadcount,
    evidence: `${departmentHeadcount} active employee${departmentHeadcount === 1 ? " is" : "s are"} recorded in ${department}; no matching active requisition was found for ${position} in ${location}.`,
    requiresConfirmation: true,
  }
}

async function planAiRetentionWorkflow(value: unknown, actor: RequestActor) {
  if (!["admin", "hr"].includes(actor.role)) throw new PeopleError("Only HR can create a retention review.", 403)
  const { prompt } = calendarAgentPrompt.parse(value)
  const intelligence = await getRetentionIntelligence()
  const lower = prompt.toLowerCase()
  const selected = intelligence.cohortAlerts.find((cohort) => lower.includes(cohort.department.toLowerCase()))
    ?? intelligence.cohortAlerts.find((cohort) => cohort.priority === "Priority")
    ?? intelligence.cohortAlerts[0]
  if (!selected) throw new PeopleError("No department currently meets the governed minimum population for a retention review.", 422)
  return {
    type: "retention_review" as const,
    title: `Review ${selected.department} retention evidence`,
    department: selected.department,
    population: selected.population,
    recordedAttritionRate: selected.recordedAttritionRate,
    aboveThresholdShare: selected.aboveThresholdShare,
    leadingExitReason: selected.leadingExitReason,
    priority: selected.priority,
    currentReviewStatus: selected.reviewStatus,
    evidence: `${selected.recordedAttritionRate}% recorded attrition, ${selected.aboveThresholdShare}% above the model review threshold, and ${selected.leadingExitReason} is the leading recorded exit reason.`,
    requiresConfirmation: true,
  }
}

export async function planAiWorkflow(value: unknown, actor: RequestActor) {
  const parsed = calendarAgentPrompt.parse(value)
  const modelType = await classifyWorkflow(parsed.prompt)
  const type = modelType ?? (/learn|course|training|skill|upskill|capability|certif/i.test(parsed.prompt)
    ? "learning_assignment"
    : /request|requisition|headcount|open (?:a|an) role|hire (?:a|an)/i.test(parsed.prompt) ? "hiring_requisition"
      : /retention|attrition|stay review/i.test(parsed.prompt) ? "retention_review" : "calendar_invite")
  if (type === "learning_assignment") return planAiLearningWorkflow(parsed, actor)
  if (type === "hiring_requisition") return planAiHiringWorkflow(parsed, actor)
  if (type === "retention_review") return planAiRetentionWorkflow(parsed, actor)
  return planAiCalendarWorkflow(parsed, actor)
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
  const rows = await db.prepare("SELECT * FROM ai_workflow_drafts WHERE created_by_email = ? ORDER BY created_at DESC LIMIT 12")
    .bind(actor.email)
    .all<DraftRow>()
  return { items: (rows.results ?? []).map(publicDraft) }
}

export async function getAiWorkflowDraft(id: string, actor: RequestActor) {
  const db = await database()
  const row = await db.prepare("SELECT * FROM ai_workflow_drafts WHERE id=?").bind(id).first<DraftRow>()
  if (!row) throw new PeopleError("Prepared workflow not found.", 404)
  if (row.created_by_email.toLowerCase() !== actor.email.toLowerCase() && !["admin", "hr"].includes(actor.role)) {
    throw new PeopleError("You cannot view this prepared workflow.", 403)
  }
  return {
    ...publicDraft(row),
    details: parseJson<Record<string, unknown>>(row.details_json, {}),
    requiresConfirmation: true as const,
  }
}

export async function createAiWorkflowDraft(value: unknown, actor: RequestActor) {
  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Your role cannot prepare employee communications.", 403)
  const input = draftSchema.parse(value)
  if (input.type === "calendar_invite" && new Date(input.end).getTime() <= new Date(input.start).getTime()) {
    throw new PeopleError("Meeting end time must be after the start time.", 422)
  }

  const db = await database()
  const employees = input.type === "calendar_invite" || input.type === "employee_email"
    ? await eligibleEmployees(db, actor, input.employeeIds)
    : []
  const learningRecipientIds = input.type === "learning_assignment"
    ? (await db.prepare(`SELECT e.employee_id FROM employee_directory_view e
        WHERE e.archived_at IS NULL AND LOWER(e.employment_status) IN ('active','preboarding','on leave')
          AND CASE ?
            WHEN 'department' THEN e.department=?
            WHEN 'job_title' THEN e.job_title=?
            WHEN 'job_level' THEN e.job_level=?
            WHEN 'job_profile' THEN e.job_profile_id=?
            ELSE FALSE
          END
        ORDER BY e.employee_id LIMIT 500`)
      .bind(input.targetType, input.targetValue, input.targetValue, input.targetValue, input.targetValue)
      .all<{ employee_id: string }>()).results?.map((row) => row.employee_id) ?? []
    : []
  const id = `AIW-${crypto.randomUUID().toUpperCase()}`
  const course = input.type === "learning_assignment"
    ? await db.prepare("SELECT title, default_duration_hours FROM learning_courses WHERE id=? AND LOWER(status)='active'").bind(input.courseId).first<{ title: string; default_duration_hours: number }>()
    : null
  if (input.type === "learning_assignment" && !course) throw new PeopleError("The selected course is no longer active.", 409)
  const title = input.type === "calendar_invite" ? input.title : input.type === "employee_email" ? input.subject : input.type === "learning_assignment" ? `Assign ${course?.title}` : input.type === "hiring_requisition" ? `Request ${input.position}` : `${input.department} retention review`
  const launchUrl = input.type === "calendar_invite" && input.calendarProvider === "google" ? calendarUrl(input, employees) : input.type === "employee_email" ? emailUrl(input, employees) : null
  const summary = input.type === "calendar_invite"
    ? `${input.start.replace("T", " ")} · ${input.timezone}`
    : input.type === "employee_email" ? `${employees.length} employee${employees.length === 1 ? "" : "s"}` : input.type === "learning_assignment" ? `${input.targetType.replaceAll("_", " ")} · due ${input.dueDate}` : input.type === "hiring_requisition" ? `${input.department} · ${input.location}` : input.department
  const details = input.type === "calendar_invite"
    ? { calendarProvider: input.calendarProvider, start: input.start, end: input.end, timezone: input.timezone, location: input.location, agenda: input.agenda, summary }
    : input.type === "employee_email" ? { subject: input.subject, message: input.message, summary }
      : input.type === "learning_assignment" ? { targetType: input.targetType, targetValue: input.targetValue, courseId: input.courseId, dueDate: input.dueDate, hours: input.hours ?? course?.default_duration_hours, note: input.note, recommendationId: input.recommendationId, summary }
        : input.type === "hiring_requisition" ? { position: input.position, department: input.department, location: input.location, employmentType: input.employmentType, justification: input.justification, summary }
          : { department: input.department, summary }

  await db.prepare("INSERT INTO ai_workflow_drafts(id, type, title, status, employee_ids_json, details_json, created_by_email) VALUES (?, ?, ?, 'ready', ?, ?, ?)")
    .bind(id, input.type, title, JSON.stringify(input.type === "learning_assignment" ? learningRecipientIds : employees.map((employee) => employee.employee_id)), JSON.stringify(details), actor.email)
    .run()

  return {
    draft: {
      id,
      type: input.type,
      title,
      status: "ready",
      recipientCount: input.type === "learning_assignment" ? learningRecipientIds.length : employees.length,
      recipients: employees.map((employee) => ({ employeeId: employee.employee_id, name: employee.display_name, email: employee.work_email })),
      summary,
      createdAt: new Date().toISOString(),
    },
    launchUrl,
    confirmation: input.type === "calendar_invite"
      ? input.calendarProvider === "microsoft_teams"
        ? "Confirm to create the Teams meeting and send calendar invitations."
        : "Confirm to create the Google Calendar event and send invitations."
      : input.type === "employee_email" ? "Review the message in Gmail, then send it when ready." : input.type === "learning_assignment" ? "Review the capability, cohort, course, and due date before creating assignments." : input.type === "hiring_requisition" ? "Review the role, location, employment type, and business justification before submitting the requisition." : "Review the department evidence before creating a governed retention work item.",
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

export async function executeAiWorkflow(id: string, actor: RequestActor, request: Request) {
  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Your role cannot execute HR workflows.", 403)
  const db = await database()
  const row = await db.prepare("SELECT * FROM ai_workflow_drafts WHERE id=?").bind(id).first<DraftRow>()
  if (!row) throw new PeopleError("Prepared workflow not found.", 404)
  if (row.created_by_email.toLowerCase() !== actor.email.toLowerCase() && !["admin", "hr"].includes(actor.role)) {
    throw new PeopleError("You cannot execute this workflow.", 403)
  }
  if (["sent", "completed"].includes(row.status)) throw new PeopleError("This workflow has already been completed.", 409)
  const claimed = await db.prepare(`UPDATE ai_workflow_drafts SET status='executing', updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND (status IN ('ready','opened') OR (status='executing' AND updated_at::timestamptz < CURRENT_TIMESTAMP - INTERVAL '15 minutes'))
    RETURNING id`).bind(id).first<{ id: string }>()
  if (!claimed) throw new PeopleError("This workflow is already being executed.", 409)

  try {
    const details = parseJson<Record<string, unknown>>(row.details_json, {})
    if (row.type === "learning_assignment") {
      const result = await assignLearningCourse({
        targetType: details.targetType,
        targetValue: details.targetValue,
        courseId: details.courseId,
        dueDate: details.dueDate,
        hours: details.hours,
        note: details.note,
      }, actor)
      await db.prepare("UPDATE ai_workflow_drafts SET status='completed', opened_at=CURRENT_TIMESTAMP, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(JSON.stringify({ ...details, campaignId: result.id, assigned: result.assigned, skipped: result.skipped }), id).run()
      return { id, status: "completed", message: result.message, campaignId: result.id }
    }
    if (row.type === "hiring_requisition") {
      const result = await createWorkflow({
        type: "hiring",
        position: details.position,
        department: details.department,
        location: details.location,
        employmentType: details.employmentType,
        justification: details.justification,
      }, actor)
      await db.prepare("UPDATE ai_workflow_drafts SET status='completed', opened_at=CURRENT_TIMESTAMP, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(JSON.stringify({ ...details, requisitionId: result.id }), id).run()
      return { id, status: "completed", message: result.message, requisitionId: result.id }
    }
    if (row.type === "retention_review") {
      const result = await createRetentionReview(String(details.department ?? ""), actor)
      await db.prepare("UPDATE ai_workflow_drafts SET status='completed', opened_at=CURRENT_TIMESTAMP, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(JSON.stringify({ ...details, retentionReviewId: result.id, retentionReviewStatus: result.status }), id).run()
      return { id, status: "completed", message: `Retention review ${result.status === "pending" ? "created" : "available"}.`, retentionReviewId: result.id }
    }
    if (row.type !== "calendar_invite") throw new PeopleError("This workflow cannot be executed automatically.", 422)
    const input = draftSchema.parse({
      type: "calendar_invite",
      calendarProvider: details.calendarProvider ?? "google",
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
    const eventInput = {
      title: input.title,
      start: input.start,
      end: input.end,
      timezone: input.timezone,
      location: input.location,
      agenda: input.agenda,
      attendees: employees.map((employee) => ({ email: employee.work_email, name: employee.display_name })),
    }
    const event = input.calendarProvider === "microsoft_teams"
      ? await createMicrosoftTeamsMeeting(request, { ...eventInput, workflowId: id })
      : await createGoogleCalendarEvent(request, eventInput)
    await db.prepare("UPDATE ai_workflow_drafts SET status='sent', opened_at=CURRENT_TIMESTAMP, details_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(JSON.stringify({ ...details, calendarProvider: input.calendarProvider, eventId: event.eventId, eventUrl: event.eventUrl, joinUrl: "joinUrl" in event ? event.joinUrl : null }), id)
      .run()
    return {
      id,
      status: "sent",
      eventUrl: event.eventUrl,
      message: `${input.calendarProvider === "microsoft_teams" ? "Teams meeting" : "Google Calendar event"} created and ${employees.length} invitation${employees.length === 1 ? "" : "s"} sent.`,
    }
  } catch (error) {
    await db.prepare("UPDATE ai_workflow_drafts SET status='ready', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='executing'").bind(id).run().catch(() => undefined)
    throw error
  }
}
