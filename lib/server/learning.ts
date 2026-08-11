import { z } from "zod"

import type { LearningAssignment, LearningCourse, LearningOperations, LearningPerson, LearningRecommendation, LearningSkill } from "@/lib/learning-types"
import { ensureHrDatabase, type Database } from "@/lib/server/hr-repository"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const assignmentSchema = z.object({
  employeeId: z.string().trim().min(2).max(80).optional(),
  targetType: z.enum(["employee", "department", "job_title", "job_level", "manager_team", "job_profile"]).default("employee"),
  targetValue: z.string().trim().max(160).optional(),
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
  skillIds: z.array(z.string().trim().min(3).max(120)).max(8).default([]),
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

type RecommendationRow = {
  skill_id: string
  skill_name: string
  category: string
  course_id: string
  course_title: string
  department: string
  job_title: string
  job_profile_id: string
  requirement_priority: number
  active_employees: number
  open_requisitions: number
  completed_evidence: number
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
    ORDER BY CASE WHEN LOWER(a.status) <> 'completed' AND a.due_date < CURRENT_DATE::text THEN 0 WHEN LOWER(a.status) <> 'completed' THEN 1 ELSE 2 END,
      COALESCE(a.due_date, '9999-12-31'), COALESCE(a.completed_at, a.assigned_at) DESC
    LIMIT 5000`).bind(...bindings).all<AssignmentRow>()

  const [courseResult, peopleResult, skillResult] = await Promise.all([
    db.prepare("SELECT id, code, title, default_duration_hours, is_mandatory FROM learning_courses WHERE LOWER(status)='active' ORDER BY is_mandatory DESC, title")
      .all<{ id: string; code: string | null; title: string; default_duration_hours: number; is_mandatory: number }>(),
    db.prepare(`SELECT e.employee_id, TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS display_name, e.department, e.job_title, e.job_level, e.location, e.job_profile_id
      FROM employee_directory_view e WHERE e.archived_at IS NULL AND LOWER(e.employment_status) IN ('active','preboarding','on leave','on bench','notice period','scheduled exit') AND ${scopeSql}
      ORDER BY display_name LIMIT 5000`).bind(...(actor.role === "manager" && employeeId ? [employeeId, employeeId] : !["admin", "hr"].includes(actor.role) && employeeId ? [employeeId] : [])).all<{ employee_id: string; display_name: string; department: string; job_title: string; job_level: string; location: string; job_profile_id: string }>(),
    db.prepare("SELECT id, name, category FROM capability_skills WHERE organization_id='org:laidbackhr' AND status='active' ORDER BY category, name")
      .all<{ id: string; name: string; category: string }>(),
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
  const people: LearningPerson[] = (peopleResult.results ?? []).map((row) => ({ employeeId: row.employee_id, displayName: row.display_name, department: row.department, jobTitle: row.job_title, jobLevel: row.job_level, location: row.location, jobProfileId: row.job_profile_id }))
  const skills: LearningSkill[] = (skillResult.results ?? []).map((row) => ({ id: row.id, name: row.name, category: row.category }))
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
  const scopedIds = people.map((person) => person.employeeId)
  let recommendations: LearningRecommendation[] = []
  if (scopedIds.length) {
    const recommendationResult = await db.prepare(`
      WITH scoped_employees AS (
        SELECT e.employee_id, e.department, e.job_title, e.job_profile_id
        FROM employee_directory_view e
        WHERE e.employee_id IN (${scopedIds.map(() => "?").join(",")})
      ), role_population AS (
        SELECT department, job_title, job_profile_id, COUNT(*)::int AS active_employees
        FROM scoped_employees GROUP BY department, job_title, job_profile_id
      ), open_roles AS (
        SELECT department, position AS job_title, COUNT(*)::int AS open_requisitions
        FROM hiring_requisitions_view
        WHERE LOWER(recruitment_status) IN ('requested','open','offer')
        GROUP BY department, position
      ), completed_evidence AS (
        SELECT se.job_profile_id, csc.skill_id, COUNT(DISTINCT ca.employee_id)::int AS completed_evidence
        FROM scoped_employees se
        JOIN course_assignments ca ON ca.employee_id=se.employee_id AND LOWER(ca.status)='completed'
        JOIN course_skill_coverage csc ON csc.course_id=ca.course_id
        GROUP BY se.job_profile_id, csc.skill_id
      ), ranked_courses AS (
        SELECT csc.skill_id, c.id AS course_id, c.title AS course_title,
          ROW_NUMBER() OVER (PARTITION BY csc.skill_id ORDER BY csc.proficiency_level DESC, c.is_mandatory DESC, c.title) AS course_rank
        FROM course_skill_coverage csc
        JOIN learning_courses c ON c.id=csc.course_id AND LOWER(c.status)='active'
      )
      SELECT s.id AS skill_id, s.name AS skill_name, s.category, rc.course_id, rc.course_title,
        rp.department, rp.job_title, rp.job_profile_id, req.priority AS requirement_priority, rp.active_employees,
        COALESCE(o.open_requisitions, 0)::int AS open_requisitions,
        COALESCE(ce.completed_evidence, 0)::int AS completed_evidence
      FROM role_population rp
      JOIN job_profile_skill_requirements req ON req.job_profile_id=rp.job_profile_id
      JOIN capability_skills s ON s.id=req.skill_id AND s.status='active'
      JOIN ranked_courses rc ON rc.skill_id=req.skill_id AND rc.course_rank=1
      LEFT JOIN open_roles o ON LOWER(o.department)=LOWER(rp.department) AND LOWER(o.job_title)=LOWER(rp.job_title)
      LEFT JOIN completed_evidence ce ON ce.job_profile_id=rp.job_profile_id AND ce.skill_id=req.skill_id
      ORDER BY (req.priority * 100 + COALESCE(o.open_requisitions, 0) * 20 + GREATEST(rp.active_employees - COALESCE(ce.completed_evidence, 0), 0)) DESC,
        rp.department, rp.job_title, s.name
      LIMIT 12
    `).bind(...scopedIds).all<RecommendationRow>()
    recommendations = (recommendationResult.results ?? []).map((row) => {
      const employeesNeedingEvidence = Math.max(0, Number(row.active_employees) - Number(row.completed_evidence))
      const priority = Number(row.requirement_priority) >= 3 || Number(row.open_requisitions) > 0 && employeesNeedingEvidence > 0
        ? "High" as const
        : employeesNeedingEvidence >= Math.max(3, Number(row.active_employees) / 2) ? "Medium" as const : "Standard" as const
      return {
        id: `${row.skill_id}:${row.department}:${row.job_title}`,
        skillId: row.skill_id,
        skillName: row.skill_name,
        category: row.category,
        courseId: row.course_id,
        courseTitle: row.course_title,
        targetType: "job_profile" as const,
        targetValue: row.job_profile_id,
        jobTitle: row.job_title,
        department: row.department,
        activeEmployees: Number(row.active_employees),
        openRequisitions: Number(row.open_requisitions),
        completedEvidence: Number(row.completed_evidence),
        employeesNeedingEvidence,
        priority,
        reason: `${employeesNeedingEvidence} of ${Number(row.active_employees)} active ${row.job_title} employees have no completed course mapped to ${row.skill_name}${Number(row.open_requisitions) ? `; ${Number(row.open_requisitions)} matching role${Number(row.open_requisitions) === 1 ? " is" : "s are"} open` : ""}.`,
      }
    }).filter((row) => row.employeesNeedingEvidence > 0)
  }
  return {
    generatedAt: new Date().toISOString(),
    summary: { assignments: assignments.length, completed, completionRate: assignments.length ? Number((completed / assignments.length * 100).toFixed(1)) : 0, overdue, mandatoryGaps },
    dimensions: {
      departments: [...new Set(people.map((row) => row.department))].sort(),
      locations: [...new Set(people.map((row) => row.location))].sort(),
      jobTitles: [...new Set(people.map((row) => row.jobTitle))].sort(),
      jobLevels: [...new Set(people.map((row) => row.jobLevel))].sort(),
    },
    courses, skills, people, assignments, departmentCoverage, recommendations,
  }
}

export async function createLearningCourse(value: unknown, actor: RequestActor): Promise<{ id: string; message: string }> {
  if (!["admin", "hr"].includes(actor.role)) throw new PeopleError("Only HR can maintain the course catalog.", 403)
  const input = courseSchema.parse(value)
  const db = await database()
  const id = courseId(input.title)
  const duplicate = await db.prepare(`SELECT id FROM learning_courses
    WHERE LOWER(title)=LOWER(?) OR LOWER(COALESCE(code, ''))=LOWER(?)`)
    .bind(input.title, input.code ?? "").first<{ id: string }>()
  if (duplicate) throw new PeopleError("A course with that title or code already exists.", 409)
  const validSkills = input.skillIds.length
    ? await db.prepare(`SELECT id FROM capability_skills WHERE organization_id='org:laidbackhr' AND status='active' AND id IN (${input.skillIds.map(() => "?").join(",")})`).bind(...input.skillIds).all<{ id: string }>()
    : { results: [] as Array<{ id: string }> }
  if ((validSkills.results ?? []).length !== new Set(input.skillIds).size) throw new PeopleError("Choose active capabilities from this workspace.", 422)
  await db.batch([
    db.prepare("INSERT INTO learning_courses(id, code, title, default_duration_hours, is_mandatory, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
      .bind(id, input.code ?? null, input.title, input.defaultHours, input.isMandatory ? 1 : 0),
    ...(validSkills.results ?? []).map((skill) => db.prepare("INSERT INTO course_skill_coverage(course_id, skill_id, proficiency_level) VALUES (?, ?, 2)").bind(id, skill.id)),
  ])
  return { id, message: `${input.title} was added to the course catalog.` }
}

export async function assignLearningCourse(value: unknown, actor: RequestActor): Promise<{ id: string; assigned: number; skipped: number; message: string }> {
  assertLearningEditor(actor)
  const input = assignmentSchema.parse(value)
  const db = await database()
  const managerId = actor.role === "manager" ? await actorEmployeeId(db, actor) : null
  const course = await db.prepare("SELECT id, title, default_duration_hours, is_mandatory FROM learning_courses WHERE id=? AND LOWER(status)='active'").bind(input.courseId).first<{ id: string; title: string; default_duration_hours: number; is_mandatory: number }>()
  if (!course) throw new PeopleError("Choose an active course from the catalog.", 404)
  if (actor.role === "manager" && !["employee", "manager_team"].includes(input.targetType)) throw new PeopleError("Managers can assign a direct report or their team.", 403)

  const targetValue = input.targetType === "employee" ? input.employeeId : input.targetValue
  if (input.targetType !== "manager_team" && !targetValue) throw new PeopleError("Choose who should receive the assignment.", 422)
  const conditions = ["e.archived_at IS NULL", "LOWER(e.employment_status) IN ('active','preboarding','on leave','on bench','notice period','scheduled exit')"]
  const bindings: unknown[] = []
  if (actor.role === "manager") { conditions.push("e.manager_id=?"); bindings.push(managerId ?? "") }
  if (input.targetType === "employee") { conditions.push("e.employee_id=?"); bindings.push(targetValue) }
  if (input.targetType === "department") { conditions.push("e.department=?"); bindings.push(targetValue) }
  if (input.targetType === "job_title") { conditions.push("e.job_title=?"); bindings.push(targetValue) }
  if (input.targetType === "job_level") { conditions.push("e.job_level=?"); bindings.push(targetValue) }
  if (input.targetType === "job_profile") { conditions.push("e.job_profile_id=?"); bindings.push(targetValue) }
  if (input.targetType === "manager_team" && actor.role !== "manager") { conditions.push("e.manager_id=?"); bindings.push(targetValue) }
  const recipientsResult = await db.prepare(`SELECT e.employee_id, e.work_email, e.department FROM employee_directory_view e WHERE ${conditions.join(" AND ")} ORDER BY e.employee_id LIMIT 500`)
    .bind(...bindings).all<{ employee_id: string; work_email: string | null; department: string }>()
  const recipients = recipientsResult.results ?? []
  if (!recipients.length) throw new PeopleError("No eligible employees match this assignment target.", 404)

  const recipientIds = recipients.map((employee) => employee.employee_id)
  const existingResult = await db.prepare(`SELECT employee_id FROM course_assignments WHERE course_id=? AND LOWER(status) <> 'completed' AND employee_id IN (${recipientIds.map(() => "?").join(",")})`)
    .bind(input.courseId, ...recipientIds).all<{ employee_id: string }>()
  const existingIds = new Set((existingResult.results ?? []).map((row) => row.employee_id))
  const eligible = recipients.filter((employee) => !existingIds.has(employee.employee_id))
  if (!eligible.length) throw new PeopleError("Every matching employee already has an incomplete assignment for this course.", 409)

  const campaignId = `LC-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const hours = input.hours ?? Number(course.default_duration_hours)
  const today = new Date().toISOString().slice(0, 10)
  await db.prepare(`INSERT INTO learning_assignment_campaigns(id, organization_id, course_id, name, target_type, target_value, target_snapshot_json, due_date, assigned_hours, instructions, created_by_email)
    VALUES (?, 'org:laidbackhr', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(campaignId, course.id, `${course.title} · ${input.targetType.replaceAll("_", " ")}`, input.targetType, targetValue ?? null, JSON.stringify(recipientIds), input.dueDate, hours, input.note, actor.email).run()

  const statements = eligible.flatMap((employee) => {
    const id = `TRN-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
    const ownerEmail = employee.work_email?.trim().toLowerCase() || actor.email
    const details = JSON.stringify({ campaignId, courseId: course.id, program: course.title, dueDate: input.dueDate, hours, note: input.note, isMandatory: Boolean(course.is_mandatory) })
    return [
      db.prepare("INSERT INTO course_assignments(id, course_id, employee_id, due_date, status, assigned_hours, data_source, campaign_id, updated_at) VALUES (?, ?, ?, ?, 'Incomplete', ?, 'workflow', ?, CURRENT_TIMESTAMP)")
        .bind(id, course.id, employee.employee_id, input.dueDate, hours, campaignId),
      db.prepare("INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, priority, owner_email, due_at, next_action, source_entity_type, source_entity_id, assigned_at, confidentiality_level) VALUES (?, 'training', ?, ?, 'Assigned', ?, ?, ?, ?, ?, 'Complete the assigned course and record completion.', 'training_record', ?, CURRENT_TIMESTAMP, 'internal')")
        .bind(id, employee.employee_id, `${course.title} assignment`, details, actor.email, input.dueDate <= today ? "high" : "medium", ownerEmail, input.dueDate, id),
      db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, 'training_assigned', ?, ?, ?, CURRENT_TIMESTAMP)")
        .bind(crypto.randomUUID(), employee.employee_id, `${actor.displayName} assigned ${course.title}`, details, actor.email),
    ]
  })
  for (let index = 0; index < statements.length; index += 120) await db.batch(statements.slice(index, index + 120))
  return { id: campaignId, assigned: eligible.length, skipped: existingIds.size, message: `${course.title} was assigned to ${eligible.length} employee${eligible.length === 1 ? "" : "s"}${existingIds.size ? `; ${existingIds.size} existing assignment${existingIds.size === 1 ? " was" : "s were"} skipped` : ""}.` }
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
    db.prepare("UPDATE course_assignments SET status='Completed', completed_at=?, assessment_score=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(completedAt, input.assessmentScore ?? null, assignmentId),
    db.prepare("UPDATE workflow_requests SET status='Completed', next_action='No further action.', due_at=NULL, resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND type='training'")
      .bind(actor.email, completionNote, assignmentId),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email, created_at) VALUES (?, ?, 'training_completed', ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(crypto.randomUUID(), assignment.employee_id, `${actor.displayName} recorded completion of ${assignment.title}`, JSON.stringify({ assignmentId, assessmentScore: input.assessmentScore ?? null, note: input.note }), actor.email),
  ])
  return { id: assignmentId, message: `${assignment.title} was marked complete.` }
}
