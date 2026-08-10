import type {
  AttritionEmployeeRecord,
  AttritionModelProfile,
  AttritionRecord,
  BreakdownPoint,
  DomainStatus,
  EmployeeRecord,
  HiringRecord,
  HrDomain,
  HrFilters,
  LeaveRecord,
  PromotionRecord,
  TimePoint,
  TrainingRecord,
  WorkforceAnalytics,
} from "@/lib/hr-types"
import { hrDomains } from "@/lib/hr-types"
import { ensureHrDatabase, readAttritionModelProfiles, readDomainRows } from "@/lib/server/hr-repository"
import { cachedAnalyticsRead } from "@/lib/server/analytics-cache"
import { buildWorkforceImpact } from "@/lib/server/workforce-impact"

function inRange(date: string | null, filters: HrFilters): boolean {
  if (!date) return false
  if (filters.from && date < filters.from) return false
  if (filters.to && date > filters.to) return false
  return true
}

function periodKey(date: string, period: HrFilters["period"]): string {
  if (period === "year") return date.slice(0, 4)
  if (period === "quarter") {
    const month = Number(date.slice(5, 7))
    return `${date.slice(0, 4)} Q${Math.ceil(month / 3)}`
  }
  return date.slice(0, 7)
}

function groupBy<T>(rows: T[], label: (row: T) => string, value: (row: T) => number = () => 1): BreakdownPoint[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const key = label(row) || "Not specified"
    totals.set(key, (totals.get(key) ?? 0) + value(row))
  }
  return [...totals.entries()]
    .map(([itemLabel, itemValue]) => ({ label: itemLabel, value: Number(itemValue.toFixed(1)) }))
    .sort((left, right) => right.value - left.value)
}

function trend<T>(rows: T[], date: (row: T) => string | null, period: HrFilters["period"], value: (row: T) => number = () => 1): TimePoint[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const itemDate = date(row)
    if (!itemDate) continue
    const key = periodKey(itemDate, period)
    totals.set(key, (totals.get(key) ?? 0) + value(row))
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemPeriod, itemValue]) => ({ period: itemPeriod, value: Number(itemValue.toFixed(1)) }))
}

function average(values: Array<number | null>): number {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value))
  return usable.length ? Number((usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(1)) : 0
}

function percent(numerator: number, denominator: number): number {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 0
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function dateInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function matchesEmployee(employee: EmployeeRecord | undefined, filters: HrFilters): boolean {
  if (!employee) return !filters.jobTitle && !filters.location
  if (filters.department && employee.department !== filters.department) return false
  if (filters.jobTitle && employee.job_title !== filters.jobTitle) return false
  if (filters.location && employee.location !== filters.location) return false
  return true
}

async function getDomainStatus(rowsByDomain: Record<HrDomain, Array<Record<string, unknown>>>): Promise<DomainStatus[]> {
  const database = await ensureHrDatabase()
  const latest = new Map<string, string>()
  if (database) {
    const result = await database.prepare("SELECT domain, MAX(imported_at) AS imported_at FROM data_imports WHERE status = 'completed' GROUP BY domain").all<{ domain: string; imported_at: string }>()
    for (const row of result.results ?? []) latest.set(row.domain, row.imported_at)
  }
  return hrDomains.map((domain) => {
    const rows = rowsByDomain[domain]
    const sources = new Set(rows.map((row) => String(row.data_source ?? "demo")))
    const hasDemo = sources.has("demo")
    const hasLive = [...sources].some((source) => source !== "demo")
    const mode = rows.length === 0 ? "empty" : hasDemo && hasLive ? "mixed" : hasLive ? "imported" : "demo"
    return { domain, count: rows.length, mode, lastImport: latest.get(domain) ?? null }
  })
}

export async function getWorkspaceDomainStatus(): Promise<DomainStatus[]> {
  const database = await ensureHrDatabase()
  const relations: Record<HrDomain, string> = {
    employees: "employee_directory_view",
    hiring: "hiring_requisitions_view",
    attrition: "attrition_events_view",
    leave: "leave_requests_view",
    training: "learning_assignments_view",
    promotions: "promotion_events_view",
  }
  const [counts, imports] = await Promise.all([
    Promise.all(hrDomains.map(async (domain) => {
      const row = await database.prepare(`SELECT COUNT(*)::int AS count,
        COALESCE(BOOL_OR(LOWER(data_source)='demo'), FALSE) AS has_demo,
        COALESCE(BOOL_OR(LOWER(data_source)<>'demo'), FALSE) AS has_live
        FROM ${relations[domain]}`).first<{ count: number; has_demo: boolean; has_live: boolean }>()
      return { domain, count: Number(row?.count ?? 0), hasDemo: Boolean(row?.has_demo), hasLive: Boolean(row?.has_live) }
    })),
    database.prepare("SELECT domain, MAX(imported_at) AS imported_at FROM data_imports WHERE status='completed' GROUP BY domain")
      .all<{ domain: string; imported_at: string }>(),
  ])
  const latest = new Map((imports.results ?? []).map((row) => [row.domain, row.imported_at]))
  return counts.map((row) => ({
    domain: row.domain,
    count: row.count,
    mode: row.count === 0 ? "empty" : row.hasDemo && row.hasLive ? "mixed" : row.hasLive ? "imported" : "demo",
    lastImport: latest.get(row.domain) ?? null,
  }))
}

export async function getWorkforceDimensions(): Promise<{ departments: string[]; jobTitles: string[]; locations: string[] }> {
  return cachedAnalyticsRead("workforce:dimensions", async () => {
    const database = await ensureHrDatabase()
    const [employees, requisitions] = await Promise.all([
      database.prepare(`SELECT DISTINCT department, job_title, location
        FROM employee_directory_view
        WHERE archived_at IS NULL`).all<{ department: string; job_title: string; location: string }>(),
      database.prepare(`SELECT DISTINCT department, position, location
        FROM hiring_requisitions_view`).all<{ department: string; position: string; location: string }>(),
    ])
    const employeeRows = employees.results ?? []
    const requisitionRows = requisitions.results ?? []
    return {
      departments: unique([...employeeRows.map((row) => row.department), ...requisitionRows.map((row) => row.department)]),
      jobTitles: unique([...employeeRows.map((row) => row.job_title), ...requisitionRows.map((row) => row.position)]),
      locations: unique([...employeeRows.map((row) => row.location), ...requisitionRows.map((row) => row.location)]),
    }
  })
}

export async function getWorkforceAnalytics(filters: HrFilters = {}, options: { rowLimit?: number | null } = {}): Promise<WorkforceAnalytics> {
  if (options.rowLimit === null) return calculateWorkforceAnalytics(filters, options)
  const cacheKey = JSON.stringify({ filters: Object.fromEntries(Object.entries(filters).sort(([left], [right]) => left.localeCompare(right))), rowLimit: options.rowLimit ?? "default" })
  return cachedAnalyticsRead(`workforce:${cacheKey}`, () => calculateWorkforceAnalytics(filters, options))
}

async function calculateWorkforceAnalytics(filters: HrFilters = {}, options: { rowLimit?: number | null } = {}): Promise<WorkforceAnalytics> {
  const normalizedFilters: WorkforceAnalytics["filters"] = { ...filters, period: filters.period ?? "month" }
  const outputRows = <T>(rows: T[], defaultLimit: number): T[] => options.rowLimit === null ? rows : rows.slice(0, options.rowLimit ?? defaultLimit)
  const database = await ensureHrDatabase()
  if (!database) throw new Error("DATABASE_UNAVAILABLE")
  const [employeeRows, hiringRows, attritionRows, leaveRows, trainingRows, promotionRows, modelProfileRows, compensationResult, analyticsSettings] = await Promise.all([
    readDomainRows("employees"),
    readDomainRows("hiring"),
    readDomainRows("attrition"),
    readDomainRows("leave"),
    readDomainRows("training"),
    readDomainRows("promotions"),
    readAttritionModelProfiles(),
    database.prepare(`SELECT DISTINCT ON (employee_id) employee_id, annual_salary
      FROM employee_compensation
      ORDER BY employee_id, effective_from DESC, created_at DESC`).all<{ employee_id: string; annual_salary: number }>(),
    database.prepare(`SELECT currency, recruiting_cost_per_hire, vacancy_productivity_percent, onboarding_days,
      onboarding_productivity_percent, course_fee_per_learner, course_hours_per_learner,
      fallback_refill_days, critical_review_share, watch_review_share
      FROM workspace_analytics_settings WHERE organization_id='org:laidbackhr'`).first<{
        currency: "USD"; recruiting_cost_per_hire: number; vacancy_productivity_percent: number;
        onboarding_days: number; onboarding_productivity_percent: number; course_fee_per_learner: number;
        course_hours_per_learner: number; fallback_refill_days: number; critical_review_share: number;
        watch_review_share: number
      }>(),
  ])
  if (!analyticsSettings) throw new Error("WORKSPACE_ANALYTICS_SETTINGS_MISSING")
  const annualPayByEmployee = new Map((compensationResult.results ?? []).map((row) => [row.employee_id, Number(row.annual_salary)]))

  const allEmployees = employeeRows as unknown as EmployeeRecord[]
  const allHiring = hiringRows as unknown as HiringRecord[]
  const allAttrition = attritionRows as unknown as AttritionRecord[]
  const allLeave = leaveRows as unknown as LeaveRecord[]
  const allTraining = trainingRows as unknown as TrainingRecord[]
  const allPromotions = promotionRows as unknown as PromotionRecord[]
  const allModelProfiles = modelProfileRows as unknown as AttritionModelProfile[]
  const employeeMap = new Map(allEmployees.map((employee) => [employee.employee_id, employee]))
  const liveOnly = normalizedFilters.dataMode === "live"
  const isIncluded = (record: { data_source: string }) => !liveOnly || record.data_source !== "demo"

  const directoryEmployees = allEmployees.filter((employee) => matchesEmployee(employee, normalizedFilters))
  const employees = directoryEmployees.filter(isIncluded)
  const hiringByDimensions = allHiring.filter((record) => {
    if (!isIncluded(record)) return false
    if (normalizedFilters.department && record.department !== normalizedFilters.department) return false
    if (normalizedFilters.jobTitle && record.position !== normalizedFilters.jobTitle) return false
    if (normalizedFilters.location && record.location !== normalizedFilters.location) return false
    return true
  })
  const requisitions = hiringByDimensions.filter((record) => inRange(record.application_date, normalizedFilters))
  const completedHires = hiringByDimensions.filter((record) => record.recruitment_status.toLowerCase() === "hired" && record.hiring_date && inRange(record.hiring_date, normalizedFilters))
  const currentOpenRequisitions = hiringByDimensions.filter((record) => ["requested", "open", "offer"].includes(record.recruitment_status.toLowerCase()))
  const hiringIds = new Set([...requisitions, ...completedHires, ...currentOpenRequisitions].map((record) => record.id))
  const hiring = hiringByDimensions.filter((record) => hiringIds.has(record.id))
  const attrition = allAttrition.filter((record) => isIncluded(record) && inRange(record.exit_date, normalizedFilters) && matchesEmployee(employeeMap.get(record.employee_id), normalizedFilters) && (!normalizedFilters.department || record.department === normalizedFilters.department))
  const leave = allLeave.filter((record) => isIncluded(record) && inRange(record.start_date, normalizedFilters) && matchesEmployee(employeeMap.get(record.employee_id), normalizedFilters) && (!normalizedFilters.department || record.department === normalizedFilters.department) && (!normalizedFilters.leaveType || record.leave_type === normalizedFilters.leaveType))
  const training = allTraining.filter((record) => {
    if (!isIncluded(record) || !matchesEmployee(employeeMap.get(record.employee_id), normalizedFilters) || normalizedFilters.department && record.department !== normalizedFilters.department) return false
    const eventDate = record.completion_status.toLowerCase() === "completed"
      ? record.completion_date
      : record.assigned_at?.slice(0, 10) ?? record.updated_at?.slice(0, 10) ?? null
    return inRange(eventDate, normalizedFilters)
  })
  const promotions = allPromotions.filter((record) => isIncluded(record) && inRange(record.promotion_date, normalizedFilters) && matchesEmployee(employeeMap.get(record.employee_id), normalizedFilters) && (!normalizedFilters.department || record.department === normalizedFilters.department))

  const hired = completedHires
  const activeHiring = currentOpenRequisitions
  const approvedLeave = leave.filter((record) => record.approval_status.toLowerCase() === "approved")
  const today = dateInTimeZone("America/Los_Angeles")
  const operatingTo = normalizedFilters.to ?? today
  const rollingStartDate = new Date(`${operatingTo}T12:00:00Z`)
  rollingStartDate.setUTCFullYear(rollingStartDate.getUTCFullYear() - 1)
  const operatingFrom = normalizedFilters.from ?? rollingStartDate.toISOString().slice(0, 10)
  const operatingWindowLabel = normalizedFilters.from || normalizedFilters.to ? "Selected date range" : "Rolling 12 months"
  const currentlyAway = approvedLeave.filter((record) => record.start_date <= today && record.end_date >= today)
  const upcomingLeave = leave.filter((record) => ["approved", "pending"].includes(record.approval_status.toLowerCase()) && record.start_date >= today).sort((left, right) => left.start_date.localeCompare(right.start_date))
  const completedTraining = training.filter((record) => record.completion_status.toLowerCase() === "completed")
  const activeEmployees = employees.filter((employee) => ["active", "on leave"].includes(employee.employment_status.toLowerCase()))
  const attritionRate = percent(attrition.length, activeEmployees.length + attrition.length)
  const promotedIds = new Set(allPromotions.filter(isIncluded).map((promotion) => promotion.employee_id))
  const withoutPromotion = activeEmployees.filter((employee) => employee.tenure_years >= 3 && !promotedIds.has(employee.employee_id)).length
  const mobilityReview = activeEmployees
    .filter((employee) => employee.tenure_years >= 3 && !promotedIds.has(employee.employee_id))
    .sort((left, right) => right.tenure_years - left.tenure_years || left.employee_id.localeCompare(right.employee_id))
    .slice(0, 100)
    .map((employee) => ({
      employeeId: employee.employee_id,
      name: [employee.preferred_name || employee.first_name, employee.last_name].filter(Boolean).join(" ").trim() || employee.employee_id,
      department: employee.department,
      jobTitle: employee.job_title,
      location: employee.location,
      employmentStatus: employee.employment_status,
      tenureYears: employee.tenure_years,
      dataSource: employee.data_source,
    }))
  const exitByEmployee = new Map(attrition.map((record) => [record.employee_id, record]))
  const joinedModelRecords: AttritionEmployeeRecord[] = allModelProfiles
    .filter(isIncluded)
    .map((profile) => ({ profile, employee: employeeMap.get(profile.employee_id), exit: exitByEmployee.get(profile.employee_id) }))
    .filter((row): row is { profile: AttritionModelProfile; employee: EmployeeRecord; exit: AttritionRecord | undefined } => Boolean(row.employee) && matchesEmployee(row.employee, normalizedFilters))
    .map(({ profile, employee, exit }) => ({
      employeeId: employee.employee_id,
      name: [employee.preferred_name || employee.first_name, employee.last_name].filter(Boolean).join(" ").trim() || employee.employee_id,
      department: employee.department,
      jobTitle: employee.job_title,
      location: employee.location,
      manager: employee.manager,
      employmentStatus: employee.employment_status,
      tenureYears: employee.tenure_years,
      observedAttrition: profile.observed_attrition,
      exitDate: exit?.exit_date ?? null,
      exitReason: exit?.exit_reason ?? null,
      exitType: exit?.exit_type ?? null,
      riskScore: Number(profile.risk_score),
      riskLevel: profile.risk_level,
      topDriver: profile.top_driver,
      distanceFromHome: Number(profile.distance_from_home),
      educationLevel: Number(profile.education_level),
      educationField: profile.education_field,
      jobSatisfaction: Number(profile.job_satisfaction),
      environmentSatisfaction: Number(profile.environment_satisfaction),
      workLifeBalance: Number(profile.work_life_balance),
      monthlyIncome: Number(profile.monthly_income),
      priorCompanies: Number(profile.prior_companies),
      yearsAtCompany: Number(profile.years_at_company),
      modelVersion: profile.model_version,
      dataSource: profile.data_source,
    }))
    .sort((left, right) => right.riskScore - left.riskScore || left.employeeId.localeCompare(right.employeeId))
  const highRiskEmployees = joinedModelRecords
    .filter((employee) => employee.riskLevel === "high")
    .slice(0, 12)
    .map((employee) => ({ id: employee.employeeId, department: employee.department, role: employee.jobTitle, riskScore: employee.riskScore, topDriver: employee.topDriver }))

  const hiringBySource = groupBy(hired, (record) => record.hiring_source)
  const sourceStats = hiringBySource.map((source) => {
    const sourceHires = hired.filter((record) => record.hiring_source === source.label)
    return { label: source.label, hires: sourceHires.length, averageDays: average(sourceHires.map((record) => record.time_to_hire_days)) }
  })
  const attritionByDepartment = groupBy(attrition, (record) => record.department)
  const leaveByDepartment = groupBy(approvedLeave, (record) => record.department, (record) => record.leave_days)
  const trainingByDepartment = groupBy(training, (record) => record.department, (record) => record.training_hours)
  const promotionByDepartment = groupBy(promotions, (record) => record.department)
  const status = await getDomainStatus({ employees: employeeRows, hiring: hiringRows, attrition: attritionRows, leave: leaveRows, training: trainingRows, promotions: promotionRows })
  const employeeByDepartment = groupBy(employees, (record) => record.department)
  const managerCounts = new Map<string, number>()
  for (const employee of employees) {
    if (employee.manager_id) managerCounts.set(employee.manager_id, (managerCounts.get(employee.manager_id) ?? 0) + 1)
  }
  const managerSpan = [...managerCounts.entries()].map(([managerId, count]) => {
    const manager = employeeMap.get(managerId)
    const name = manager ? `${manager.preferred_name || manager.first_name || manager.employee_id} ${manager.last_name || ""}`.trim() : managerId
    return { label: name, value: count }
  }).sort((left, right) => right.value - left.value)

  const inOperatingWindow = (date: string | null) => Boolean(date && date >= operatingFrom && date <= operatingTo)
  const operatingAttrition = allAttrition.filter((record) => isIncluded(record)
    && inOperatingWindow(record.exit_date)
    && matchesEmployee(employeeMap.get(record.employee_id), normalizedFilters)
    && (!normalizedFilters.department || record.department === normalizedFilters.department))
  const operatingHires = hiringByDimensions.filter((record) => record.recruitment_status.toLowerCase() === "hired"
    && inOperatingWindow(record.hiring_date))
  const openRequisitions = currentOpenRequisitions
  const operatingExitByDepartment = new Map(groupBy(operatingAttrition, (record) => record.department).map((row) => [row.label, row.value]))
  const operatingHireByDepartment = new Map(groupBy(operatingHires, (record) => record.department).map((row) => [row.label, row.value]))
  const openRequisitionByDepartment = new Map(groupBy(openRequisitions, (record) => record.department).map((row) => [row.label, row.value]))
  const activeByDepartment = new Map(groupBy(activeEmployees, (record) => record.department).map((row) => [row.label, row.value]))
  const mobilityByDepartment = new Map(groupBy(activeEmployees.filter((employee) => employee.tenure_years >= 3 && !promotedIds.has(employee.employee_id)), (record) => record.department).map((row) => [row.label, row.value]))
  const operatingDepartments = unique([
    ...activeEmployees.map((record) => record.department),
    ...operatingAttrition.map((record) => record.department),
    ...operatingHires.map((record) => record.department),
    ...openRequisitions.map((record) => record.department),
  ])
  const replacementCoverage: WorkforceAnalytics["operatingSignals"]["replacementCoverage"] = operatingDepartments.map((department) => {
    const departmentHires = operatingHires.filter((record) => record.department === department)
    const hires = operatingHireByDepartment.get(department) ?? 0
    const exits = operatingExitByDepartment.get(department) ?? 0
    const requisitions = openRequisitionByDepartment.get(department) ?? 0
    const netMovement = hires - exits
    const status: "Gap" | "Watch" | "Covered" = exits > hires + requisitions ? "Gap" : exits > hires ? "Watch" : "Covered"
    return {
      department,
      activeEmployees: activeByDepartment.get(department) ?? 0,
      hires,
      exits,
      openRequisitions: requisitions,
      netMovement,
      averageTimeToHire: average(departmentHires.map((record) => record.time_to_hire_days)),
      mobilityReviewCount: mobilityByDepartment.get(department) ?? 0,
      status,
    }
  }).sort((left, right) => {
    const rank = { Gap: 0, Watch: 1, Covered: 2 }
    return rank[left.status] - rank[right.status] || left.netMovement - right.netMovement || right.exits - left.exits
  })

  const coverageByDepartment = new Map(replacementCoverage.map((row) => [row.department, row]))
  const decisionDepartments = unique([
    ...operatingDepartments,
    ...approvedLeave.map((record) => record.department),
    ...leave.map((record) => record.department),
    ...training.map((record) => record.department),
    ...promotions.map((record) => record.department),
  ])
  const mandatoryTraining = (record: TrainingRecord) => Boolean(Number(record.is_mandatory))
  const departmentDecisionMetrics: WorkforceAnalytics["decisionSupport"]["departments"] = decisionDepartments.map((department) => {
    const activeCount = activeByDepartment.get(department) ?? 0
    const departmentHires = hired.filter((record) => record.department === department).length
    const departmentExits = attrition.filter((record) => record.department === department).length
    const departmentLeave = approvedLeave.filter((record) => record.department === department)
    const departmentTraining = training.filter((record) => record.department === department)
    const departmentCompletedTraining = departmentTraining.filter((record) => record.completion_status.toLowerCase() === "completed")
    const departmentPromotions = promotions.filter((record) => record.department === department).length
    const coverage = coverageByDepartment.get(department)
    const openRoles = coverage?.openRequisitions ?? openRequisitions.filter((record) => record.department === department).length
    const mobilityReviews = mobilityByDepartment.get(department) ?? 0
    return {
      department,
      activeEmployees: activeCount,
      hires: departmentHires,
      exits: departmentExits,
      attritionRate: percent(departmentExits, activeCount + departmentExits),
      netMovement: departmentHires - departmentExits,
      replacementRate: departmentExits ? percent(departmentHires, departmentExits) : null,
      openRequisitions: openRoles,
      vacancyRate: percent(openRoles, activeCount),
      coverageStatus: coverage?.status ?? "Covered",
      approvedLeaveDays: Number(departmentLeave.reduce((sum, record) => sum + record.leave_days, 0).toFixed(1)),
      leaveDaysPerActiveEmployee: activeCount
        ? Number((departmentLeave.reduce((sum, record) => sum + record.leave_days, 0) / activeCount).toFixed(1))
        : 0,
      pendingLeaveRequests: leave.filter((record) => record.department === department && record.approval_status.toLowerCase() === "pending").length,
      trainingAssignments: departmentTraining.length,
      trainingCompletionRate: percent(departmentCompletedTraining.length, departmentTraining.length),
      mandatoryTrainingGaps: departmentTraining.filter((record) => record.completion_status.toLowerCase() !== "completed" && mandatoryTraining(record)).length,
      promotions: departmentPromotions,
      promotionRate: percent(departmentPromotions, activeCount),
      mobilityReviewCount: mobilityReviews,
      mobilityReviewShare: percent(mobilityReviews, activeCount),
    }
  })

  const companyDecisionMetrics: WorkforceAnalytics["decisionSupport"]["company"] = {
    replacementRate: attrition.length ? percent(hired.length, attrition.length) : null,
    vacancyRate: percent(openRequisitions.length, activeEmployees.length),
    voluntaryExitShare: percent(attrition.filter((record) => record.exit_type.toLowerCase() === "voluntary").length, attrition.length),
    leaveDaysPerActiveEmployee: activeEmployees.length
      ? Number((approvedLeave.reduce((sum, record) => sum + record.leave_days, 0) / activeEmployees.length).toFixed(1))
      : 0,
    mobilityReviewShare: percent(withoutPromotion, activeEmployees.length),
    trainingCompletionRate: percent(completedTraining.length, training.length),
    mandatoryTrainingGaps: training.filter((record) => record.completion_status.toLowerCase() !== "completed" && mandatoryTraining(record)).length,
  }

  const tenureCohort = (years: number): string => years < 1 ? "< 1 year" : years < 3 ? "1–2 years" : years < 5 ? "3–4 years" : "5+ years"
  const tenureOrder = ["< 1 year", "1–2 years", "3–4 years", "5+ years"]
  const activeByTenure = new Map(groupBy(activeEmployees, (record) => tenureCohort(record.tenure_years)).map((row) => [row.label, row.value]))
  const exitsByTenure = new Map(groupBy(attrition, (record) => tenureCohort(record.tenure_years)).map((row) => [row.label, row.value]))
  const tenureAttrition: WorkforceAnalytics["decisionSupport"]["tenureAttrition"] = tenureOrder.map((cohort) => {
    const activeCount = activeByTenure.get(cohort) ?? 0
    const exits = exitsByTenure.get(cohort) ?? 0
    const population = activeCount + exits
    return {
      cohort,
      activeEmployees: activeCount,
      exits,
      population,
      attritionRate: percent(exits, population),
      shareOfExits: percent(exits, attrition.length),
    }
  })

  const workforceImpact = buildWorkforceImpact({
    workforceEmployees: employees,
    activeEmployees,
    attrition,
    hired,
    openRequisitions,
    training,
    modelEmployees: joinedModelRecords,
    annualPayByEmployee,
    assumptions: {
      currency: analyticsSettings.currency,
      recruitingCostPerHire: normalizedFilters.recruitingCostPerHire ?? Number(analyticsSettings.recruiting_cost_per_hire),
      vacancyProductivityPercent: normalizedFilters.vacancyProductivityPercent ?? Number(analyticsSettings.vacancy_productivity_percent),
      onboardingDays: normalizedFilters.onboardingDays ?? Number(analyticsSettings.onboarding_days),
      onboardingProductivityPercent: normalizedFilters.onboardingProductivityPercent ?? Number(analyticsSettings.onboarding_productivity_percent),
      courseFeePerLearner: normalizedFilters.courseFeePerLearner ?? Number(analyticsSettings.course_fee_per_learner),
      courseHoursPerLearner: normalizedFilters.courseHoursPerLearner ?? Number(analyticsSettings.course_hours_per_learner),
    },
    policy: {
      fallbackRefillDays: Number(analyticsSettings.fallback_refill_days),
      criticalReviewShare: Number(analyticsSettings.critical_review_share),
      watchReviewShare: Number(analyticsSettings.watch_review_share),
    },
  })

  type DecisionAction = Omit<WorkforceAnalytics["decisionSupport"]["actions"][number], "workItem"> & { rank: number }
  const decisionActions: DecisionAction[] = []
  for (const row of departmentDecisionMetrics) {
    const key = row.department.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    if (row.coverageStatus === "Gap") decisionActions.push({
      id: `coverage-${key}`,
      department: row.department,
      category: "workforce_coverage",
      severity: "high",
      title: "Replacement coverage gap",
      evidence: `${row.exits} exits, ${row.hires} completed hires, and ${row.openRequisitions} open roles`,
      recommendedAction: "Reconcile approved hiring, succession coverage, and knowledge transfer for exposed roles.",
      target: "hiring",
      rank: 400 + row.exits,
    })
    if (row.exits >= 3 && row.attritionRate > attritionRate) decisionActions.push({
      id: `attrition-${key}`,
      department: row.department,
      category: "attrition",
      severity: row.attritionRate >= attritionRate + 3 ? "high" : "medium",
      title: "Attrition above company rate",
      evidence: `${row.attritionRate}% department rate versus ${attritionRate}% company rate`,
      recommendedAction: "Review exit reasons, tenure cohorts, and current employee evidence before choosing an intervention.",
      target: "attrition",
      rank: 300 + row.attritionRate - attritionRate,
    })
    if (row.mandatoryTrainingGaps > 0) decisionActions.push({
      id: `learning-${key}`,
      department: row.department,
      category: "mandatory_learning",
      severity: "high",
      title: "Mandatory learning incomplete",
      evidence: `${row.mandatoryTrainingGaps} incomplete mandatory learning assignments`,
      recommendedAction: "Confirm assignment ownership, access, and a completion date for each outstanding requirement.",
      target: "courses",
      rank: 200 + row.mandatoryTrainingGaps,
    })
    if (row.mobilityReviewCount > 0 && row.mobilityReviewShare > companyDecisionMetrics.mobilityReviewShare) decisionActions.push({
      id: `mobility-${key}`,
      department: row.department,
      category: "mobility",
      severity: "medium",
      title: "Mobility review above company share",
      evidence: `${row.mobilityReviewCount} employees (${row.mobilityReviewShare}%) meet the tenure and no-promotion-record definition`,
      recommendedAction: "Validate promotion history and discuss career interests through the normal talent-review process.",
      target: "people",
      rank: 100 + row.mobilityReviewShare - companyDecisionMetrics.mobilityReviewShare,
    })
  }
  for (const role of workforceImpact.roles.filter((row) => row.continuityStatus === "Critical").slice(0, 3)) {
    const key = `${role.department}-${role.jobTitle}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    decisionActions.push({
      id: `role-continuity-${key}`,
      department: role.department,
      category: "workforce_coverage",
      severity: "high",
      title: `${role.jobTitle} continuity review`,
      evidence: `${role.activeEmployees} active, ${role.recordedExits} exits, ${role.openRequisitions} open roles, and ${role.refillDays} estimated refill days`,
      recommendedAction: "Confirm a named backup and knowledge-transfer plan, then reconcile succession and approved hiring coverage.",
      target: "hiring",
      rank: 500 + role.reviewWeightedExposure / 10_000,
    })
  }
  const insightWorkflowRows = await database.prepare(`
        SELECT id, source_entity_id, status, owner_email, due_at, created_at, completed_at
        FROM workflow_requests
        WHERE type='insight'
        ORDER BY created_at DESC, id DESC
      `).all<Record<string, string | null>>()
  const latestInsightWorkflow = new Map<string, Record<string, string | null>>()
  for (const workflow of insightWorkflowRows.results ?? []) {
    const sourceId = workflow.source_entity_id
    if (sourceId && !latestInsightWorkflow.has(sourceId)) latestInsightWorkflow.set(sourceId, workflow)
  }
  const workflowStatus = (status: string | null): "pending" | "in_progress" | "completed" => {
    const normalized = status?.toLowerCase().replaceAll(" ", "_")
    return normalized === "in_progress" ? "in_progress" : normalized === "completed" ? "completed" : "pending"
  }
  const actions: WorkforceAnalytics["decisionSupport"]["actions"] = decisionActions
    .sort((left, right) => right.rank - left.rank || left.department.localeCompare(right.department))
    .map((action) => {
      const workflow = latestInsightWorkflow.get(action.id)
      return {
        id: action.id,
        department: action.department,
        category: action.category,
        severity: action.severity,
        title: action.title,
        evidence: action.evidence,
        recommendedAction: action.recommendedAction,
        target: action.target,
        workItem: workflow ? {
          id: String(workflow.id),
          status: workflowStatus(workflow.status),
          ownerEmail: workflow.owner_email,
          dueAt: workflow.due_at,
          createdAt: String(workflow.created_at),
          completedAt: workflow.completed_at,
        } : null,
      }
    })

  const managerGroups = new Map<string, { managerId: string | null; manager: string; department: string; exits: number; voluntaryExits: number }>()
  for (const exit of operatingAttrition) {
    const employee = employeeMap.get(exit.employee_id)
    if (!employee?.manager || /^(none|not specified|n\/a)$/i.test(employee.manager)) continue
    const key = employee.manager_id || `${employee.manager}::${employee.department}`
    const current = managerGroups.get(key) ?? { managerId: employee.manager_id, manager: employee.manager, department: employee.department, exits: 0, voluntaryExits: 0 }
    current.exits += 1
    if (exit.exit_type.toLowerCase() === "voluntary") current.voluntaryExits += 1
    managerGroups.set(key, current)
  }
  const managerExitConcentration: WorkforceAnalytics["operatingSignals"]["managerExitConcentration"] = [...managerGroups.values()].map((row) => {
    const activeTeamSize = activeEmployees.filter((employee) => row.managerId ? employee.manager_id === row.managerId : employee.manager === row.manager && employee.department === row.department).length
    const departmentExits = operatingExitByDepartment.get(row.department) ?? 0
    return { ...row, activeTeamSize, shareOfDepartmentExits: percent(row.exits, departmentExits) }
  }).sort((left, right) => right.exits - left.exits || right.voluntaryExits - left.voluntaryExits || left.manager.localeCompare(right.manager)).slice(0, 10)

  const insights: string[] = []
  if (attritionByDepartment[0]) insights.push(`${attritionByDepartment[0].label} recorded the most exits (${attritionByDepartment[0].value}) in the selected period; compare exit reasons and manager cohorts before intervening.`)
  if (hiringBySource[0]) insights.push(`${hiringBySource[0].label} produced the most hires (${hiringBySource[0].value}); effectiveness should also be evaluated against time-to-hire and quality-of-hire.`)
  if (leaveByDepartment[0]) insights.push(`${leaveByDepartment[0].label} used the most approved leave (${leaveByDepartment[0].value} days); inspect leave type and staffing coverage rather than treating leave use as a performance signal.`)
  const incomplete = training.length - completedTraining.length
  if (incomplete) insights.push(`${incomplete} learning assignments are incomplete, including ${training.filter((record) => record.completion_status.toLowerCase() !== "completed" && mandatoryTraining(record)).length} mandatory assignments.`)
  if (withoutPromotion) insights.push(`${withoutPromotion} active employees with at least three years of tenure have no promotion in the selected data; review career paths and data completeness.`)

  return {
    generatedAt: new Date().toISOString(),
    calculationBasis: {
      asOfDate: today,
      reportingWindow: `${operatingFrom} to ${operatingTo}`,
      headcount: "Current active and on-leave employee snapshot after department and location filters.",
      eventMetrics: "Hires, exits, leave, learning, and promotions use persisted event dates inside the reporting window; open roles are a current snapshot.",
      costMetrics: "Scenario estimates use current compensation coverage, observed refill time, and workspace assumptions.",
    },
    filters: normalizedFilters,
    dimensions: {
      departments: unique([...allEmployees.map((record) => record.department), ...allHiring.map((record) => record.department)]),
      jobTitles: unique([...allEmployees.map((record) => record.job_title), ...allHiring.map((record) => record.position)]),
      locations: unique([...allEmployees.map((record) => record.location), ...allHiring.map((record) => record.location)]),
      leaveTypes: unique(allLeave.map((record) => record.leave_type)),
    },
    status,
    kpis: {
      totalEmployees: employees.length,
      activeEmployees: activeEmployees.length,
      hires: hired.length,
      averageTimeToHire: average(hired.map((record) => record.time_to_hire_days)),
      attritionRate,
      leaveDays: Number(approvedLeave.reduce((sum, record) => sum + record.leave_days, 0).toFixed(1)),
      trainingCompletionRate: percent(completedTraining.length, training.length),
      promotions: promotions.length,
    },
    employeeAnalytics: {
      total: employees.length,
      active: employees.filter((record) => record.employment_status.toLowerCase() === "active").length,
      onLeave: employees.filter((record) => record.employment_status.toLowerCase() === "on leave").length,
      preboarding: employees.filter((record) => record.employment_status.toLowerCase() === "preboarding").length,
      terminated: employees.filter((record) => record.employment_status.toLowerCase() === "terminated").length,
      byDepartment: employeeByDepartment,
      activeByDepartment: groupBy(activeEmployees, (record) => record.department),
      byJobTitle: groupBy(employees, (record) => record.job_title),
      byLocation: groupBy(employees, (record) => record.location),
      byStatus: groupBy(employees, (record) => record.employment_status),
      byEmploymentType: groupBy(employees, (record) => record.employment_type || "Not specified"),
      byTenure: groupBy(employees, (record) => record.tenure_years < 1 ? "< 1 year" : record.tenure_years < 3 ? "1–2 years" : record.tenure_years < 5 ? "3–4 years" : "5+ years"),
      managerSpan,
      rows: outputRows(employees, 500),
    },
    hiring: {
      totalHired: hired.length,
      activeRequisitions: activeHiring.length,
      offers: activeHiring.filter((record) => record.recruitment_status.toLowerCase() === "offer").length,
      averageTimeToHire: average(hired.map((record) => record.time_to_hire_days)),
      trend: trend(hired, (record) => record.hiring_date, normalizedFilters.period),
      requisitionTrend: trend(requisitions, (record) => record.application_date, normalizedFilters.period),
      byDepartment: groupBy(hired, (record) => record.department),
      pipelineByDepartment: groupBy(activeHiring, (record) => record.department),
      byRole: groupBy(hired, (record) => record.position),
      bySource: hiringBySource,
      byLocation: groupBy(hiring, (record) => record.location),
      sourceStats,
      statuses: groupBy(hiring, (record) => record.recruitment_status),
      rows: outputRows(hiring, 250),
    },
    attrition: {
      totalExits: attrition.length,
      rate: attritionRate,
      voluntary: attrition.filter((record) => record.exit_type.toLowerCase() === "voluntary").length,
      involuntary: attrition.filter((record) => record.exit_type.toLowerCase() === "involuntary").length,
      trend: trend(attrition, (record) => record.exit_date, normalizedFilters.period),
      byDepartment: attritionByDepartment,
      byExitReason: groupBy(attrition, (record) => record.exit_reason),
      byRole: groupBy(attrition, (record) => employeeMap.get(record.employee_id)?.job_title ?? "Unknown"),
      byTenure: groupBy(attrition, (record) => record.tenure_years < 1 ? "< 1 year" : record.tenure_years < 3 ? "1–2 years" : record.tenure_years < 5 ? "3–4 years" : "5+ years"),
      highRiskEmployees,
      employeeRecords: outputRows(joinedModelRecords, 350),
      rows: outputRows(attrition, 250),
    },
    leave: {
      totalRequests: leave.length,
      totalDays: Number(approvedLeave.reduce((sum, record) => sum + record.leave_days, 0).toFixed(1)),
      averageDaysPerEmployee: Number((approvedLeave.reduce((sum, record) => sum + record.leave_days, 0) / Math.max(1, new Set(approvedLeave.map((record) => record.employee_id)).size)).toFixed(1)),
      pending: leave.filter((record) => record.approval_status.toLowerCase() === "pending").length,
      approved: approvedLeave.length,
      rejected: leave.filter((record) => record.approval_status.toLowerCase() === "rejected").length,
      currentlyAway: currentlyAway.slice(0, 100),
      upcoming: upcomingLeave.slice(0, 100),
      trend: trend(approvedLeave, (record) => record.start_date, normalizedFilters.period, (record) => record.leave_days),
      byType: groupBy(approvedLeave, (record) => record.leave_type, (record) => record.leave_days),
      byDepartment: leaveByDepartment,
      statuses: groupBy(leave, (record) => record.approval_status),
      rows: outputRows(leave, 250),
    },
    training: {
      totalAssignments: training.length,
      completionRate: percent(completedTraining.length, training.length),
      totalHours: Number(training.reduce((sum, record) => sum + record.training_hours, 0).toFixed(1)),
      averageScore: average(completedTraining.map((record) => record.assessment_score)),
      requiringMandatoryTraining: training.filter((record) => record.completion_status.toLowerCase() !== "completed" && mandatoryTraining(record)).length,
      trend: trend(completedTraining, (record) => record.completion_date, normalizedFilters.period, (record) => record.training_hours),
      byDepartment: trainingByDepartment,
      byProgram: groupBy(training, (record) => record.training_program, (record) => record.training_hours),
      statuses: groupBy(training, (record) => record.completion_status),
      rows: outputRows(training, 250),
    },
    promotions: {
      total: promotions.length,
      rate: percent(promotions.length, activeEmployees.length),
      averageMonthsToPromotion: average(promotions.map((record) => record.months_since_previous_promotion)),
      withoutPromotionOver36Months: withoutPromotion,
      trend: trend(promotions, (record) => record.promotion_date, normalizedFilters.period),
      byDepartment: promotionByDepartment,
      mobilityReview,
      rows: outputRows(promotions, 250),
    },
    operatingSignals: {
      windowLabel: operatingWindowLabel,
      managerExitConcentration,
      replacementCoverage,
    },
    decisionSupport: {
      company: companyDecisionMetrics,
      departments: departmentDecisionMetrics,
      tenureAttrition,
      workforceImpact,
      actions,
    },
    employees: outputRows(employees, 500),
    directoryEmployees: outputRows(directoryEmployees, 500),
    executiveInsights: insights.slice(0, 5),
  }
}

/**
 * Dashboard projection of the workforce model.
 *
 * The full analytics object intentionally remains available to exports, model
 * review and server-side agents. Interactive dashboards only need aggregates
 * and their bounded worklists, so raw domain rows are removed before the
 * response crosses the network.
 */
export async function getWorkforceDashboardAnalytics(filters: HrFilters = {}): Promise<WorkforceAnalytics> {
  const analytics = await getWorkforceAnalytics(filters, { rowLimit: 0 })
  return {
    ...analytics,
    employeeAnalytics: { ...analytics.employeeAnalytics, rows: [] },
    hiring: { ...analytics.hiring, rows: [] },
    attrition: { ...analytics.attrition, employeeRecords: [], rows: [] },
    leave: { ...analytics.leave, currentlyAway: [], upcoming: [], rows: [] },
    training: { ...analytics.training, rows: [] },
    promotions: { ...analytics.promotions, mobilityReview: [], rows: [] },
    employees: [],
    directoryEmployees: [],
  }
}

export function filtersFromSearchParams(params: URLSearchParams): HrFilters {
  const period = params.get("period")
  const boundedNumber = (name: string, minimum: number, maximum: number): number | undefined => {
    const raw = params.get(name)
    if (raw === null || raw.trim() === "") return undefined
    const value = Number(raw)
    return Number.isFinite(value) && value >= minimum && value <= maximum ? value : undefined
  }
  return {
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    department: params.get("department") || undefined,
    jobTitle: params.get("jobTitle") || undefined,
    location: params.get("location") || undefined,
    leaveType: params.get("leaveType") || undefined,
    dataMode: params.get("dataMode") === "live" ? "live" : "all",
    period: period === "quarter" || period === "year" ? period : "month",
    recruitingCostPerHire: boundedNumber("recruitingCostPerHire", 0, 250_000),
    vacancyProductivityPercent: boundedNumber("vacancyProductivityPercent", 0, 100),
    onboardingDays: boundedNumber("onboardingDays", 0, 730),
    onboardingProductivityPercent: boundedNumber("onboardingProductivityPercent", 0, 100),
    courseFeePerLearner: boundedNumber("courseFeePerLearner", 0, 100_000),
    courseHoursPerLearner: boundedNumber("courseHoursPerLearner", 0.5, 500),
  }
}
