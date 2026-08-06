import { z } from "zod"

import type { LearningAssignment, LearningCourse, LearningOperations, LearningPerson } from "@/lib/learning-types"
import { ensureHrDatabase, type Database } from "@/lib/server/hr-database"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const assignmentSchema = z.object({
  employeeId: z.string().trim().min(2).max(40),
  courseId: z.string().trim().min(3).max(240),
  dueDate: isoDate,
  hours: z.number().positive().max(500).optional(),
  note: z.string().trim().max(600).optional().default(""),
})
const completionSchema = z.object({
  assessmentScore: z.number().min(0).max(100).nullable().optional(),
  note: z.string().trim().max(600).optional().default(""),
})
const courseSchema = z.object({
  code: z.string().trim().min(2).max(40).optional(),
  title: z.string().trim().min(2).max(160),
  defaultHours: z.number().positive().max(500),
  isMandatory: z.boolean().default(false),
})

type AssignmentRow = {
  id: string
  course_id: string
  course_title: string
  is_mandatory: number
  employee_id: string
  employee_name: string
  employee_email: string | null
  manager_id: string | null
  department: string
  location: string
  status: string
  assigned_at: string
  due_date: string | null
  completed_at: string | null
  assigned_hours: number
  assessment_score: number | null
  requested_by_email: string | null
  completion_notes: string | null
}

async function database(): Promise<Database> {
  const db = await ensureHrDatabase()
  if (!db) throw new PeopleError("Learning storage is unavailable.", 503)
  return db
}

async function actorEmployeeId(db: Database, actor: RequestActor): Promise<string | null> {
  const employee = await db.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL")
    .bind(actor.email).first<{ employee_id: string }>()
  return employee?.employee_id ?? null
}

function assertLearningEditor(actor: RequestActor): void {
  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Your role cannot assign learning.", 403)
}

function courseId(title: string): string {
  return `course:${title.trim().toLowerCase()}`
}

export async function listLearningOperations(actor: RequestActor, filters: { department?: string; location?: string } = {}): Promise<LearningOperations> {
  const db = await database()
  const employeeId = await actorEmployeeId(db, actor)
  const scopeSql = ["admin", "hr"].includes(actor.role)
    ? "1=1"
    : actor.role === "manager" && employeeId
      ? "(e.manager_id=? OR e.employee_id=?)"
      : employeeId
        ? "e.employee_id=?"
        : "1=0"
  const bindings: unknown[] = actor.role === "manager" && employeeId ? [employeeId, employeeId] : !["admin", "hr"].includes(actor.role) && employeeId ? [employeeId] : []
  const where = [scopeSql, "LOWER(a.data_source) <> 'demo'", "e.archived_at IS NULL"]
  if (filters.department) { where.push("e.department=?"); bindings.push(filters.department) }
  if (filters.location) { where.push("e.location=?"); bindings.push(filters.location) }
  const assignmentResult = await db.prepare(`SELECT a.id, a.course_id, c.title AS course_title, c.is_mandatory,
      a.employee_id, TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS employee_name,
      e.work_email AS employee_email, e.manager_id, e.department, e.location, a.status, a.assigned_at, a.due_date,
      a.completed_at, a.assigned_hours, a.assessment_score, w.requested_by_email, w.completion_notes
    FROM course_assignments a
    JOIN learning_courses c ON c.id=a.course_id
    JOIN employee_directory_view e ON e.employee_id=a.employee_id
    LEFT JOIN workflow_requests w ON w.id=a.id AND w.type='training'
    WHERE ${where.join(" AND ")}
    ORDER BY CASE WHEN LOWER(a.status) <> 'completed' AND a.due_date < date('now') THEN 0 WHEN LOWER(a.status) <> 'completed' THEN 1 ELSE 2 END,
      COALESCE(a.due_date, '9999-12-31'), COALESCE(a.completed_at, a.assigned_at) DESC
    LIMIT 5000`).bind(...bindings).all<AssignmentRow>()

  const [courseResult, peopleResult] = await Promise.all([
    db.prepare("SELECT id, code, title, default_duration_hours, is_mandatory FROM learning_courses WHERE LOWER(status)='active' ORDER BY is_mandatory DESC, title")
      .all<{ id: string; code: string | null; title: string; default_duration_hours: number; is_mandatory: number }>(),
    db.prepare(`SELECT e.employee_id, TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS display_name, e.department, e.job_title, e.location
      FROM employee_directory_view e WHERE e.archived_at IS NULL AND LOWER(e.employment_status) IN ('active','preboarding','on leave') AND ${scopeSql}
      ORDER BY display_name LIMIT 5000`).bind(...(actor.role === "manager" && employeeId ? [employeeId, employeeId] : !["admin", "hr"].includes(actor.role) && employeeId ? [employeeId] : [])).all<{ employee_id: string; display_name: string; department: string; job_title: string; location: string }>(),
  ])
  const today = new Date().toISOString().slice(0, 10)
  const assignments: LearningAssignment[] = (assignmentResult.results ?? []).map((row) => ({
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    isMandatory: Boolean(row.is_mandatory),
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    department: row.department,
    location: row.location,
    status: row.status,
    assignedAt: row.assigned_at,
    dueDate: row.due_date,
    completedAt: row.completed_at,
    assignedHours: Number(row.assigned_hours),
    assessmentScore: row.assessment_score === null ? null : Number(row.assessment_score),
    requestedByEmail: row.requested_by_email,
    completionNote: row.completion_notes,
    canComplete: ["admin", "hr"].includes(actor.role) || row.employee_email?.toLowerCase() === actor.email.toLowerCase(),
  }))
  const courses: LearningCourse[] = (courseResult.results ?? []).map((row) => ({ id: row.id, code: row.code, title: row.title, defaultHours: Number(row.default_duration_hours), isMandatory: Boolean(row.is_mandatory) }))
  const people: LearningPerson[] = (peopleResult.results ?? []).map((row) => ({ employeeId: row.employee_id, displayName: row.display_name, department: row.department, jobTitle: row.job_title, location: row.location }))
  const completed = assignments.filter((row) => row.status.toLowerCase() === "completed").length
  const overdue = assignments.filter((row) => row.status.toLowerCase() !== "completed" && Boolean(row.dueDate && row.dueDate < today)).length
  const mandatoryGaps = assignments.filter((row) => row.isMandatory && row.status.toLowerCase() !== "completed").length
  const departmentMap = new Map<string, { assigned: number; completed: number; overdue: number }>()
  for (const row of assignments) {
    const current = departmentMap.get(row.department) ?? { assigned: 0, completed: 0, overdue: 0 }
    current.assigned += 1
    if (row.status.toLowerCase() === "completed") current.completed += 1
    if (row.status.toLowerCase() !== "completed" && row.dueDate && row.dueDate < today) current.overdue += 1
    departmentMap.set(row.department, current)
  }
  const departmentCoverage = [...departmentMap.entries()].map(([department, values]) => ({ department, ...values, completionRate: values.assigned ? Math.round(values.completed / values.assigned * 100) : 0 }))
    .sort((left, right) => left.completionRate - right.completionRate || right.assigned - left.assigned)
  return {
    generatedAt: new Date().toISOString(),
    summary: { assignments: assignments.length, completed, completionRate: assignments.length ? Number((completed / assignments.length * 100).toFixed(1)) : 0, overdue, mandatoryGaps },
    dimensions: { departments: [...new Set(people.map((row) => row.department))].sort(), locations: [...new Set(people.map((row) => row.location))].sort() },
    courses, people, assignments, departmentCoverage,
  }
}

export async function createLearningCourse(value: unknown, actor: RequestActor): Promise<{ id: string; message: string }> {
  if (!["admin", "hr"].includes(actor.role)) throw new PeopleError("Only HR can maintain the course catalog.", 403)
  const input = courseSchema.parse(value)
  const db = await database()
  const id = courseId(input.title)
  const duplicate = await db.prepare("SELECT id FROM learning_courses WHERE LOWER(title)=LOWER(?) OR (? IS NOT NULL AND LOWER(code)=LOWER(?))")
    .bind(input.title, input.code ?? null, input.code ?? null).first<{ id: string }>()
  if (duplicate) throw new PeopleError("A course with that title or code already exists.", 409)
  await db.prepare("INSERT INTO learning_courses(id, code, title, default_duration_hours, is_mandatory, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
    .bind(id, input.code ?? null, input.title, input.defaultHours, input.isMandatory ? 1 : 0).run()
  return { id, message: `${input.title} was added to the course catalog.` }
}

export async function assignLearningCourse(value: unknown, actor: RequestActor): Promise<{ id: string; message: string }> {
  assertLearningEditor(actor)
  const input = assignmentSchema.parse(value)
  const db = await database()
  const [course, employee, managerId] = await Promise.all([
    db.prepare("SELECT id, title, default_duration_hours, is_mandatory FROM learning_courses WHERE id=? AND LOWER(status)='active'").bind(input.courseId).first<{ id: string; title: string; default_duration_hours: number; is_mandatory: number }>(),
    db.prepare("SELECT employee_id, work_email, department FROM employee_directory_view WHERE employee_id=? AND archived_at IS NULL AND LOWER(employment_status) IN ('active','preboarding','on leave')").bind(input.employeeId).first<{ employee_id: string; work_email: string | null; department: string }>(),
    actor.role === "manager" ? actorEmployeeId(db, actor) : Promise.resolve(null),
  ])
  if (!course) throw new PeopleError("Choose an active course from the catalog.", 404)
  if (!employee) throw new PeopleError("Choose an active employee record.", 404)
  if (actor.role === "manager") {
    const report = await db.prepare("SELECT employee_id FROM employee_directory_view WHERE employee_id=? AND manager_id=? AND archived_at IS NULL").bind(input.employeeId, managerId ?? "").first<{ employee_id: string }>()
    if (!report) throw new PeopleError("Managers can only assign courses to their direct reports.", 403)
  }
  const existing = await db.prepare("SELECT id FROM course_assignments WHERE employee_id=? AND course_id=? AND LOWER(status) <> 'completed'")
    .bind(input.employeeId, input.courseId).first<{ id: string }>()
  if (existing) throw new PeopleError("This employee already has an incomplete assignment for that course.", 409)
  const id = `TRN-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const hours = input.hours ?? Number(course.default_duration_hours)
  const ownerEmail = employee.work_email?.trim().toLowerCase() || actor.email
  const today = new Date().toISOString().slice(0, 10)
  const details = JSON.stringify({ courseId: course.id, program: course.title, dueDate: input.dueDate, hours, note: input.note, isMandatory: Boolean(course.is_mandatory) })
  await db.batch([
    db.prepare("INSERT INTO training_records(id, training_program, employee_id, completion_status, completion_date, training_hours, assessment_score, department, data_source, updated_at) VALUES (?, ?, ?, 'Incomplete', NULL, ?, NULL, ?, 'workflow', CURRENT_TIMESTAMP)")
      .bind(id, course.title, employee.employee_id, hours, employee.department),
    db.prepare("INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, priority, owner_email, due_at, next_action, source_entity_type, source_entity_id, assigned_at, confidentiality_level) VALUES (?, 'training', ?, ?, 'Assigned', ?, ?, ?, ?, ?, 'Complete the assigned course and record completion.', 'training_record', ?, CURRENT_TIMESTAMP, 'internal')")
      .bind(id, employee.employee_id, `${course.title} assignment`, details, actor.email, input.dueDate <= today ? "high" : "medium", ownerEmail, input.dueDate, id),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, 'training_assigned', ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), employee.employee_id, `${actor.displayName} assigned ${course.title}`, details, actor.email),
  ])
  return { id, message: `${course.title} was assigned.` }
}

export async function completeLearningAssignment(assignmentId: string, value: unknown, actor: RequestActor): Promise<{ id: string; message: string }> {
  const input = completionSchema.parse(value)
  const db = await database()
  const assignment = await db.prepare(`SELECT a.id, a.status, a.employee_id, c.title, e.work_email
    FROM course_assignments a JOIN learning_courses c ON c.id=a.course_id JOIN employee_directory_view e ON e.employee_id=a.employee_id WHERE a.id=?`)
    .bind(assignmentId).first<{ id: string; status: string; employee_id: string; title: string; work_email: string | null }>()
  if (!assignment) throw new PeopleError("Learning assignment not found.", 404)
  if (assignment.status.toLowerCase() === "completed") throw new PeopleError("This assignment is already complete.", 409)
  if (!["admin", "hr"].includes(actor.role) && assignment.work_email?.toLowerCase() !== actor.email.toLowerCase()) throw new PeopleError("Only the assigned employee or HR can record completion.", 403)
  const completedAt = new Date().toISOString().slice(0, 10)
  const completionNote = input.note || `${actor.displayName} recorded the course completion.`
  await db.batch([
    db.prepare("UPDATE training_records SET completion_status='Completed', completion_date=?, assessment_score=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(completedAt, input.assessmentScore ?? null, assignmentId),
    db.prepare("UPDATE workflow_requests SET status='Completed', next_action='No further action.', due_at=NULL, resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND type='training'")
      .bind(actor.email, completionNote, assignmentId),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, 'training_completed', ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), assignment.employee_id, `${actor.displayName} recorded completion of ${assignment.title}`, JSON.stringify({ assignmentId, assessmentScore: input.assessmentScore ?? null, note: input.note }), actor.email),
  ])
  return { id: assignmentId, message: `${assignment.title} was marked complete.` }
}
