import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { DomainStatus, HrFilters, WorkforceAnalytics } from "@/lib/hr-types"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { ensureHrDatabase } from "@/lib/server/hr-database"

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

export const mcpToolCatalog = [
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
] as const

export function createHrMcpServer(): McpServer {
  const server = new McpServer(
    { name: "LaidbackHR.AI Workforce Analytics", version: "3.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  )

  server.registerTool("workforce_overview", {
    title: mcpToolCatalog[0].title,
    description: mcpToolCatalog[0].description,
    inputSchema: filtersShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (filters: FilterArgs) => {
    const [analytics, workflows] = await Promise.all([getWorkforceAnalytics(filters), workflowSnapshot()])
    return result({
      ...evidence(analytics),
      kpis: analytics.kpis,
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
    title: mcpToolCatalog[1].title,
    description: mcpToolCatalog[1].description,
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
    title: mcpToolCatalog[2].title,
    description: mcpToolCatalog[2].description,
    inputSchema: {
      recordScope: z.enum(["summary", "exited", "high_risk", "all"]).optional().describe("Optional joined employee record cohort to return"),
      query: z.string().trim().max(120).optional().describe("Optional employee ID, name, department, job title, or location search"),
      limit: z.number().int().min(1).max(20).optional(),
      ...filtersShape,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ recordScope = "summary", query = "", limit = 10, ...filters }: FilterArgs & { recordScope?: "summary" | "exited" | "high_risk" | "all"; query?: string; limit?: number }) => {
    const analytics = await getWorkforceAnalytics(filters)
    const riskDistribution = {
      high: analytics.attrition.employeeRecords.filter((record) => record.riskLevel === "high").length,
      medium: analytics.attrition.employeeRecords.filter((record) => record.riskLevel === "medium").length,
      low: analytics.attrition.employeeRecords.filter((record) => record.riskLevel === "low").length,
    }
    const terms = query.toLowerCase().split(/[^a-z0-9-]+/).filter((term) => term.length > 1)
    const scopedRecords = analytics.attrition.employeeRecords.filter((record) => {
      if (recordScope === "summary") return false
      if (recordScope === "exited" && !record.exitDate) return false
      if (recordScope === "high_risk" && (record.riskLevel !== "high" || /terminated/i.test(record.employmentStatus))) return false
      const searchable = `${record.employeeId} ${record.name} ${record.department} ${record.jobTitle} ${record.location}`.toLowerCase()
      return terms.every((term) => searchable.includes(term))
    })
    return result({
      ...evidence(analytics),
      observedAttrition: {
        exits: analytics.attrition.totalExits,
        rate: analytics.attrition.rate,
        voluntary: analytics.attrition.voluntary,
        involuntary: analytics.attrition.involuntary,
        byDepartment: analytics.attrition.byDepartment,
        byTenure: analytics.attrition.byTenure,
        trend: analytics.attrition.trend,
      },
      historicalModelReview: {
        totalScoredRecords: Object.values(riskDistribution).reduce((sum, count) => sum + count, 0),
        riskDistribution,
        recordsAboveReviewThreshold: riskDistribution.high,
        scope: "The IBM validation rows are joined only to clearly labelled synthetic demo employee profiles with the same stable IDs. Imported operational employees are not assigned IBM model scores.",
      },
      recordScope,
      matchCount: scopedRecords.length,
      joinedEmployeeRecords: scopedRecords.slice(0, limit),
      governance: "Patterns are associations, not proven causes. Model signals require human review and must not be used as automatic employment decisions.",
    })
  })

  server.registerTool("review_people_operations", {
    title: mcpToolCatalog[3].title,
    description: mcpToolCatalog[3].description,
    inputSchema: {
      domain: z.enum(["hiring", "leave", "training", "promotions"]),
      ...filtersShape,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ domain, ...filters }: FilterArgs & { domain: "hiring" | "leave" | "training" | "promotions" }) => {
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
      const mandatory = analytics.training.rows
        .filter((row) => /incomplete/i.test(row.completion_status) && /security|privacy|safety|compliance|phishing|mandatory/i.test(row.training_program))
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
      })
    }

    const promotedIds = new Set(analytics.promotions.rows.map((row) => row.employee_id))
    const mobilityReview = analytics.employees
      .filter((employee) => employee.tenure_years >= 3 && /^active$/i.test(employee.employment_status) && !promotedIds.has(employee.employee_id))
      .sort((left, right) => right.tenure_years - left.tenure_years || left.employee_id.localeCompare(right.employee_id))
      .slice(0, 25)
      .map((employee) => ({
        employeeId: employee.employee_id,
        name: employeeName(employee),
        department: employee.department,
        jobTitle: employee.job_title,
        location: employee.location,
        employmentStatus: employee.employment_status,
        tenureYears: employee.tenure_years,
        dataSource: employee.data_source,
      }))
    return result({
      ...common,
      summary: {
        promotions: analytics.promotions.total,
        promotionRate: analytics.promotions.rate,
        averageMonthsToPromotion: analytics.promotions.averageMonthsToPromotion,
        mobilityReviewCount: analytics.promotions.withoutPromotionOver36Months,
      },
      mobilityReview,
      byDepartment: analytics.promotions.byDepartment,
      trend: analytics.promotions.trend,
      guardrail: "This is a mobility-review cohort, not a determination that anyone should be promoted. Check performance evidence, role levels, lateral moves, career ladders, employee preference, and data completeness.",
    })
  })

  server.registerTool("find_employee_records", {
    title: mcpToolCatalog[4].title,
    description: mcpToolCatalog[4].description,
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
