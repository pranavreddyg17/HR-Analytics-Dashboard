import type { HiringRecord, TrainingRecord, WorkforceAnalytics } from "@/lib/hr-types"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { ensureHrDatabase, readDomainRows } from "@/lib/server/hr-database"
import type { RequestActor } from "@/lib/server/request-user"
import { getDashboard, getModelMetadata } from "@/lib/server/runtime"

const minimumRetentionCohortSize = 20

type ReviewStatus = "none" | "pending" | "in_progress" | "completed"

type RetentionWorkflow = {
  id: string
  department: string
  status: string
  ownerEmail: string | null
  dueAt: string | null
  createdAt: string
  completedAt: string | null
}

export type RetentionCohort = {
  department: string
  population: number
  averageRisk: number
  aboveThreshold: number
  aboveThresholdShare: number
  recordedExits: number
  recordedAttritionRate: number
  leadingExitReason: string
  dominantSignal: string
  triggerReasons: string[]
  replacementStatus: "Gap" | "Watch" | "Covered"
  openRequisitions: number
  priorityScore: number
  priority: "Priority" | "Watch" | "Stable"
  reviewId: string | null
  reviewStatus: ReviewStatus
}

export type ContinuitySignal = {
  department: string
  exposedEmployees: number
  leadingRole: string
  leadingRoleCount: number
  incompleteDevelopment: number
  openRequisitions: number
  replacementStatus: "Gap" | "Watch" | "Covered"
  action: string
}

export type RetentionPriority = {
  cohort: string
  evidence: string
  impact: string
  action: string
  owner: string
  measure: string
  reviewId: string | null
  reviewStatus: ReviewStatus
  dueAt: string | null
}

export type RetentionIntelligence = {
  apiVersion: "1.0"
  generatedAt: string
  minimumCohortSize: number
  reviewThreshold: number
  cohortAlerts: RetentionCohort[]
  continuity: ContinuitySignal[]
  priorities: RetentionPriority[]
  impact360: Array<{
    perspective: "Organization" | "Employee" | "Manager" | "Client / delivery" | "HR"
    value: string
    finding: string
    response: string
  }>
  operatingCycle: Array<{
    stage: "Detect" | "Validate" | "Act" | "Follow up" | "Learn"
    status: "Attention" | "In progress" | "Clear"
    count: number
    finding: string
    nextAction: string
  }>
  governance: {
    eligibleCohorts: number
    suppressedCohorts: number
    modelVersion: string
    modelName: string
    limitation: string
  }
}

function percent(numerator: number, denominator: number): number {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 0
}

function average(values: number[]): number {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : 0
}

function normalizedDriver(value: string): string {
  if (/job satisfaction/i.test(value)) return "Job satisfaction"
  if (/environment/i.test(value)) return "Team environment"
  if (/work[- ]?life/i.test(value)) return "Work-life balance"
  if (/commute|distance/i.test(value)) return "Commute flexibility"
  if (/income|compensation/i.test(value)) return "Compensation position"
  if (/tenure|years at company|promotion/i.test(value)) return "Career progression"
  if (/prior compan|companies worked/i.test(value)) return "Career expectations"
  if (/department/i.test(value)) return "Department pattern"
  return "Model input pattern"
}

function mode<T extends string>(values: T[], fallback: T): T {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback
}

function reviewState(status: string | undefined): ReviewStatus {
  const value = status?.toLowerCase() ?? ""
  if (["completed", "closed", "resolved"].includes(value)) return "completed"
  if (["approved", "assigned", "in progress", "in_progress"].includes(value)) return "in_progress"
  if (value) return "pending"
  return "none"
}

function actionFor(cohort: RetentionCohort, leadingRole: string): Pick<RetentionPriority, "action" | "owner" | "measure"> {
  if (cohort.triggerReasons.includes("Attrition above company rate") && /compensation/i.test(cohort.leadingExitReason)) return {
    action: `Check compensation evidence for ${leadingRole} by level and location.`,
    owner: "HR business partner and compensation",
    measure: "Coverage of the review, confirmed gaps, and 60-day action completion",
  }
  if (cohort.replacementStatus === "Gap") return {
    action: `Confirm succession and hiring coverage for ${leadingRole}.`,
    owner: "Workforce planning and the department leader",
    measure: "Named backup, knowledge-transfer plan, and requisition coverage",
  }
  if (/career|growth|progression|promotion/i.test(`${cohort.leadingExitReason} ${cohort.dominantSignal}`)) return {
    action: `Review mobility and career plans for ${leadingRole}.`,
    owner: "People manager and talent development",
    measure: "Career reviews completed and agreed mobility actions progressed within 90 days",
  }
  if (/work-life|commute|workload/i.test(`${cohort.leadingExitReason} ${cohort.dominantSignal}`)) return {
    action: `Review workload and staffing coverage for ${leadingRole}.`,
    owner: "People manager and workforce planning",
    measure: "Owned workload actions and 30/60-day employee feedback",
  }
  return {
    action: `Validate the recorded pattern for ${leadingRole} before selecting an intervention.`,
    owner: "HR business partner and people manager",
    measure: "Validation coverage, actions with owners, and 30/60-day follow-up",
  }
}

async function retentionWorkflows(): Promise<RetentionWorkflow[]> {
  const database = await ensureHrDatabase()
  if (!database) return []
  const result = await database.prepare(`
    SELECT id, source_entity_id AS department, status, owner_email, due_at, created_at, completed_at
    FROM workflow_requests
    WHERE type='retention'
    ORDER BY created_at DESC, id DESC
  `).all<Record<string, string | null>>()
  return (result.results ?? []).map((row) => ({
    id: String(row.id),
    department: String(row.department ?? ""),
    status: String(row.status ?? "Pending"),
    ownerEmail: row.owner_email,
    dueAt: row.due_at,
    createdAt: String(row.created_at),
    completedAt: row.completed_at,
  }))
}

function latestReviewByDepartment(workflows: RetentionWorkflow[]): Map<string, RetentionWorkflow> {
  const result = new Map<string, RetentionWorkflow>()
  for (const workflow of workflows) if (!result.has(workflow.department)) result.set(workflow.department, workflow)
  return result
}

export async function getRetentionIntelligence(existing?: WorkforceAnalytics): Promise<RetentionIntelligence> {
  const workforce = existing ?? await getWorkforceAnalytics()
  const dashboard = getDashboard()
  const metadata = getModelMetadata()
  const reviewThreshold = Number((dashboard.threshold * 100).toFixed(1))
  const [trainingRows, hiringRows, workflows] = await Promise.all([
    readDomainRows("training") as Promise<TrainingRecord[]>,
    readDomainRows("hiring") as Promise<HiringRecord[]>,
    retentionWorkflows(),
  ])
  const reviews = latestReviewByDepartment(workflows)
  const activeRecords = workforce.attrition.employeeRecords.filter((record) => !/terminated/i.test(record.employmentStatus))
  const departments = [...new Set(activeRecords.map((record) => record.department))]
  const replacementByDepartment = new Map(workforce.operatingSignals.replacementCoverage.map((row) => [row.department, row]))
  const exitsByDepartment = new Map(workforce.attrition.byDepartment.map((row) => [row.label, row.value]))
  const activeByDepartment = new Map(workforce.employeeAnalytics.activeByDepartment.map((row) => [row.label, row.value]))
  const openHiring = hiringRows.filter((row) => ["requested", "open", "offer"].includes(row.recruitment_status.toLowerCase()))
  const overallHighRiskShare = percent(activeRecords.filter((record) => record.riskScore >= reviewThreshold).length, activeRecords.length)

  const allCohorts = departments.map((department): RetentionCohort => {
    const records = activeRecords.filter((record) => record.department === department)
    const aboveThreshold = records.filter((record) => record.riskScore >= reviewThreshold).length
    const recordedExits = exitsByDepartment.get(department) ?? 0
    const activeHeadcount = activeByDepartment.get(department) ?? records.length
    const replacement = replacementByDepartment.get(department)
    const aboveThresholdShare = percent(aboveThreshold, records.length)
    const recordedAttritionRate = percent(recordedExits, activeHeadcount + recordedExits)
    const leadingExitReason = mode(
      workforce.attrition.rows.filter((row) => row.department === department).map((row) => row.exit_reason),
      "No recorded reason",
    )
    const dominantSignal = mode(
      records.filter((record) => record.riskScore >= reviewThreshold).map((record) => normalizedDriver(record.topDriver)),
      "Model input pattern",
    )
    const triggerReasons: string[] = []
    let priorityScore = 0
    if (replacement?.status === "Gap") { priorityScore += 2; triggerReasons.push("Replacement coverage gap") }
    else if (replacement?.status === "Watch") { priorityScore += 1; triggerReasons.push("Replacement coverage watch") }
    if (recordedAttritionRate >= workforce.attrition.rate + 3) { priorityScore += 2; triggerReasons.push("Attrition above company rate") }
    else if (recordedAttritionRate > workforce.attrition.rate) { priorityScore += 1; triggerReasons.push("Attrition above company rate") }
    if (aboveThresholdShare >= overallHighRiskShare + 5) { priorityScore += 2; triggerReasons.push("Model-review concentration above company rate") }
    else if (aboveThresholdShare > overallHighRiskShare) { priorityScore += 1; triggerReasons.push("Model-review concentration above company rate") }
    const review = reviews.get(department)
    return {
      department,
      population: records.length,
      averageRisk: average(records.map((record) => record.riskScore)),
      aboveThreshold,
      aboveThresholdShare,
      recordedExits,
      recordedAttritionRate,
      leadingExitReason,
      dominantSignal,
      triggerReasons,
      replacementStatus: replacement?.status ?? "Covered",
      openRequisitions: replacement?.openRequisitions ?? openHiring.filter((row) => row.department === department).length,
      priorityScore,
      priority: priorityScore >= 4 ? "Priority" : priorityScore >= 2 ? "Watch" : "Stable",
      reviewId: review?.id ?? null,
      reviewStatus: reviewState(review?.status),
    }
  })

  const cohortAlerts = allCohorts
    .filter((cohort) => cohort.population >= minimumRetentionCohortSize)
    .sort((left, right) => right.priorityScore - left.priorityScore || right.recordedAttritionRate - left.recordedAttritionRate)

  const highRiskIdsByDepartment = new Map<string, Set<string>>()
  for (const record of activeRecords.filter((item) => item.riskScore >= reviewThreshold)) {
    const ids = highRiskIdsByDepartment.get(record.department) ?? new Set<string>()
    ids.add(record.employeeId)
    highRiskIdsByDepartment.set(record.department, ids)
  }

  const continuity = cohortAlerts.map((cohort): ContinuitySignal => {
    const exposedIds = highRiskIdsByDepartment.get(cohort.department) ?? new Set<string>()
    const roleCounts = new Map<string, number>()
    for (const record of activeRecords.filter((item) => item.department === cohort.department && exposedIds.has(item.employeeId))) {
      roleCounts.set(record.jobTitle, (roleCounts.get(record.jobTitle) ?? 0) + 1)
    }
    const [leadingRole = "No concentrated role", leadingRoleCount = 0] = [...roleCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? []
    const incompleteDevelopment = trainingRows.filter((row) => exposedIds.has(row.employee_id) && row.completion_status.toLowerCase() !== "completed").length
    const action = cohort.replacementStatus === "Gap"
      ? `Confirm a named backup and knowledge-transfer plan for ${leadingRole}; reconcile the gap with ${cohort.openRequisitions} open requisitions.`
      : incompleteDevelopment > 0
        ? `Review whether ${incompleteDevelopment} open development commitments remain relevant and accessible; do not assign training from a risk score.`
        : `Validate succession and role backup for ${leadingRole} during the cohort review.`
    return {
      department: cohort.department,
      exposedEmployees: exposedIds.size,
      leadingRole,
      leadingRoleCount,
      incompleteDevelopment,
      openRequisitions: cohort.openRequisitions,
      replacementStatus: cohort.replacementStatus,
      action,
    }
  })

  const priorities = cohortAlerts.filter((cohort) => cohort.priority !== "Stable").slice(0, 4).map((cohort): RetentionPriority => {
    const continuityRow = continuity.find((row) => row.department === cohort.department)
    const practice = actionFor(cohort, continuityRow?.leadingRole ?? "the exposed role")
    const review = cohort.reviewId ? workflows.find((row) => row.id === cohort.reviewId) : undefined
    return {
      cohort: cohort.department,
      evidence: `${cohort.recordedAttritionRate}% recorded attrition · ${cohort.aboveThresholdShare}% above model threshold · leading exit reason: ${cohort.leadingExitReason}`,
      impact: `${cohort.replacementStatus} coverage${continuityRow?.leadingRoleCount ? ` · ${continuityRow.leadingRoleCount} exposed in ${continuityRow.leadingRole}` : ""}`,
      ...practice,
      reviewId: cohort.reviewId,
      reviewStatus: cohort.reviewStatus,
      dueAt: review?.dueAt ?? null,
    }
  })

  const mobilityIds = new Set(workforce.promotions.mobilityReview.map((row) => row.employeeId))
  const highRiskMobility = activeRecords.filter((record) => record.riskScore >= reviewThreshold && mobilityIds.has(record.employeeId)).length
  const managerClusters = workforce.operatingSignals.managerExitConcentration.filter((row) => row.exits >= 2).length
  const continuityGaps = continuity.filter((row) => row.replacementStatus === "Gap").length
  const highRiskIds = new Set(activeRecords.filter((record) => record.riskScore >= reviewThreshold).map((record) => record.employeeId))
  const exposedWithLearning = new Set(trainingRows.filter((row) => row.completion_status.toLowerCase() !== "completed" && highRiskIds.has(row.employee_id)).map((row) => row.employee_id)).size
  const now = new Date()
  const activeWorkflow = workflows.filter((row) => !["completed", "closed", "resolved", "cancelled"].includes(row.status.toLowerCase()))
  const pendingValidation = activeWorkflow.filter((row) => reviewState(row.status) === "pending").length
  const actionInProgress = activeWorkflow.filter((row) => reviewState(row.status) === "in_progress").length
  const overdueFollowUp = activeWorkflow.filter((row) => row.dueAt && new Date(`${row.dueAt.slice(0, 10)}T23:59:59Z`) < now).length
  const learned = workflows.filter((row) => reviewState(row.status) === "completed" && row.completedAt).length
  const detectedWithoutReview = cohortAlerts.filter((row) => row.priority !== "Stable" && row.reviewStatus === "none").length

  return {
    apiVersion: "1.0",
    generatedAt: now.toISOString(),
    minimumCohortSize: minimumRetentionCohortSize,
    reviewThreshold,
    cohortAlerts,
    continuity,
    priorities,
    impact360: [
      { perspective: "Organization", value: `${continuityGaps}`, finding: "Departments with a replacement coverage gap", response: "Reconcile succession, open hiring, and the role-level knowledge-transfer plan." },
      { perspective: "Employee", value: `${highRiskMobility}`, finding: "Review profiles also awaiting a mobility review", response: "Confirm career interests and mobility preferences in a human conversation." },
      { perspective: "Manager", value: `${managerClusters}`, finding: "Manager groups with two or more recorded exits", response: "Review workload and team conditions as a cohort signal, not a manager rating." },
      { perspective: "Client / delivery", value: `${continuity.filter((row) => row.leadingRoleCount >= 5 && row.replacementStatus !== "Covered").length}`, finding: "Concentrated roles without full replacement coverage", response: "Confirm delivery backup and knowledge transfer; project-level impact requires project-assignment data." },
      { perspective: "HR", value: `${exposedWithLearning}`, finding: "Review profiles with incomplete development commitments", response: "Validate relevance and access with employees; course completion is not a retention treatment." },
    ],
    operatingCycle: [
      { stage: "Detect", status: detectedWithoutReview ? "Attention" : "Clear", count: detectedWithoutReview, finding: "Eligible priority cohorts without a review", nextAction: "Create a governed cohort review for each unowned priority." },
      { stage: "Validate", status: pendingValidation ? "In progress" : "Clear", count: pendingValidation, finding: "Reviews awaiting evidence validation", nextAction: "Confirm the signal with current records and confidential employee evidence." },
      { stage: "Act", status: actionInProgress ? "In progress" : "Clear", count: actionInProgress, finding: "Reviews with an action in progress", nextAction: "Keep one evidence-matched action, owner, due date, and success measure." },
      { stage: "Follow up", status: overdueFollowUp ? "Attention" : activeWorkflow.length ? "In progress" : "Clear", count: overdueFollowUp, finding: "Open reviews past due", nextAction: "Record completion and employee feedback; revise or close stale actions." },
      { stage: "Learn", status: learned ? "In progress" : "Clear", count: learned, finding: "Completed reviews available for aggregate evaluation", nextAction: "Compare reach and outcomes quarterly, then retire weak rules or thresholds." },
    ],
    governance: {
      eligibleCohorts: cohortAlerts.length,
      suppressedCohorts: allCohorts.length - cohortAlerts.length,
      modelVersion: metadata.model_version,
      modelName: metadata.model_name,
      limitation: "Historical model scores and observed exits are separate evidence. Neither proves cause or predicts resignation timing.",
    },
  }
}

export async function createRetentionReview(department: string, actor: RequestActor): Promise<{ id: string; status: string }> {
  if (!["admin", "hr"].includes(actor.role)) throw new Error("ROLE_REQUIRED")
  const intelligence = await getRetentionIntelligence()
  const cohort = intelligence.cohortAlerts.find((row) => row.department === department)
  if (!cohort) throw new Error("COHORT_NOT_ELIGIBLE")
  if (cohort.reviewId && cohort.reviewStatus !== "completed") return { id: cohort.reviewId, status: cohort.reviewStatus }
  const database = await ensureHrDatabase()
  if (!database) throw new Error("DATABASE_UNAVAILABLE")
  const id = `RET-${crypto.randomUUID()}`
  const dueAt = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  await database.prepare(`
    INSERT INTO workflow_requests(
      id, type, employee_id, title, status, details_json, requested_by_email,
      priority, owner_email, due_at, next_action, source_entity_type, source_entity_id,
      assigned_at, confidentiality_level, created_at, updated_at
    ) VALUES (?, 'retention', NULL, ?, 'Pending', ?, ?, ?, ?, ?, ?, 'retention_cohort', ?, CURRENT_TIMESTAMP, 'restricted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    id,
    `${department} retention review`,
    JSON.stringify({
      apiVersion: intelligence.apiVersion,
      modelVersion: intelligence.governance.modelVersion,
      population: cohort.population,
      recordedAttritionRate: cohort.recordedAttritionRate,
      aboveThresholdShare: cohort.aboveThresholdShare,
      leadingExitReason: cohort.leadingExitReason,
      triggerReasons: cohort.triggerReasons,
    }),
    actor.email,
    cohort.priority === "Priority" ? "high" : "medium",
    actor.email,
    dueAt,
    "Validate the cohort evidence and document the review scope.",
    department,
  ).run()
  return { id, status: "pending" }
}

export async function updateRetentionReview(
  reviewId: string,
  action: "start" | "complete",
  note: string,
  actor: RequestActor,
): Promise<{ id: string; status: string }> {
  if (!["admin", "hr"].includes(actor.role)) throw new Error("ROLE_REQUIRED")
  const database = await ensureHrDatabase()
  if (!database) throw new Error("DATABASE_UNAVAILABLE")
  const review = await database.prepare("SELECT id, status FROM workflow_requests WHERE id=? AND type='retention'")
    .bind(reviewId).first<{ id: string; status: string }>()
  if (!review) throw new Error("REVIEW_NOT_FOUND")
  const status = review.status.toLowerCase().replaceAll(" ", "_")

  if (action === "start") {
    if (status !== "pending") throw new Error("INVALID_REVIEW_TRANSITION")
    await database.prepare(`
      UPDATE workflow_requests
      SET status='In progress', owner_email=?, assigned_at=CURRENT_TIMESTAMP,
        details_json=json_set(CASE WHEN json_valid(details_json) THEN details_json ELSE '{}' END, '$.reviewPlan', ?),
        next_action='Complete the agreed review action and record the outcome.', updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND type='retention'
    `).bind(actor.email, note.trim(), reviewId).run()
    return { id: reviewId, status: "in_progress" }
  }

  if (status !== "in_progress") throw new Error("INVALID_REVIEW_TRANSITION")
  await database.prepare(`
    UPDATE workflow_requests
    SET status='Completed', next_action='No further action.', resolved_by_email=?, resolved_at=CURRENT_TIMESTAMP,
      completed_at=CURRENT_TIMESTAMP, completion_notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND type='retention'
  `).bind(actor.email, note.trim(), reviewId).run()
  return { id: reviewId, status: "completed" }
}
