import { z } from "zod"

import { ensureHrDatabase, type Database } from "@/lib/server/hr-database"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

const expenseSchema = z.object({
  category: z.enum(["travel", "meals", "office", "training", "wellness", "other"]),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive().max(1_000_000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD"),
  description: z.string().trim().min(5).max(1000),
  receiptDocumentId: z.string().trim().min(8).max(100).nullable().optional(),
})

const caseSchema = z.object({
  category: z.enum(["payroll", "benefits", "workplace", "equipment", "access", "policy", "other"]),
  subject: z.string().trim().min(4).max(160),
  description: z.string().trim().min(10).max(4000),
  confidentiality: z.enum(["manager", "hr", "restricted"]).default("hr"),
})

const reviewSchema = z.object({
  reviewId: z.string().trim().min(8).max(100),
  selfReview: z.string().trim().min(50).max(10_000),
  employeeRating: z.number().min(1).max(5),
})

type EmployeeIdentity = {
  employee_id: string
  display_name: string
  work_email: string | null
  department: string
  job_title: string
  location: string
  manager_id: string | null
  manager_name: string | null
  manager_email: string | null
  hire_date: string
  employment_status: string
}

async function database(): Promise<Database> {
  const value = await ensureHrDatabase()
  if (!value) throw new PeopleError("Employee services are unavailable.", 503)
  return value
}

async function identity(db: Database, actor: RequestActor): Promise<EmployeeIdentity> {
  const employee = await db.prepare(`
    SELECT e.employee_id,
      TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS display_name,
      e.work_email, e.department, e.job_title, e.location, e.manager_id, e.hire_date, e.employment_status,
      NULLIF(TRIM(COALESCE(NULLIF(m.preferred_name, ''), m.first_name, '') || ' ' || COALESCE(m.last_name, '')), '') AS manager_name,
      m.work_email AS manager_email
    FROM employee_directory_view e
    LEFT JOIN employee_directory_view m ON m.employee_id=e.manager_id
    WHERE LOWER(e.work_email)=LOWER(?) AND e.archived_at IS NULL
  `).bind(actor.email).first<EmployeeIdentity>()
  if (!employee) throw new PeopleError("Your account is not linked to an employee profile. Ask HR to set your work email on the employee record.", 409)
  return employee
}

export async function getEmployeePortal(actor: RequestActor) {
  const db = await database()
  const employee = await identity(db, actor)
  const [projects, compensation, leave, claims, cases, reviews, meetings, documents, learning] = await Promise.all([
    db.prepare(`
      SELECT p.id, p.code, p.name, p.client_name, a.role_title, a.allocation_percent, a.starts_on, a.ends_on, a.is_primary
      FROM employee_project_assignments a
      JOIN projects p ON p.id=a.project_id
      WHERE a.employee_id=? AND p.status IN ('planned','active','on_hold')
        AND (a.ends_on IS NULL OR a.ends_on>=CURRENT_DATE)
      ORDER BY a.is_primary DESC, a.starts_on DESC
    `).bind(employee.employee_id).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT annual_salary, currency, pay_frequency, effective_from
      FROM employee_compensation
      WHERE employee_id=? AND effective_to IS NULL
      ORDER BY effective_from DESC LIMIT 1
    `).bind(employee.employee_id).first<Record<string, unknown>>(),
    db.prepare(`
      SELECT id, leave_type, start_date, end_date, leave_days, approval_status
      FROM leave_requests_view WHERE employee_id=?
      ORDER BY start_date DESC LIMIT 20
    `).bind(employee.employee_id).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id, category, expense_date, amount, currency, description, status, submitted_at, decision_note
      FROM expense_claims WHERE employee_id=? ORDER BY created_at DESC LIMIT 30
    `).bind(employee.employee_id).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id, category, subject, confidentiality, status, assigned_to_email, submitted_at, resolved_at
      FROM employee_cases WHERE employee_id=? ORDER BY submitted_at DESC LIMIT 30
    `).bind(employee.employee_id).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT r.id, r.status, r.self_review, r.manager_review, r.employee_rating, r.manager_rating,
        c.name AS cycle_name, c.starts_on, c.ends_on
      FROM performance_reviews r JOIN review_cycles c ON c.id=r.cycle_id
      WHERE r.employee_id=? ORDER BY c.ends_on DESC LIMIT 10
    `).bind(employee.employee_id).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id, scheduled_at, held_at, status, employee_notes, ai_summary, next_steps_json, summary_approved_at, follow_up_sent_at
      FROM one_on_one_meetings WHERE employee_id=? ORDER BY scheduled_at DESC LIMIT 20
    `).bind(employee.employee_id).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id, document_type, file_name, content_type, size_bytes, visibility, created_at
      FROM employee_documents
      WHERE employee_id=? AND visibility IN ('employee','manager','hr')
      ORDER BY created_at DESC LIMIT 30
    `).bind(employee.employee_id).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT a.id, c.title, a.status, a.due_date, a.completed_at
      FROM course_assignments a JOIN learning_courses c ON c.id=a.course_id
      WHERE a.employee_id=? ORDER BY COALESCE(a.due_date, a.completed_at, a.assigned_at) DESC LIMIT 20
    `).bind(employee.employee_id).all<Record<string, unknown>>(),
  ])

  return {
    generatedAt: new Date().toISOString(),
    employee,
    projects: projects.results ?? [],
    compensation,
    leave: leave.results ?? [],
    claims: claims.results ?? [],
    cases: cases.results ?? [],
    reviews: reviews.results ?? [],
    meetings: meetings.results ?? [],
    documents: documents.results ?? [],
    learning: learning.results ?? [],
  }
}

export async function createExpenseClaim(value: unknown, actor: RequestActor) {
  const input = expenseSchema.parse(value)
  const today = new Date().toISOString().slice(0, 10)
  if (input.expenseDate > today) throw new PeopleError("Expense date cannot be in the future.", 422)
  const db = await database()
  const employee = await identity(db, actor)
  if (input.receiptDocumentId) {
    const receipt = await db.prepare("SELECT id FROM employee_documents WHERE id=? AND employee_id=?")
      .bind(input.receiptDocumentId, employee.employee_id).first<{ id: string }>()
    if (!receipt) throw new PeopleError("The selected receipt is not available for this employee.", 422)
  }
  const id = `EXP-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const details = JSON.stringify({ category: input.category, expenseDate: input.expenseDate, amount: input.amount, currency: input.currency })
  await db.batch([
    db.prepare(`
      INSERT INTO expense_claims(id, employee_id, category, expense_date, amount, currency, description, status, receipt_document_id, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, CURRENT_TIMESTAMP)
    `).bind(id, employee.employee_id, input.category, input.expenseDate, input.amount, input.currency, input.description, input.receiptDocumentId ?? null),
    db.prepare(`
      INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, priority, owner_email, due_at, next_action, source_entity_type, source_entity_id, assigned_at, confidentiality_level)
      VALUES (?, 'reimbursement', ?, 'Expense reimbursement', 'Submitted', ?, ?, 'medium', 'finance@laidbackhr.cloud', date('now', '+5 days'), 'Review the claim and receipt.', 'expense_claim', ?, CURRENT_TIMESTAMP, 'restricted')
    `).bind(id, employee.employee_id, details, actor.email, id),
    db.prepare("INSERT INTO employee_activity(id, employee_id, event_type, summary, changes_json, actor_email) VALUES (?, ?, 'expense_submitted', 'Expense reimbursement submitted', ?, ?)")
      .bind(crypto.randomUUID(), employee.employee_id, details, actor.email),
  ])
  return { id, status: "submitted", message: "Expense claim submitted." }
}

export async function createEmployeeCase(value: unknown, actor: RequestActor) {
  const input = caseSchema.parse(value)
  const db = await database()
  const employee = await identity(db, actor)
  const id = `CASE-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const owner = input.confidentiality === "manager" && employee.manager_email
    ? employee.manager_email
    : "people-ops@laidbackhr.cloud"
  const details = JSON.stringify({ category: input.category, confidentiality: input.confidentiality })
  await db.batch([
    db.prepare(`
      INSERT INTO employee_cases(id, employee_id, category, subject, description, confidentiality, status, assigned_to_email)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
    `).bind(id, employee.employee_id, input.category, input.subject, input.description, input.confidentiality, owner),
    db.prepare(`
      INSERT INTO workflow_requests(id, type, employee_id, title, status, details_json, requested_by_email, priority, owner_email, due_at, next_action, source_entity_type, source_entity_id, assigned_at, confidentiality_level)
      VALUES (?, 'employee_case', ?, ?, 'Open', ?, ?, 'medium', ?, date('now', '+3 days'), 'Review the employee case and record the next step.', 'employee_case', ?, CURRENT_TIMESTAMP, ?)
    `).bind(id, employee.employee_id, input.subject, details, actor.email, owner, id, input.confidentiality === "restricted" ? "restricted" : "internal"),
  ])
  return { id, status: "open", message: "Request submitted to the appropriate owner." }
}

export async function submitSelfReview(value: unknown, actor: RequestActor) {
  const input = reviewSchema.parse(value)
  const db = await database()
  const employee = await identity(db, actor)
  const review = await db.prepare("SELECT id, status FROM performance_reviews WHERE id=? AND employee_id=?")
    .bind(input.reviewId, employee.employee_id).first<{ id: string; status: string }>()
  if (!review) throw new PeopleError("Review not found.", 404)
  if (["calibration", "completed"].includes(review.status)) throw new PeopleError("This review can no longer be edited.", 409)
  await db.prepare(`
    UPDATE performance_reviews
    SET self_review=?, employee_rating=?, status='manager_review', submitted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND employee_id=?
  `).bind(input.selfReview, input.employeeRating, input.reviewId, employee.employee_id).run()
  return { id: input.reviewId, status: "manager_review", message: "Self-review submitted to your manager." }
}
