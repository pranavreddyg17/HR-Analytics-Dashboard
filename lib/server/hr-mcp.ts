import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { DomainStatus, HrFilters, WorkforceAnalytics } from "@/lib/hr-types"
import type { PredictionInput } from "@/lib/types"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { getRetentionIntelligence } from "@/lib/server/retention-intelligence"
import { predict } from "@/lib/server/runtime"
import { getInboxOperations } from "@/lib/server/inbox"
import { getHomeSnapshot } from "@/lib/server/home"
import type { RequestActor } from "@/lib/server/request-user"
import type { InboxItem } from "@/lib/people-types"
import { listLearningOperations } from "@/lib/server/learning"
import { listHiringOperations } from "@/lib/server/hiring"
import { listOnboardingOperations } from "@/lib/server/onboarding"

const filtersShape = {
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date in YYYY-MM-DD format"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date in YYYY-MM-DD format"),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  period: z.enum(["month", "quarter", "year"]).optional(),
}

type FilterArgs = Pick<HrFilters, "from" | "to" | "department" | "jobTitle" | "location" | "period">

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}

function dataMode(status: DomainStatus[]): "demo" | "mixed" | "imported/operational" {
  const modes = new Set(status.filter((item) => item.count > 0).map((item) => item.mode))
  if (modes.size === 1 && modes.has("demo")) return "demo"
  if (modes.size > 0 && [...modes].every((mode) => mode === "imported")) return "imported/operational"
  return "mixed"
}

function evidence(analytics: WorkforceAnalytics) {
  return {
    generatedAt: analytics.generatedAt,
    dataMode: dataMode(analytics.status),
    dataStatus: analytics.status,
    filters: analytics.filters,
  }
}

function employeeName(employee: WorkforceAnalytics["employees"][number]): string {
  return [employee.preferred_name || employee.first_name, employee.last_name].filter(Boolean).join(" ").trim() || employee.employee_id
}

function normalizedRiskDriver(value: string): string {
  if (/job satisfaction/i.test(value)) return "Job satisfaction"
  if (/environment/i.test(value)) return "Environment satisfaction"
  if (/work[- ]?life/i.test(value)) return "Work-life balance"
  if (/commute|distance/i.test(value)) return "Commute distance"
  if (/income|compensation/i.test(value)) return "Monthly income"
  if (/prior compan|companies worked/i.test(value)) return "Prior company count"
  if (/tenure|years at company/i.test(value)) return "Tenure"
  if (/education/i.test(value)) return "Education profile"
  if (/department/i.test(value)) return "Department pattern"
  return value || "Other model signal"
}

function countLabels(values: string[]): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
}

function modelExplanation(record: WorkforceAnalytics["attrition"]["employeeRecords"][number]) {
  const input: PredictionInput = {
    Department: record.department,
    DistanceFromHome: record.distanceFromHome,
    Education: record.educationLevel,
    EducationField: record.educationField,
    EnvironmentSatisfaction: record.environmentSatisfaction,
    JobSatisfaction: record.jobSatisfaction,
    MonthlyIncome: record.monthlyIncome,
    NumCompaniesWorked: record.priorCompanies,
    WorkLifeBalance: record.workLifeBalance,
    YearsAtCompany: record.yearsAtCompany,
  }
  const explanation = predict(input)
  return {
    modelVersion: record.modelVersion,
    method: "Reference-profile sensitivity from the deployed compact gradient-boosting model",
    topDrivers: explanation.topDrivers,
    recommendedReview: explanation.recommendation,
    limits: "The contributors explain the model score, not the employee's intent and not a proven cause of future attrition.",
  }
}

async function workflowSnapshot() {
  const database = await ensureHrDatabase()
  if (!database) return { openTotal: 0, byType: [], byStatus: [] }
  const rows = await database.prepare("SELECT type, status, COUNT(*) AS count FROM workflow_requests GROUP BY type, status")
    .all<{ type: string; status: string; count: number }>()
  const items = rows.results ?? []
  const closed = new Set(["approved", "rejected", "completed", "closed"])
  const open = items.filter((item) => !closed.has(item.status.toLowerCase()))
  const byType = [...new Set(open.map((item) => item.type))].map((type) => ({
    type,
    count: open.filter((item) => item.type === type).reduce((sum, item) => sum + Number(item.count), 0),
  }))
  return {
    openTotal: byType.reduce((sum, item) => sum + item.count, 0),
    byType,
    byStatus: open.map((item) => ({ type: item.type, status: item.status, count: Number(item.count) })),
  }
}

async function employeePromotionContext(employeeIds: string[]) {
  if (!employeeIds.length) return []
  const database = await ensureHrDatabase()
  if (!database) return employeeIds.map((employeeId) => ({ employeeId, promotionCount: 0, lastPromotionDate: null }))
  const placeholders = employeeIds.map(() => "?").join(", ")
  const rows = await database.prepare(`
    SELECT employee_id, COUNT(*) AS promotion_count, MAX(promotion_date) AS last_promotion_date
    FROM promotion_events_view
    WHERE employee_id IN (${placeholders})
    GROUP BY employee_id
  `).bind(...employeeIds).all<{ employee_id: string; promotion_count: number; last_promotion_date: string | null }>()
  const byEmployee = new Map((rows.results ?? []).map((row) => [row.employee_id, row]))
  return employeeIds.map((employeeId) => {
    const row = byEmployee.get(employeeId)
    return {
      employeeId,
      promotionCount: Number(row?.promotion_count ?? 0),
      lastPromotionDate: row?.last_promotion_date ?? null,
    }
  })
}

const mcpToolCatalog = [
  {
    name: "review_work_queue",
    title: "Review current work queue",
    description: "Actor-scoped decisions, overdue work, owners, next actions, and page-specific operational exceptions from persisted workflows.",
  },
  {
    name: "workforce_overview",
    title: "Workforce overview",
    description: "Current workforce KPIs, open HR work, executive observations, and source status.",
  },
  {
    name: "compare_departments",
    title: "Compare departments",
    description: "Department comparison for headcount, hiring, exits, leave, learning, or promotions.",
  },
  {
    name: "analyze_attrition_signals",
    title: "Analyze attrition signals",
    description: "Observed exits and historical model signals with responsible-use context.",
  },
  {
    name: "review_people_operations",
    title: "Review people operations",
    description: "Operational review of hiring, leave, training, or promotion records and exceptions.",
  },
  {
    name: "find_employee_records",
    title: "Find employee records",
    description: "Search the current employee directory and return limited HR profile context.",
  },
  {
    name: "review_onboarding_readiness",
    title: "Review onboarding readiness",
    description: "New-joiner verification, manager and start-date readiness, and the recruiting-to-onboarding handoff from persisted records.",
  },
  {
    name: "review_capability_plan",
    title: "Review workforce capabilities",
    description: "Role-based capability requirements, learning evidence, course mappings, and internal hiring demand for a governed cohort.",
  },
] as const

type WorkQueue = "my_work" | "decisions" | "overdue" | "managers" | "employees" | "open" | "completed"
type WorkScope = "home" | "people" | "person" | "inbox" | "hiring" | "leaves" | "courses" | "insights"

function assignedToActor(item: InboxItem, actor: RequestActor): boolean {
  return !item.isCompleted && (item.actionable || item.ownerEmail?.toLowerCase() === actor.email.toLowerCase())
}

function inQueue(item: InboxItem, queue: WorkQueue, actor: RequestActor): boolean {
  if (queue === "my_work") return assignedToActor(item, actor)
  if (queue === "decisions") return !item.isCompleted && item.requiresDecision && item.actionable
  if (queue === "overdue") return !item.isCompleted && item.slaStatus === "overdue"
  if (queue === "managers") return !item.isCompleted && item.assignedTo === "manager"
  if (queue === "employees") return !item.isCompleted && item.assignedTo === "employee"
  if (queue === "open") return !item.isCompleted
  return item.isCompleted
}

function inPageScope(item: InboxItem, scope: WorkScope): boolean {
  if (scope === "hiring") return item.type === "hiring" || item.type === "onboarding"
  if (scope === "leaves") return item.type === "leave"
  if (scope === "courses") return item.type === "training"
  if (scope === "insights") return item.type === "insight"
  if (scope === "people" || scope === "person") return ["onboarding", "case", "reimbursement"].includes(item.type)
  return true
}

export function createHrMcpServer(actor?: RequestActor): McpServer {
  const server = new McpServer(
    { name: "LaidbackHR.AI Workforce Analytics", version: "4.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  )

  server.registerTool("review_work_queue", {
    title: mcpToolCatalog[0].title,
    description: mcpToolCatalog[0].description,
    inputSchema: {
      scope: z.enum(["home", "people", "person", "inbox", "hiring", "leaves", "courses", "insights"]),
      queue: z.enum(["my_work", "decisions", "overdue", "managers", "employees", "open", "completed"]).optional(),
      domain: z.enum(["leave", "hiring", "training", "insight", "reimbursement", "case", "onboarding"]).optional(),
      itemId: z.string().trim().min(1).max(120).optional(),
      employeeId: z.string().trim().min(1).max(80).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ scope, queue, domain, itemId, employeeId, limit = 10 }: { scope: WorkScope; queue?: WorkQueue; domain?: InboxItem["type"]; itemId?: string; employeeId?: string; limit?: number }) => {
    if (!actor) throw new Error("Authenticated actor context is required for the work queue.")
    const [operations, home] = await Promise.all([
      getInboxOperations(actor),
      scope === "home" ? getHomeSnapshot(actor) : Promise.resolve(null),
    ])
    const pageItems = operations.items.filter((item) => inPageScope(item, scope))
    const selected = pageItems.filter((item) => {
      if (domain && item.type !== domain) return false
      if (itemId && item.id !== itemId) return false
      if (employeeId && item.employeeId !== employeeId) return false
      if (queue) return inQueue(item, queue, actor)
      if (scope === "home" || scope === "inbox") {
        return !item.isCompleted && (item.requiresDecision && item.actionable || item.slaStatus === "overdue" || item.priority === "high")
      }
      return !item.isCompleted
    })
    const open = pageItems.filter((item) => !item.isCompleted)
    const decisionCount = open.filter((item) => item.requiresDecision && item.actionable).length
    const overdueCount = open.filter((item) => item.slaStatus === "overdue").length
    const byDomain = Object.fromEntries([...new Set(open.map((item) => item.type))].map((type) => [type, open.filter((item) => item.type === type).length]))
    return result({
      generatedAt: operations.generatedAt,
      dataMode: "imported/operational",
      recordScope: `Actor-scoped ${scope} work queue`,
      page: { scope, queue: queue ?? "priority", domain: domain ?? "all", itemId: itemId ?? null, employeeId: employeeId ?? null },
      actorScope: { role: actor.role, email: actor.email },
      summary: {
        open: open.length,
        decisions: decisionCount,
        overdue: overdueCount,
        assignedToMe: open.filter((item) => assignedToActor(item, actor)).length,
        managerQueue: open.filter((item) => item.assignedTo === "manager").length,
        employeeQueue: open.filter((item) => item.assignedTo === "employee").length,
        completed: pageItems.filter((item) => item.isCompleted).length,
        byDomain,
      },
      home: home ? {
        activeEmployees: home.activeEmployees,
        awayToday: home.awayToday,
        activeRequisitions: home.activeRequisitions,
        offers: home.offers,
        upcoming: home.upcoming,
      } : null,
      matchCount: selected.length,
      items: selected.slice(0, limit).map((item) => ({
        id: item.id,
        domain: item.type,
        title: item.title,
        detail: item.detail,
        person: item.person,
        employeeId: item.employeeId,
        status: item.status,
        priority: item.priority,
        owner: item.owner,
        dueDate: item.dueDate,
        slaStatus: item.slaStatus,
        assignedTo: item.assignedTo,
        requiresDecision: item.requiresDecision,
        actionable: item.actionable,
        nextAction: item.nextAction,
        attentionReason: item.attentionReason,
        recordHref: item.recordHref,
        reviewHref: item.reviewHref,
      })),
    })
  })

  server.registerTool("workforce_overview", {
    title: mcpToolCatalog[1].title,
    description: mcpToolCatalog[1].description,
    inputSchema: filtersShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (filters: FilterArgs) => {
    const [analytics, workflows] = await Promise.all([getWorkforceAnalytics(filters), workflowSnapshot()])
    const activeDirectory = analytics.directoryEmployees.filter((employee) => !employee.archived_at && ["active", "on leave", "preboarding"].includes(employee.employment_status.toLowerCase()))
    return result({
      ...evidence(analytics),
      kpis: analytics.kpis,
      directoryQuality: {
        records: analytics.directoryEmployees.length,
        activeRecords: activeDirectory.length,
        missingWorkEmail: activeDirectory.filter((employee) => !employee.work_email?.trim()).length,
        missingManager: activeDirectory.filter((employee) => !employee.manager_id?.trim()).length,
        missingLocation: activeDirectory.filter((employee) => !employee.location?.trim()).length,
        missingJobTitle: activeDirectory.filter((employee) => !employee.job_title?.trim()).length,
        missingDepartment: activeDirectory.filter((employee) => !employee.department?.trim()).length,
      },
      openWork: {
        pendingLeaveRequests: analytics.leave.pending,
        activeHiringRequisitions: analytics.hiring.activeRequisitions,
        mandatoryTrainingGaps: analytics.training.requiringMandatoryTraining,
        mobilityReviews: analytics.promotions.withoutPromotionOver36Months,
      },
      workflowQueue: workflows,
      operatingSignals: analytics.operatingSignals,
      executiveObservations: analytics.executiveInsights,
    })
  })

  server.registerTool("compare_departments", {
    title: mcpToolCatalog[2].title,
    description: mcpToolCatalog[2].description,
    inputSchema: {
      metric: z.enum(["headcount", "hires", "exits", "leave_days", "training_hours", "promotions"]),
      ...filtersShape,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ metric, ...filters }: FilterArgs & { metric: "headcount" | "hires" | "exits" | "leave_days" | "training_hours" | "promotions" }) => {
    const analytics = await getWorkforceAnalytics(filters)
    const series = {
      headcount: analytics.employeeAnalytics.activeByDepartment,
      hires: analytics.hiring.byDepartment,
      exits: analytics.attrition.byDepartment,
      leave_days: analytics.leave.byDepartment,
      training_hours: analytics.training.byDepartment,
      promotions: analytics.promotions.byDepartment,
    }[metric]
    return result({
      ...evidence(analytics),
      metric,
      definition: {
        headcount: "Active employees",
        hires: "Completed hires in the selected period",
        exits: "Recorded exits in the selected period",
        leave_days: "Approved leave days",
        training_hours: "Assigned training hours",
        promotions: "Recorded promotions in the selected period",
      }[metric],
      departments: series.map((item) => ({ department: item.label, value: item.value })),
    })
  })

  server.registerTool("analyze_attrition_signals", {
    title: mcpToolCatalog[3].title,
    description: mcpToolCatalog[3].description,
    inputSchema: {
      recordScope: z.enum(["summary", "exited", "high_risk", "all"]).optional().describe("Optional joined employee record cohort to return"),
      query: z.string().trim().max(120).optional().describe("Optional employee ID, name, department, job title, or location search"),
      employeeIds: z.array(z.string().trim().min(1).max(80)).max(20).optional().describe("Exact employee IDs retained from a previous tool result"),
      includeExplanations: z.boolean().optional().describe("Calculate local model contributors for the selected records"),
      limit: z.number().int().min(1).max(20).optional(),
      ...filtersShape,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ recordScope = "summary", query = "", employeeIds = [], includeExplanations = false, limit = 10, ...filters }: FilterArgs & { recordScope?: "summary" | "exited" | "high_risk" | "all"; query?: string; employeeIds?: string[]; includeExplanations?: boolean; limit?: number }) => {
    const analytics = await getWorkforceAnalytics(filters)
    const retention = await getRetentionIntelligence(analytics)
    const activeModelRecords = analytics.attrition.employeeRecords.filter((record) => !/terminated/i.test(record.employmentStatus))
    const activeHighRiskRecords = activeModelRecords.filter((record) => record.riskLevel === "high")
    const riskDistribution = {
      high: analytics.attrition.employeeRecords.filter((record) => record.riskLevel === "high").length,
      medium: analytics.attrition.employeeRecords.filter((record) => record.riskLevel === "medium").length,
      low: analytics.attrition.employeeRecords.filter((record) => record.riskLevel === "low").length,
    }
    const riskDepartments = new Map<string, { totalRisk: number; recordCount: number; highRiskCount: number }>()
    for (const record of activeModelRecords) {
      const current = riskDepartments.get(record.department) ?? { totalRisk: 0, recordCount: 0, highRiskCount: 0 }
      current.totalRisk += record.riskScore
      current.recordCount += 1
      if (record.riskLevel === "high") current.highRiskCount += 1
      riskDepartments.set(record.department, current)
    }
    const riskByDepartment = [...riskDepartments.entries()].map(([department, values]) => ({
      department,
      averageRisk: Number((values.totalRisk / Math.max(1, values.recordCount)).toFixed(1)),
      recordCount: values.recordCount,
      highRiskCount: values.highRiskCount,
    })).sort((left, right) => right.averageRisk - left.averageRisk || right.highRiskCount - left.highRiskCount)
    const terms = query.toLowerCase().split(/[^a-z0-9-]+/).filter((term) => term.length > 1)
    const exactEmployeeIds = new Set(employeeIds.map((value) => value.toUpperCase()))
    const scopedRecords = analytics.attrition.employeeRecords.filter((record) => {
      if (recordScope === "summary") return false
      if (recordScope === "exited" && !record.exitDate) return false
      if (recordScope === "high_risk" && (record.riskLevel !== "high" || /terminated/i.test(record.employmentStatus))) return false
      if (exactEmployeeIds.size && !exactEmployeeIds.has(record.employeeId.toUpperCase())) return false
      const searchable = `${record.employeeId} ${record.name} ${record.department} ${record.jobTitle} ${record.location}`.toLowerCase()
      return terms.every((term) => searchable.includes(term))
    })
    const selectedRecords = scopedRecords.slice(0, limit)
    return result({
      ...evidence(analytics),
      observedAttrition: {
        exits: analytics.attrition.totalExits,
        rate: analytics.attrition.rate,
        voluntary: analytics.attrition.voluntary,
        involuntary: analytics.attrition.involuntary,
        byDepartment: analytics.attrition.byDepartment,
        byExitReason: analytics.attrition.byExitReason,
        byTenure: analytics.attrition.byTenure,
        trend: analytics.attrition.trend,
      },
      historicalModelReview: {
        totalScoredRecords: Object.values(riskDistribution).reduce((sum, count) => sum + count, 0),
        riskDistribution,
        recordsAboveReviewThreshold: riskDistribution.high,
        activeHighRiskCount: activeHighRiskRecords.length,
        topRiskDrivers: countLabels(activeHighRiskRecords.map((record) => normalizedRiskDriver(record.topDriver))),
        riskByDepartment,
        scope: "The IBM validation rows are joined only to clearly labelled synthetic demo employee profiles with the same stable IDs. Imported operational employees are not assigned IBM model scores.",
      },
      retentionIntelligence: {
        apiVersion: retention.apiVersion,
        generatedAt: retention.generatedAt,
        minimumCohortSize: retention.minimumCohortSize,
        reviewThreshold: retention.reviewThreshold,
        cohortAlerts: retention.cohortAlerts,
        continuity: retention.continuity,
        priorities: retention.priorities,
        impact360: retention.impact360,
        operatingCycle: retention.operatingCycle,
        governance: retention.governance,
      },
      recordScope,
      matchCount: scopedRecords.length,
      joinedEmployeeRecords: selectedRecords.map((record) => ({
        ...record,
        ...(includeExplanations ? { modelExplanation: modelExplanation(record) } : {}),
      })),
      governance: "Patterns are associations, not proven causes. Model signals require human review and must not be used as automatic employment decisions.",
    })
  })

  server.registerTool("review_people_operations", {
    title: mcpToolCatalog[4].title,
    description: mcpToolCatalog[4].description,
    inputSchema: {
      domain: z.enum(["hiring", "leave", "training", "promotions"]),
      employeeIds: z.array(z.string().trim().min(1).max(80)).max(20).optional().describe("Optional exact employee cohort for a targeted operational review"),
      ...filtersShape,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ domain, employeeIds = [], ...filters }: FilterArgs & { domain: "hiring" | "leave" | "training" | "promotions"; employeeIds?: string[] }) => {
    const [analytics, workflows] = await Promise.all([getWorkforceAnalytics(filters), workflowSnapshot()])
    const common = { ...evidence(analytics), domain, workflowQueue: workflows }

    if (domain === "hiring") {
      return result({
        ...common,
        summary: {
          completedHires: analytics.hiring.totalHired,
          activeRequisitions: analytics.hiring.activeRequisitions,
          offers: analytics.hiring.offers,
          averageTimeToHireDays: analytics.hiring.averageTimeToHire,
        },
        sourcePerformance: analytics.hiring.sourceStats,
        byDepartment: analytics.hiring.byDepartment,
        pipeline: analytics.hiring.statuses,
        trend: analytics.hiring.trend,
      })
    }

    if (domain === "leave") {
      return result({
        ...common,
        summary: {
          requests: analytics.leave.totalRequests,
          pending: analytics.leave.pending,
          approved: analytics.leave.approved,
          rejected: analytics.leave.rejected,
          approvedDays: analytics.leave.totalDays,
          averageApprovedDaysPerEmployee: analytics.leave.averageDaysPerEmployee,
        },
        byType: analytics.leave.byType,
        byDepartment: analytics.leave.byDepartment,
        trend: analytics.leave.trend,
        upcoming: analytics.leave.upcoming.slice(0, 20).map((row) => ({
          employeeId: row.employee_id,
          leaveType: row.leave_type,
          startDate: row.start_date,
          endDate: row.end_date,
          status: row.approval_status,
        })),
        guardrail: "Leave is a coverage signal, not an employee performance signal.",
      })
    }

    if (domain === "training") {
      if (!actor) throw new Error("Authenticated actor context is required for learning recommendations.")
      const learningOperations = await listLearningOperations(actor, { department: filters.department, location: filters.location })
      const selectedIds = new Set(employeeIds)
      const selectedEmployeeLearningContext = analytics.training.rows
        .filter((row) => selectedIds.has(row.employee_id))
        .slice(0, 40)
        .map((row) => ({ employeeId: row.employee_id, program: row.training_program, status: row.completion_status, dueDate: row.due_date ?? null }))
      const mandatory = analytics.training.rows
        .filter((row) => /incomplete/i.test(row.completion_status) && row.is_mandatory)
        .slice(0, 25)
        .map((row) => ({ employeeId: row.employee_id, program: row.training_program, department: row.department, dueDate: row.due_date ?? null }))
      return result({
        ...common,
        summary: {
          completionRate: analytics.training.completionRate,
          assignedHours: analytics.training.totalHours,
          averageAssessmentScore: analytics.training.averageScore,
          mandatoryGaps: analytics.training.requiringMandatoryTraining,
        },
        incompleteMandatoryAssignments: mandatory,
        byProgram: analytics.training.byProgram,
        byDepartment: analytics.training.byDepartment,
        trend: analytics.training.trend,
        selectedEmployeeLearningContext,
        capabilityRecommendations: learningOperations.recommendations,
        recommendationBasis: "Approved job-profile capability requirements, active role populations, open requisitions, completed mapped courses, and the active course catalog.",
      })
    }

    const mobilityReview = analytics.promotions.mobilityReview.slice(0, 25)
    const selectedEmployeePromotionContext = await employeePromotionContext(employeeIds)
    return result({
      ...common,
      summary: {
        promotions: analytics.promotions.total,
        promotionRate: analytics.promotions.rate,
        averageMonthsToPromotion: analytics.promotions.averageMonthsToPromotion,
        mobilityReviewCount: analytics.promotions.withoutPromotionOver36Months,
      },
      mobilityReview,
      selectedEmployeePromotionContext,
      byDepartment: analytics.promotions.byDepartment,
      trend: analytics.promotions.trend,
      guardrail: "This is a mobility-review cohort, not a determination that anyone should be promoted. Check performance evidence, role levels, lateral moves, career ladders, employee preference, and data completeness.",
    })
  })

  server.registerTool("review_onboarding_readiness", {
    title: mcpToolCatalog[6].title,
    description: mcpToolCatalog[6].description,
    inputSchema: {
      department: z.string().trim().max(120).optional(),
      location: z.string().trim().max(120).optional(),
      includeRecruitingHandoff: z.boolean().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ department, location, includeRecruitingHandoff = true, limit = 10 }: { department?: string; location?: string; includeRecruitingHandoff?: boolean; limit?: number }) => {
    if (!actor) throw new Error("Authenticated actor context is required for onboarding readiness.")
    const [onboarding, hiring] = await Promise.all([
      listOnboardingOperations(actor),
      includeRecruitingHandoff ? listHiringOperations(actor) : Promise.resolve(null),
    ])
    const joiners = onboarding.joiners.filter((row) => (!department || row.department === department) && (!location || row.location === location))
    const requisitions = hiring?.requisitions.filter((row) => (!department || row.department === department) && (!location || row.location === location)) ?? []
    const candidates = hiring?.candidates.filter((row) => (!department || row.department === department) && (!location || row.location === location)) ?? []
    const today = new Date().toISOString().slice(0, 10)
    const horizon = new Date(`${today}T12:00:00Z`)
    horizon.setUTCDate(horizon.getUTCDate() + 30)
    const horizonDate = horizon.toISOString().slice(0, 10)
    return result({
      generatedAt: onboarding.generatedAt,
      dataMode: "imported/operational",
      recordScope: "Authenticated onboarding and recruiting operations",
      filters: { department: department ?? null, location: location ?? null },
      summary: {
        preboarding: joiners.length,
        awaitingVerification: joiners.filter((row) => row.verificationStatus === "Verification").length,
        missingManager: joiners.filter((row) => !row.managerId).length,
        startingNext30Days: joiners.filter((row) => row.startDate >= today && row.startDate <= horizonDate).length,
        openRequisitions: requisitions.filter((row) => ["requested", "open", "offer"].includes(row.status.toLowerCase())).length,
        candidatesAtOffer: candidates.filter((row) => row.stage === "Offer").length,
      },
      joiners: joiners.slice(0, limit),
      recruitingHandoff: includeRecruitingHandoff ? {
        requisitions: requisitions.slice(0, limit).map((row) => ({ id: row.id, role: row.position, department: row.department, location: row.location, status: row.status, owner: row.ownerName, nextAction: row.nextAction, dueDate: row.dueDate })),
        offerCandidates: candidates.filter((row) => row.stage === "Offer").slice(0, limit).map((row) => ({ id: row.id, name: row.fullName, role: row.requisitionTitle, owner: row.ownerName, nextStep: row.nextStep, dueDate: row.nextStepDueAt })),
      } : null,
    })
  })

  server.registerTool("review_capability_plan", {
    title: mcpToolCatalog[7].title,
    description: mcpToolCatalog[7].description,
    inputSchema: {
      department: z.string().trim().max(120).optional(),
      location: z.string().trim().max(120).optional(),
      jobTitle: z.string().trim().max(160).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ department, location, jobTitle, limit = 10 }: { department?: string; location?: string; jobTitle?: string; limit?: number }) => {
    if (!actor) throw new Error("Authenticated actor context is required for capability planning.")
    const learning = await listLearningOperations(actor, { department, location })
    const recommendations = learning.recommendations.filter((row) => !jobTitle || row.jobTitle === jobTitle)
    const eligiblePeople = learning.people.filter((row) => (!jobTitle || row.jobTitle === jobTitle))
    return result({
      generatedAt: learning.generatedAt,
      dataMode: "imported/operational",
      recordScope: "Approved job profiles, role populations, course mappings, completed learning evidence, and open requisitions",
      filters: { department: department ?? null, location: location ?? null, jobTitle: jobTitle ?? null },
      summary: {
        eligibleEmployees: eligiblePeople.length,
        recommendations: recommendations.length,
        highPriority: recommendations.filter((row) => row.priority === "High").length,
        mandatoryGaps: learning.summary.mandatoryGaps,
        overdueAssignments: learning.summary.overdue,
      },
      recommendations: recommendations.slice(0, limit),
      guardrail: "These are internal capability-planning signals. Confirm role relevance, employee goals, access, and time before assignment; training is not a response to an attrition score by itself.",
    })
  })

  server.registerTool("find_employee_records", {
    title: mcpToolCatalog[5].title,
    description: mcpToolCatalog[5].description,
    inputSchema: {
      query: z.string().trim().max(120).optional(),
      status: z.string().trim().max(60).optional(),
      limit: z.number().int().min(1).max(20).optional(),
      ...filtersShape,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ query = "", status, limit = 10, ...filters }: FilterArgs & { query?: string; status?: string; limit?: number }) => {
    const analytics = await getWorkforceAnalytics(filters)
    const terms = query.toLowerCase().split(/[^a-z0-9-]+/).filter((term) => term.length > 1 && !["find", "show", "employee", "employees", "record", "records", "profile", "details", "for", "the"].includes(term))
    const effectiveStatus = status ?? (!terms.length ? "Active" : undefined)
    const allMatches = analytics.directoryEmployees.filter((employee) => {
      if (effectiveStatus && employee.employment_status.toLowerCase() !== effectiveStatus.toLowerCase()) return false
      const searchable = `${employee.employee_id} ${employeeName(employee)} ${employee.department} ${employee.job_title} ${employee.location}`.toLowerCase()
      return terms.every((term) => searchable.includes(term))
    })
    const matches = allMatches.slice(0, limit)
    return result({
      ...evidence(analytics),
      matchCount: allMatches.length,
      employees: matches.map((employee) => ({
        employeeId: employee.employee_id,
        name: employeeName(employee),
        department: employee.department,
        jobTitle: employee.job_title,
        location: employee.location,
        manager: employee.manager,
        employmentStatus: employee.employment_status,
        tenureYears: employee.tenure_years,
        dataSource: employee.data_source,
        hasWorkEmail: Boolean(employee.work_email),
      })),
      privacy: "Only the minimum profile fields needed for the question are returned.",
    })
  })

  server.registerResource("hr-data-contract", "laidbackhr://data-contract", {
    title: "LaidbackHR.AI data and governance contract",
    description: "Available HR domains, source modes, and responsible-use rules.",
    mimeType: "application/json",
  }, async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify({
        domains: ["employees", "hiring", "attrition", "leave", "training", "promotions"],
        tools: mcpToolCatalog.map((tool) => tool.name),
        sourceModes: ["demo", "mixed", "imported/operational"],
        governance: "No automated employment decisions. Human review is required for employee-level action.",
      }),
    }],
  }))

  return server
}
