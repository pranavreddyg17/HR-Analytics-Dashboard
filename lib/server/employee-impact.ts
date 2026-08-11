import type { EmployeeImpactScenario, EmployeeImpactSearchResult, HrFilters, WorkforceCostAssumptions } from "@/lib/hr-types"
import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { calculateContinuityStatus, calculateReplacementCost } from "@/lib/server/workforce-impact"

type ImpactPolicy = {
  fallbackRefillDays: number
  criticalReviewShare: number
  watchReviewShare: number
}

type EmployeeRow = {
  employee_id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  department: string
  job_title: string
  location: string
  manager: string
  employment_status: string
  annual_salary: number | null
  risk_score: number | null
  risk_level: string | null
  top_driver: string | null
}

function displayName(row: Pick<EmployeeRow, "employee_id" | "first_name" | "last_name" | "preferred_name">): string {
  return [row.preferred_name || row.first_name, row.last_name].filter(Boolean).join(" ").trim() || row.employee_id
}

function rounded(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0)
}

function rangeClause(column: string, filters: HrFilters): { sql: string; bindings: string[] } {
  const clauses: string[] = []
  const bindings: string[] = []
  if (filters.from) { clauses.push(`${column} >= ?`); bindings.push(filters.from) }
  if (filters.to) { clauses.push(`${column} <= ?`); bindings.push(filters.to) }
  return { sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "", bindings }
}

export async function searchEmployeeImpactPeople(query: string, filters: HrFilters = {}, limit = 20): Promise<EmployeeImpactSearchResult[]> {
  const database = await ensureHrDatabase()
  const where = ["e.archived_at IS NULL", "LOWER(e.employment_status) IN ('active', 'on leave')"]
  const bindings: unknown[] = []
  if (filters.department) { where.push("e.department = ?"); bindings.push(filters.department) }
  if (filters.location) { where.push("e.location = ?"); bindings.push(filters.location) }
  if (filters.jobTitle) { where.push("e.job_title = ?"); bindings.push(filters.jobTitle) }
  if (filters.dataMode === "live") where.push("LOWER(e.data_source) <> 'demo'")
  if (query.trim()) {
    where.push(`LOWER(e.employee_id || ' ' || COALESCE(e.preferred_name, '') || ' ' || e.first_name || ' ' || e.last_name || ' ' || COALESCE(e.work_email, '') || ' ' || e.department || ' ' || e.job_title || ' ' || e.location) LIKE ?`)
    bindings.push(`%${query.trim().toLowerCase()}%`)
  }
  const result = await database.prepare(`
    SELECT e.employee_id, e.first_name, e.last_name, e.preferred_name,
      e.department, e.job_title, e.location
    FROM employee_directory_view e
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(NULLIF(e.preferred_name, ''), e.first_name), e.last_name, e.employee_id
    LIMIT ?
  `).bind(...bindings, Math.max(1, Math.min(limit, 30))).all<EmployeeRow>()
  return (result.results ?? []).map((row) => ({
    employeeId: row.employee_id,
    name: displayName(row),
    department: row.department,
    jobTitle: row.job_title,
    location: row.location,
  }))
}

export async function getEmployeeImpactScenario(employeeId: string, filters: HrFilters = {}): Promise<EmployeeImpactScenario | null> {
  const database = await ensureHrDatabase()
  const scope = ["e.employee_id = ?", "e.archived_at IS NULL", "LOWER(e.employment_status) IN ('active', 'on leave')"]
  const scopeBindings: unknown[] = [employeeId]
  if (filters.department) { scope.push("e.department = ?"); scopeBindings.push(filters.department) }
  if (filters.location) { scope.push("e.location = ?"); scopeBindings.push(filters.location) }
  if (filters.jobTitle) { scope.push("e.job_title = ?"); scopeBindings.push(filters.jobTitle) }
  if (filters.dataMode === "live") scope.push("LOWER(e.data_source) <> 'demo'")

  const modelSourceClause = filters.dataMode === "live" ? " AND LOWER(model.data_source) <> 'demo'" : ""
  const liveEmployeeClause = filters.dataMode === "live" ? " AND LOWER(e.data_source) <> 'demo'" : ""

  const employee = await database.prepare(`
    SELECT e.employee_id, e.first_name, e.last_name, e.preferred_name, e.department,
      e.job_title, e.location, e.manager, e.employment_status,
      compensation.annual_salary, model.risk_score, model.risk_level, model.top_driver
    FROM employee_directory_view e
    LEFT JOIN LATERAL (
      SELECT annual_salary FROM employee_compensation c
      WHERE c.employee_id=e.employee_id
      ORDER BY c.effective_from DESC, c.created_at DESC LIMIT 1
    ) compensation ON TRUE
    LEFT JOIN attrition_model_profiles_view model ON model.employee_id=e.employee_id${modelSourceClause}
    WHERE ${scope.join(" AND ")}
  `).bind(...scopeBindings).first<EmployeeRow>()
  if (!employee) return null

  const hireRange = rangeClause("h.hiring_date", filters)
  const exitRange = rangeClause("a.exit_date", filters)
  const liveHiringClause = filters.dataMode === "live" ? " AND LOWER(h.data_source) <> 'demo'" : ""
  const liveAttritionClause = filters.dataMode === "live" ? " AND LOWER(a.data_source) <> 'demo'" : ""
  const liveLearningClause = filters.dataMode === "live" ? " AND LOWER(data_source) <> 'demo'" : ""
  const [settings, activeRole, directReports, openRoles, movement, refill, learning] = await Promise.all([
    database.prepare(`SELECT currency, recruiting_cost_per_hire, vacancy_productivity_percent,
      onboarding_days, onboarding_productivity_percent, course_fee_per_learner,
      course_hours_per_learner, fallback_refill_days, critical_review_share, watch_review_share
      FROM workspace_analytics_settings WHERE organization_id='org:laidbackhr'`).first<{
        currency: "USD"; recruiting_cost_per_hire: number; vacancy_productivity_percent: number;
        onboarding_days: number; onboarding_productivity_percent: number; course_fee_per_learner: number;
        course_hours_per_learner: number; fallback_refill_days: number; critical_review_share: number;
        watch_review_share: number
      }>(),
    database.prepare(`SELECT COUNT(*)::int AS active,
      COUNT(model.employee_id) FILTER (WHERE LOWER(model.risk_level)='high')::int AS high_review,
      COUNT(model.employee_id)::int AS scored
      FROM employee_directory_view e
      LEFT JOIN attrition_model_profiles_view model ON model.employee_id=e.employee_id${modelSourceClause}
      WHERE e.archived_at IS NULL AND LOWER(e.employment_status) IN ('active', 'on leave')
        AND e.department=? AND LOWER(e.job_title)=LOWER(?)${liveEmployeeClause}`).bind(employee.department, employee.job_title).first<{ active: number; high_review: number; scored: number }>(),
    database.prepare(`SELECT COUNT(*)::int AS count FROM employee_directory_view
      WHERE archived_at IS NULL AND LOWER(employment_status) IN ('active', 'on leave') AND manager_id=?`).bind(employee.employee_id).first<{ count: number }>(),
    database.prepare(`SELECT COUNT(*)::int AS count FROM hiring_requisitions_view
      WHERE department=? AND LOWER(position)=LOWER(?) AND LOWER(recruitment_status) IN ('requested', 'open', 'offer')${liveHiringClause}`).bind(employee.department, employee.job_title).first<{ count: number }>(),
    Promise.all([
      database.prepare(`SELECT COUNT(*)::int AS count FROM hiring_requisitions_view h
        WHERE h.department=? AND LOWER(h.position)=LOWER(?) AND LOWER(h.recruitment_status)='hired'
          AND h.hiring_date IS NOT NULL${hireRange.sql}${liveHiringClause}`).bind(employee.department, employee.job_title, ...hireRange.bindings).first<{ count: number }>(),
      database.prepare(`SELECT COUNT(*)::int AS count FROM attrition_events_view a
        JOIN employee_directory_view e ON e.employee_id=a.employee_id
        WHERE e.department=? AND LOWER(e.job_title)=LOWER(?)${exitRange.sql}${liveAttritionClause}`).bind(employee.department, employee.job_title, ...exitRange.bindings).first<{ count: number }>(),
    ]),
    database.prepare(`SELECT
      AVG(h.time_to_hire_days) FILTER (WHERE h.department=? AND LOWER(h.position)=LOWER(?)) AS role_days,
      AVG(h.time_to_hire_days) FILTER (WHERE h.department=?) AS department_days,
      AVG(h.time_to_hire_days) AS company_days
      FROM hiring_requisitions_view h
      WHERE LOWER(h.recruitment_status)='hired' AND h.time_to_hire_days > 0${hireRange.sql}${liveHiringClause}`)
      .bind(employee.department, employee.job_title, employee.department, ...hireRange.bindings)
      .first<{ role_days: number | null; department_days: number | null; company_days: number | null }>(),
    database.prepare(`SELECT COUNT(*)::int AS count FROM learning_assignments_view
      WHERE employee_id=? AND LOWER(completion_status) <> 'completed'${liveLearningClause}`).bind(employee.employee_id).first<{ count: number }>(),
  ])
  if (!settings) throw new Error("WORKSPACE_ANALYTICS_SETTINGS_MISSING")

  const assumptions: WorkforceCostAssumptions = {
    currency: settings.currency,
    recruitingCostPerHire: filters.recruitingCostPerHire ?? Number(settings.recruiting_cost_per_hire),
    vacancyProductivityPercent: filters.vacancyProductivityPercent ?? Number(settings.vacancy_productivity_percent),
    onboardingDays: filters.onboardingDays ?? Number(settings.onboarding_days),
    onboardingProductivityPercent: filters.onboardingProductivityPercent ?? Number(settings.onboarding_productivity_percent),
    courseFeePerLearner: filters.courseFeePerLearner ?? Number(settings.course_fee_per_learner),
    courseHoursPerLearner: filters.courseHoursPerLearner ?? Number(settings.course_hours_per_learner),
  }
  const policy: ImpactPolicy = {
    fallbackRefillDays: Number(settings.fallback_refill_days),
    criticalReviewShare: Number(settings.critical_review_share),
    watchReviewShare: Number(settings.watch_review_share),
  }
  const roleRefillDays = Number(refill?.role_days ?? 0)
  const departmentRefillDays = Number(refill?.department_days ?? 0)
  const companyRefillDays = Number(refill?.company_days ?? 0)
  const refillDays = Math.round(roleRefillDays || departmentRefillDays || companyRefillDays || policy.fallbackRefillDays)
  const refillBasis = roleRefillDays > 0 ? "role" : departmentRefillDays > 0 ? "department" : companyRefillDays > 0 ? "company" : "policy"
  const annualPay = Number(employee.annual_salary ?? 0)
  const costs = calculateReplacementCost(annualPay, refillDays, assumptions)
  const proposedLearningInvestment = rounded(assumptions.courseFeePerLearner + (annualPay / 2080) * assumptions.courseHoursPerLearner)
  const activeCount = Number(activeRole?.active ?? 0)
  const highReview = Number(activeRole?.high_review ?? 0)
  const scored = Number(activeRole?.scored ?? 0)
  const completedHires = Number(movement[0]?.count ?? 0)
  const recordedExits = Number(movement[1]?.count ?? 0)
  const openMatchingRequisitions = Number(openRoles?.count ?? 0)

  return {
    employeeId: employee.employee_id,
    name: displayName(employee),
    department: employee.department,
    jobTitle: employee.job_title,
    location: employee.location,
    manager: employee.manager,
    employmentStatus: employee.employment_status,
    riskScore: employee.risk_score === null ? null : Number(employee.risk_score),
    riskLevel: employee.risk_level,
    topDriver: employee.top_driver,
    activeRolePeers: Math.max(0, activeCount - 1),
    directReports: Number(directReports?.count ?? 0),
    openMatchingRequisitions,
    refillDays,
    refillBasis,
    payDataAvailable: annualPay > 0,
    annualPay: rounded(annualPay),
    directRecruitingCost: costs.direct,
    vacancyCost: costs.vacancy,
    onboardingCost: costs.onboarding,
    replacementCost: costs.total,
    incompleteLearningAssignments: Number(learning?.count ?? 0),
    proposedLearningInvestment,
    learningBreakEvenPercent: costs.total ? Number(((proposedLearningInvestment / costs.total) * 100).toFixed(1)) : 0,
    continuityStatus: calculateContinuityStatus({
      active: activeCount,
      exits: recordedExits,
      hires: completedHires,
      openRoles: openMatchingRequisitions,
      reviewShare: scored ? Number(((highReview / scored) * 100).toFixed(1)) : 0,
      refillDays,
    }, policy),
  }
}
