import { createHash } from "node:crypto"

import type { InboxItem } from "@/lib/people-types"
import type { Database } from "@/lib/server/hr-repository"

export const workPriorityPolicy = {
  id: "work-priority-v1",
  version: "1.0.0",
  levels: ["P1", "P2", "P3", "P4"] as const,
  intendedUse: "Order operational follow-up using recorded urgency and business-impact evidence.",
  controls: [
    "Requester seniority, protected characteristics, and location alone never increase priority.",
    "The score orders review; it never approves, rejects, or completes work.",
    "Every score includes the recorded factors that contributed points.",
  ],
}

export type WorkPriorityLevel = typeof workPriorityPolicy.levels[number]

export type WorkPriorityFactor = {
  code: string
  label: string
  points: number
  evidence: string
}

export type WorkPriorityAssessment = {
  policyId: string
  policyVersion: string
  level: WorkPriorityLevel
  score: number
  factors: WorkPriorityFactor[]
  inputHash: string
}

type PriorityInput = Pick<InboxItem,
  "id" | "type" | "title" | "detail" | "dueDate" | "slaStatus" | "createdAt" | "isCompleted" | "requiresDecision" | "timeInStatusDays" | "requestContext"
>

function factor(code: string, label: string, points: number, evidence: string): WorkPriorityFactor {
  return { code, label, points, evidence }
}

function contextValue(input: PriorityInput, label: RegExp): string {
  return input.requestContext.find((row) => label.test(row.label))?.value ?? ""
}

function firstNumber(value: string): number | null {
  const parsed = Number(value.replace(/[^0-9.-]+/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

export function assessWorkPriority(input: PriorityInput): WorkPriorityAssessment {
  const searchable = [input.title, input.detail, ...input.requestContext.flatMap((row) => [row.label, row.value])].join(" ").toLowerCase()
  const factors: WorkPriorityFactor[] = []

  if (input.isCompleted) {
    factors.push(factor("completed", "Completed", 0, "The work item is complete."))
  } else {
    if (input.slaStatus === "overdue") factors.push(factor("overdue", "Overdue", 30, `The recorded due date ${input.dueDate ?? "has passed"}.`))
    else if (input.slaStatus === "due_today") factors.push(factor("due_today", "Due today", 28, "The recorded response target is today."))
    else if (input.slaStatus === "due_soon") factors.push(factor("due_soon", "Due soon", 18, `The recorded due date is ${input.dueDate}.`))
    else if (input.dueDate) factors.push(factor("scheduled", "Scheduled", 4, `The recorded due date is ${input.dueDate}.`))

    if (input.timeInStatusDays >= 14) factors.push(factor("age_14", "Waiting 14+ days", 12, `${input.timeInStatusDays} days in the current status.`))
    else if (input.timeInStatusDays >= 7) factors.push(factor("age_7", "Waiting 7+ days", 8, `${input.timeInStatusDays} days in the current status.`))
    else if (input.timeInStatusDays >= 3) factors.push(factor("age_3", "Waiting 3+ days", 4, `${input.timeInStatusDays} days in the current status.`))

    if (input.requiresDecision) factors.push(factor("decision", "Decision required", 15, "The workflow cannot progress until an authorized reviewer records a decision."))

    if (/cannot work|can't work|unable to work|work blocked|blocking work|failing hardware|no laptop|access blocked/.test(searchable)) {
      factors.push(factor("work_blocked", "Work is blocked", 22, "The recorded request states that normal work is blocked."))
    }
    if (/security incident|safety|harassment|payroll|missing pay|access removal|data breach/.test(searchable)) {
      factors.push(factor("controlled_impact", "Controlled operational impact", 18, "The request references security, safety, payroll, access, or workplace conduct."))
    }
    if (input.type === "offboarding") factors.push(factor("offboarding", "Time-bound offboarding", 14, "Access and asset tasks are tied to a recorded exit date."))
    if (input.type === "onboarding") factors.push(factor("onboarding", "Start readiness", 10, "The employee profile requires verification before activation."))
    if (input.type === "hiring" && /offer/i.test(input.title)) factors.push(factor("offer", "Offer response", 10, "An offer-stage candidate requires a recorded response."))
    if (input.type === "training" && /mandatory|required|security|safety|compliance/.test(searchable)) factors.push(factor("required_learning", "Required learning", 8, "The assignment is recorded as required, security, safety, or compliance learning."))

    const amount = firstNumber(contextValue(input, /amount/i))
    if (input.type === "reimbursement" && amount !== null && amount >= 5_000) factors.push(factor("expense_5000", "High-value claim", 8, `The recorded claim amount is ${contextValue(input, /amount/i)}.`))
    else if (input.type === "reimbursement" && amount !== null && amount >= 1_000) factors.push(factor("expense_1000", "Material claim", 4, `The recorded claim amount is ${contextValue(input, /amount/i)}.`))

    const affectedMatch = searchable.match(/(\d{1,5})\s+(?:employees|people|users|workers)/)
    const affected = affectedMatch ? Number(affectedMatch[1]) : 0
    if (affected >= 50) factors.push(factor("affected_50", "50+ people affected", 12, `${affected} people are recorded as affected.`))
    else if (affected >= 10) factors.push(factor("affected_10", "10+ people affected", 8, `${affected} people are recorded as affected.`))
    else if (affected >= 2) factors.push(factor("affected_2", "Multiple people affected", 4, `${affected} people are recorded as affected.`))

    if (/remote/.test(searchable) && /laptop|equipment|hardware|access/.test(searchable) && factors.some((row) => row.code === "work_blocked")) {
      factors.push(factor("remote_fulfilment", "Remote fulfilment dependency", 5, "A time-sensitive work-blocking request requires remote fulfilment."))
    }
  }

  const score = Math.min(100, factors.reduce((sum, row) => sum + row.points, 0))
  const level: WorkPriorityLevel = input.isCompleted ? "P4" : score >= 70 ? "P1" : score >= 45 ? "P2" : score >= 20 ? "P3" : "P4"
  const canonical = JSON.stringify({
    id: input.id,
    type: input.type,
    title: input.title,
    detail: input.detail,
    dueDate: input.dueDate,
    slaStatus: input.slaStatus,
    createdAt: input.createdAt,
    isCompleted: input.isCompleted,
    requiresDecision: input.requiresDecision,
    timeInStatusDays: input.timeInStatusDays,
    requestContext: input.requestContext,
  })
  return {
    policyId: workPriorityPolicy.id,
    policyVersion: workPriorityPolicy.version,
    level,
    score,
    factors: factors.sort((left, right) => right.points - left.points),
    inputHash: createHash("sha256").update(canonical).digest("hex"),
  }
}

export async function persistWorkPriorityAssessments(database: Database, rows: Array<{ workflowId: string; assessment: WorkPriorityAssessment }>): Promise<void> {
  if (!rows.length) return
  await database.prepare(`
    INSERT INTO workflow_priority_assessments(workflow_request_id, policy_id, policy_version, priority_level, score, factors_json, input_hash, evaluated_at)
    SELECT workflow_id, policy_id, policy_version, priority_level, score, factors_json, input_hash, CURRENT_TIMESTAMP
    FROM jsonb_to_recordset(?::jsonb) AS x(
      workflow_id TEXT, policy_id TEXT, policy_version TEXT, priority_level TEXT,
      score INTEGER, factors_json JSONB, input_hash TEXT
    )
    ON CONFLICT(workflow_request_id) DO UPDATE SET
      policy_id=EXCLUDED.policy_id,
      policy_version=EXCLUDED.policy_version,
      priority_level=EXCLUDED.priority_level,
      score=EXCLUDED.score,
      factors_json=EXCLUDED.factors_json,
      input_hash=EXCLUDED.input_hash,
      evaluated_at=CURRENT_TIMESTAMP
    WHERE workflow_priority_assessments.input_hash<>EXCLUDED.input_hash
  `).bind(JSON.stringify(rows.map(({ workflowId, assessment }) => ({
    workflow_id: workflowId,
    policy_id: assessment.policyId,
    policy_version: assessment.policyVersion,
    priority_level: assessment.level,
    score: assessment.score,
    factors_json: assessment.factors,
    input_hash: assessment.inputHash,
  })))).run()
}
