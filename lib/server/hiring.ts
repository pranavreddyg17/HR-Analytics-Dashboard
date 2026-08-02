import { z } from "zod"

import { hiringCandidateStages, type HiringCandidate, type HiringCandidateStage, type HiringOperations, type HiringRequisition } from "@/lib/hiring-types"
import { ensureHrDatabase, type Database } from "@/lib/server/hr-database"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const createCandidateSchema = z.object({
  requisitionId: z.string().trim().min(3).max(100),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(240).transform((value) => value.toLowerCase()),
  source: z.string().trim().min(2).max(100),
  ownerEmail: z.string().trim().email().max(240).optional(),
  notes: z.string().trim().max(1200).optional().default(""),
})
const updateCandidateSchema = z.object({
  stage: z.enum(hiringCandidateStages),
  nextStep: z.string().trim().max(240).optional(),
  nextStepDueAt: date.nullable().optional(),
  notes: z.string().trim().max(1200).optional(),
  rejectedReason: z.string().trim().max(600).optional(),
}).superRefine((value, context) => {
  if (value.stage === "Rejected" && !value.rejectedReason) context.addIssue({ code: "custom", message: "Record a rejection reason." })
})

type RequisitionRow = {
  id: string
  position: string
  department: string
  location: string
  recruitment_status: string
  application_date: string
  hiring_source: string
  details_json: string | null
  owner_email: string | null
  owner_name: string | null
  requested_by_email: string | null
  due_at: string | null
  next_action: string | null
  completed_at: string | null
  candidate_count: number
  active_candidate_count: number
  interview_count: number
  offer_count: number
}

type CandidateRow = {
  id: string
  requisition_id: string
  position: string
  department: string
  location: string
  full_name: string
  email: string
  stage: HiringCandidateStage
  source: string
  applied_at: string
  owner_email: string
  owner_name: string | null
  next_step: string
  next_step_due_at: string | null
  notes: string | null
  rejected_reason: string | null
  created_at: string
  updated_at: string
  requested_by_email?: string | null
  requisition_owner_email?: string | null
  recruitment_status?: string
}

async function database(): Promise<Database> {
  const db = await ensureHrDatabase()
  if (!db) throw new PeopleError("Hiring storage is unavailable.", 503)
  return db
}

function jsonValue(value: string | null, field: string, fallback: string): string {
  try {
    const parsed = JSON.parse(value ?? "{}") as Record<string, unknown>
    const result = String(parsed[field] ?? "").trim()
    return result || fallback
  } catch {
    return fallback
  }
}

function daysBetween(start: string, end = new Date().toISOString().slice(0, 10)): number {
  const startTime = new Date(`${start}T00:00:00Z`).getTime()
  const endTime = new Date(`${end}T00:00:00Z`).getTime()
  return Number.isFinite(startTime) && Number.isFinite(endTime) ? Math.max(0, Math.floor((endTime - startTime) / 86_400_000)) : 0
}

function dateAfterToday(days: number): string {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function nextStepFor(stage: HiringCandidateStage): { action: string; due: string | null } {
  if (stage === "Applied") return { action: "Review application", due: dateAfterToday(2) }
  if (stage === "Screening") return { action: "Complete recruiter screen", due: dateAfterToday(3) }
  if (stage === "Interview") return { action: "Schedule or record interview outcome", due: dateAfterToday(4) }
  if (stage === "Offer") return { action: "Record offer response", due: dateAfterToday(5) }
  if (stage === "Hired") return { action: "Complete onboarding handoff", due: dateAfterToday(3) }
  return { action: "No further action", due: null }
}

function assertHiringEditor(actor: RequestActor): void {
  if (!["admin", "hr", "manager"].includes(actor.role)) throw new PeopleError("Your role cannot update hiring records.", 403)
}

function assertManagerScope(actor: RequestActor, requestedBy: string | null | undefined, owner: string | null | undefined): void {
  if (actor.role !== "manager") return
  const email = actor.email.toLowerCase()
  if (requestedBy?.toLowerCase() !== email && owner?.toLowerCase() !== email) throw new PeopleError("Managers can only update requisitions they requested or own.", 403)
}

export async function listHiringOperations(actor: RequestActor): Promise<HiringOperations> {
  const db = await database()
  const [requisitionResult, candidateResult, recentHireResult] = await Promise.all([
    db.prepare(`SELECT h.id, h.position, h.department, h.location, h.recruitment_status, h.application_date, h.hiring_source,
      w.details_json, w.owner_email, w.requested_by_email, w.due_at, w.next_action, w.completed_at,
      COALESCE(NULLIF(au.display_name, ''), w.owner_email, 'Talent Acquisition') AS owner_name,
      COUNT(c.id) AS candidate_count,
      SUM(CASE WHEN c.stage NOT IN ('Hired', 'Rejected') THEN 1 ELSE 0 END) AS active_candidate_count,
      SUM(CASE WHEN c.stage='Interview' THEN 1 ELSE 0 END) AS interview_count,
      SUM(CASE WHEN c.stage='Offer' THEN 1 ELSE 0 END) AS offer_count
      FROM hiring_records h
      LEFT JOIN workflow_requests w ON w.id=h.id AND w.type='hiring'
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(w.owner_email)
      LEFT JOIN hiring_candidates c ON c.requisition_id=h.id
      WHERE LOWER(h.data_source) <> 'demo'
      GROUP BY h.id, h.position, h.department, h.location, h.recruitment_status, h.application_date, h.hiring_source,
        w.details_json, w.owner_email, w.requested_by_email, w.due_at, w.next_action, w.completed_at, au.display_name
      ORDER BY CASE LOWER(h.recruitment_status) WHEN 'requested' THEN 0 WHEN 'offer' THEN 1 WHEN 'open' THEN 2 WHEN 'hired' THEN 3 ELSE 4 END,
        COALESCE(w.due_at, h.application_date), h.position`).all<RequisitionRow>(),
    db.prepare(`SELECT c.*, h.position, h.department, h.location, h.recruitment_status,
      COALESCE(NULLIF(au.display_name, ''), c.owner_email) AS owner_name,
      w.requested_by_email, w.owner_email AS requisition_owner_email
      FROM hiring_candidates c
      JOIN hiring_records h ON h.id=c.requisition_id
      LEFT JOIN workflow_requests w ON w.id=h.id AND w.type='hiring'
      LEFT JOIN app_users au ON LOWER(au.email)=LOWER(c.owner_email)
      WHERE LOWER(h.data_source) <> 'demo'
      ORDER BY CASE c.stage WHEN 'Offer' THEN 0 WHEN 'Interview' THEN 1 WHEN 'Screening' THEN 2 WHEN 'Applied' THEN 3 WHEN 'Hired' THEN 4 ELSE 5 END,
        COALESCE(c.next_step_due_at, '9999-12-31'), c.updated_at DESC`).all<CandidateRow>(),
    db.prepare("SELECT id, position, department, location, hiring_date, time_to_hire_days, hiring_source FROM hiring_records WHERE LOWER(data_source) <> 'demo' AND LOWER(recruitment_status)='hired' AND hiring_date IS NOT NULL ORDER BY hiring_date DESC LIMIT 8")
      .all<{ id: string; position: string; department: string; location: string; hiring_date: string; time_to_hire_days: number | null; hiring_source: string }>(),
  ])
  const today = new Date().toISOString().slice(0, 10)
  const requisitionRows = requisitionResult.results ?? []
  const candidateRows = candidateResult.results ?? []
  const requisitions: HiringRequisition[] = requisitionRows.map((row) => {
    const requested = row.recruitment_status.toLowerCase() === "requested"
    const active = ["open", "offer"].includes(row.recruitment_status.toLowerCase())
    return {
      id: row.id,
      position: row.position,
      department: row.department,
      location: row.location,
      status: row.recruitment_status,
      openedAt: row.application_date,
      source: row.hiring_source,
      ownerEmail: row.owner_email,
      ownerName: row.owner_name || row.owner_email || "Talent Acquisition",
      dueDate: row.due_at?.slice(0, 10) ?? null,
      nextAction: row.next_action || (requested ? "Approve or decline the requisition." : active ? "Record the next recruiting update." : "No further action."),
      requestedByEmail: row.requested_by_email,
      employmentType: jsonValue(row.details_json, "employmentType", "Full-time"),
      justification: jsonValue(row.details_json, "justification", "No business justification was recorded."),
      ageDays: daysBetween(row.application_date),
      candidateCount: Number(row.candidate_count ?? 0),
      activeCandidateCount: Number(row.active_candidate_count ?? 0),
      interviewCount: Number(row.interview_count ?? 0),
      offerCount: Number(row.offer_count ?? 0),
      canDecide: requested && ["admin", "hr"].includes(actor.role),
      canAddCandidate: active && ["admin", "hr", "manager"].includes(actor.role),
      reviewHref: `/inbox?view=${requested ? "decisions" : row.completed_at ? "completed" : "my_work"}&type=hiring&item=${encodeURIComponent(row.id)}`,
    }
  })
  const candidates: HiringCandidate[] = candidateRows.map((row) => ({
    id: row.id,
    requisitionId: row.requisition_id,
    requisitionTitle: row.position,
    department: row.department,
    location: row.location,
    fullName: row.full_name,
    email: row.email,
    stage: row.stage,
    source: row.source,
    appliedAt: row.applied_at,
    ownerEmail: row.owner_email,
    ownerName: row.owner_name || row.owner_email,
    nextStep: row.next_step,
    nextStepDueAt: row.next_step_due_at?.slice(0, 10) ?? null,
    notes: row.notes,
    rejectedReason: row.rejected_reason,
    isOverdue: !["Hired", "Rejected"].includes(row.stage) && Boolean(row.next_step_due_at && row.next_step_due_at.slice(0, 10) < today),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  const activeCandidates = candidates.filter((candidate) => !["Hired", "Rejected"].includes(candidate.stage))
  const activeRequisitions = requisitions.filter((requisition) => ["Requested", "Open", "Offer"].includes(requisition.status))
  const recentHires = (recentHireResult.results ?? []).map((row) => ({ id: row.id, position: row.position, department: row.department, location: row.location, hiringDate: row.hiring_date, timeToHireDays: row.time_to_hire_days, source: row.hiring_source }))
  const fillDurations = recentHires.map((row) => row.timeToHireDays).filter((value): value is number => value !== null)
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      approvalsRequired: requisitions.filter((requisition) => requisition.status === "Requested").length,
      activeRequisitions: activeRequisitions.length,
      activeCandidates: activeCandidates.length,
      interviews: candidates.filter((candidate) => candidate.stage === "Interview").length,
      offers: candidates.filter((candidate) => candidate.stage === "Offer").length,
      overdueFollowUps: activeCandidates.filter((candidate) => candidate.isOverdue).length + activeRequisitions.filter((requisition) => Boolean(requisition.dueDate && requisition.dueDate < today)).length,
      averageTimeToFill: fillDurations.length ? Number((fillDurations.reduce((sum, value) => sum + value, 0) / fillDurations.length).toFixed(1)) : 0,
    },
    stageCounts: hiringCandidateStages.map((stage) => ({ stage, count: candidates.filter((candidate) => candidate.stage === stage).length })),
    requisitions,
    candidates,
    recentHires,
  }
}

export async function createHiringCandidate(value: unknown, actor: RequestActor): Promise<{ id: string; message: string }> {
  assertHiringEditor(actor)
  const input = createCandidateSchema.parse(value)
  const db = await database()
  const requisition = await db.prepare("SELECT h.recruitment_status, w.requested_by_email, w.owner_email FROM hiring_records h LEFT JOIN workflow_requests w ON w.id=h.id AND w.type='hiring' WHERE h.id=? AND LOWER(h.data_source) <> 'demo'")
    .bind(input.requisitionId).first<{ recruitment_status: string; requested_by_email: string | null; owner_email: string | null }>()
  if (!requisition) throw new PeopleError("Requisition not found.", 404)
  if (!["open", "offer"].includes(requisition.recruitment_status.toLowerCase())) throw new PeopleError("Candidates can only be added to approved, active requisitions.", 409)
  assertManagerScope(actor, requisition.requested_by_email, requisition.owner_email)
  const id = `CAN-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const next = nextStepFor("Applied")
  try {
    await db.prepare("INSERT INTO hiring_candidates(id, requisition_id, full_name, email, stage, source, applied_at, owner_email, next_step, next_step_due_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'Applied', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
      .bind(id, input.requisitionId, input.fullName, input.email, input.source, new Date().toISOString().slice(0, 10), input.ownerEmail?.toLowerCase() || actor.email, next.action, next.due, input.notes || null).run()
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) throw new PeopleError("This candidate is already attached to the requisition.", 409)
    throw error
  }
  await db.prepare("UPDATE workflow_requests SET next_action='Review the candidate pipeline and record the next recruiting step.', assigned_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND type='hiring'")
    .bind(input.requisitionId).run()
  return { id, message: `${input.fullName} was added to the candidate pipeline.` }
}

export async function updateHiringCandidate(candidateId: string, value: unknown, actor: RequestActor): Promise<{ id: string; stage: HiringCandidateStage; message: string }> {
  assertHiringEditor(actor)
  const input = updateCandidateSchema.parse(value)
  const db = await database()
  const candidate = await db.prepare(`SELECT c.*, h.recruitment_status, w.requested_by_email, w.owner_email AS requisition_owner_email
    FROM hiring_candidates c JOIN hiring_records h ON h.id=c.requisition_id
    LEFT JOIN workflow_requests w ON w.id=h.id AND w.type='hiring' WHERE c.id=?`)
    .bind(candidateId).first<CandidateRow>()
  if (!candidate) throw new PeopleError("Candidate not found.", 404)
  if (["closed", "rejected", "hired"].includes(String(candidate.recruitment_status).toLowerCase()) && input.stage !== "Hired") throw new PeopleError("This requisition is no longer active.", 409)
  assertManagerScope(actor, candidate.requested_by_email, candidate.requisition_owner_email)
  const defaults = nextStepFor(input.stage)
  const nextStep = input.nextStep || defaults.action
  const nextDue = input.nextStepDueAt === undefined ? defaults.due : input.nextStepDueAt
  await db.prepare("UPDATE hiring_candidates SET stage=?, next_step=?, next_step_due_at=?, notes=COALESCE(?, notes), rejected_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(input.stage, nextStep, nextDue, input.notes || null, input.stage === "Rejected" ? input.rejectedReason : null, candidateId).run()

  if (input.stage === "Hired") {
    const today = new Date().toISOString().slice(0, 10)
    await db.batch([
      db.prepare("UPDATE hiring_records SET recruitment_status='Hired', hiring_date=?, time_to_hire_days=CAST(julianday(?) - julianday(application_date) AS INTEGER), updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(today, today, candidate.requisition_id),
      db.prepare("UPDATE workflow_requests SET status='Hired', next_action='Complete onboarding handoff.', due_at=date('now', '+3 days'), resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP, completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND type='hiring'")
        .bind(actor.email, `${actor.displayName} recorded ${candidate.full_name} as hired.`, candidate.requisition_id),
      db.prepare("UPDATE hiring_candidates SET stage='Rejected', next_step='No further action', next_step_due_at=NULL, rejected_reason='Position filled', updated_at=CURRENT_TIMESTAMP WHERE requisition_id=? AND id<>? AND stage NOT IN ('Hired','Rejected')")
        .bind(candidate.requisition_id, candidateId),
    ])
  } else {
    const offerCount = await db.prepare("SELECT COUNT(*) AS count FROM hiring_candidates WHERE requisition_id=? AND stage='Offer'").bind(candidate.requisition_id).first<{ count: number }>()
    const nextStatus = Number(offerCount?.count ?? 0) > 0 ? "Offer" : "Open"
    const workflowNext = nextStatus === "Offer" ? "Record the offer response and proposed start date." : "Review the candidate pipeline and record the next recruiting step."
    await db.batch([
      db.prepare("UPDATE hiring_records SET recruitment_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND LOWER(recruitment_status) NOT IN ('requested','closed','rejected','hired')").bind(nextStatus, candidate.requisition_id),
      db.prepare("UPDATE workflow_requests SET status=?, next_action=?, due_at=date('now', ?), assigned_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND type='hiring' AND LOWER(status) NOT IN ('requested','closed','rejected','hired')")
        .bind(nextStatus, workflowNext, nextStatus === "Offer" ? "+5 days" : "+7 days", candidate.requisition_id),
    ])
  }
  return { id: candidateId, stage: input.stage, message: `${candidate.full_name} moved to ${input.stage}.` }
}
