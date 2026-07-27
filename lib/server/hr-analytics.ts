import type {
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
import { ensureHrDatabase, readDomainRows } from "@/lib/server/hr-database"
import { getEmployees as getScoredEmployees } from "@/lib/server/runtime"

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
    const mode = rows.length === 0 ? "empty" : sources.size > 1 ? "mixed" : sources.has("imported") ? "imported" : "demo"
    return { domain, count: rows.length, mode, lastImport: latest.get(domain) ?? null }
  })
}

export async function getWorkforceAnalytics(filters: HrFilters = {}): Promise<WorkforceAnalytics> {
  const normalizedFilters: WorkforceAnalytics["filters"] = { ...filters, period: filters.period ?? "month" }
  const [employeeRows, hiringRows, attritionRows, leaveRows, trainingRows, promotionRows] = await Promise.all([
    readDomainRows("employees"),
    readDomainRows("hiring"),
    readDomainRows("attrition"),
    readDomainRows("leave"),
    readDomainRows("training"),
    readDomainRows("promotions"),
  ])

  const allEmployees = employeeRows as unknown as EmployeeRecord[]
  const allHiring = hiringRows as unknown as HiringRecord[]
  const allAttrition = attritionRows as unknown as AttritionRecord[]
  const allLeave = leaveRows as unknown as LeaveRecord[]
  const allTraining = trainingRows as unknown as TrainingRecord[]
  const allPromotions = promotionRows as unknown as PromotionRecord[]
  const employeeMap = new Map(allEmployees.map((employee) => [employee.employee_id, employee]))

  const employees = allEmployees.filter((employee) => matchesEmployee(employee, normalizedFilters))
  const hiring = allHiring.filter((record) => {
    if (!inRange(record.hiring_date ?? record.application_date, normalizedFilters)) return false
    if (normalizedFilters.department && record.department !== normalizedFilters.department) return false
    if (normalizedFilters.jobTitle && record.position !== normalizedFilters.jobTitle) return false
    if (normalizedFilters.location && record.location !== normalizedFilters.location) return false
    return true
  })
  const attrition = allAttrition.filter((record) => inRange(record.exit_date, normalizedFilters) && matchesEmployee(employeeMap.get(record.employee_id), normalizedFilters) && (!normalizedFilters.department || record.department === normalizedFilters.department))
  const leave = allLeave.filter((record) => inRange(record.start_date, normalizedFilters) && matchesEmployee(employeeMap.get(record.employee_id), normalizedFilters) && (!normalizedFilters.department || record.department === normalizedFilters.department))
  const training = allTraining.filter((record) => (!record.completion_date || inRange(record.completion_date, normalizedFilters)) && matchesEmployee(employeeMap.get(record.employee_id), normalizedFilters) && (!normalizedFilters.department || record.department === normalizedFilters.department))
  const promotions = allPromotions.filter((record) => inRange(record.promotion_date, normalizedFilters) && matchesEmployee(employeeMap.get(record.employee_id), normalizedFilters) && (!normalizedFilters.department || record.department === normalizedFilters.department))

  const hired = hiring.filter((record) => record.recruitment_status.toLowerCase() === "hired" && record.hiring_date)
  const approvedLeave = leave.filter((record) => record.approval_status.toLowerCase() === "approved")
  const completedTraining = training.filter((record) => record.completion_status.toLowerCase() === "completed")
  const activeEmployees = employees.filter((employee) => employee.employment_status.toLowerCase() !== "terminated")
  const attritionRate = percent(attrition.length, activeEmployees.length + attrition.length)
  const promotedIds = new Set(promotions.map((promotion) => promotion.employee_id))
  const withoutPromotion = activeEmployees.filter((employee) => employee.tenure_years >= 3 && !promotedIds.has(employee.employee_id)).length
  const highRiskEmployees = getScoredEmployees({ risk: "high", limit: 40 }).items
    .filter((employee) => !normalizedFilters.department || employee.department === normalizedFilters.department)
    .filter((employee) => !normalizedFilters.jobTitle || employee.role === normalizedFilters.jobTitle)
    .slice(0, 12)
    .map((employee) => ({ id: employee.id, department: employee.department, role: employee.role, riskScore: employee.riskScore, topDriver: employee.topDriver }))

  const hiringBySource = groupBy(hired, (record) => record.hiring_source)
  const attritionByDepartment = groupBy(attrition, (record) => record.department)
  const leaveByDepartment = groupBy(approvedLeave, (record) => record.department, (record) => record.leave_days)
  const trainingByDepartment = groupBy(training, (record) => record.department, (record) => record.training_hours)
  const promotionByDepartment = groupBy(promotions, (record) => record.department)
  const status = await getDomainStatus({ employees: employeeRows, hiring: hiringRows, attrition: attritionRows, leave: leaveRows, training: trainingRows, promotions: promotionRows })

  const insights: string[] = []
  if (attritionByDepartment[0]) insights.push(`${attritionByDepartment[0].label} recorded the most exits (${attritionByDepartment[0].value}) in the selected period; compare exit reasons and manager cohorts before intervening.`)
  if (hiringBySource[0]) insights.push(`${hiringBySource[0].label} produced the most hires (${hiringBySource[0].value}); effectiveness should also be evaluated against time-to-hire and quality-of-hire.`)
  if (leaveByDepartment[0]) insights.push(`${leaveByDepartment[0].label} used the most approved leave (${leaveByDepartment[0].value} days); inspect leave type and staffing coverage rather than treating leave use as a performance signal.`)
  const incomplete = training.length - completedTraining.length
  if (incomplete) insights.push(`${incomplete} training assignments are incomplete, including ${training.filter((record) => record.completion_status.toLowerCase() !== "completed" && /security|safety/i.test(record.training_program)).length} mandatory security or safety assignments.`)
  if (withoutPromotion) insights.push(`${withoutPromotion} active employees with at least three years of tenure have no promotion in the selected data; review career paths and data completeness.`)

  return {
    generatedAt: new Date().toISOString(),
    filters: normalizedFilters,
    dimensions: {
      departments: unique([...allEmployees.map((record) => record.department), ...allHiring.map((record) => record.department)]),
      jobTitles: unique([...allEmployees.map((record) => record.job_title), ...allHiring.map((record) => record.position)]),
      locations: unique([...allEmployees.map((record) => record.location), ...allHiring.map((record) => record.location)]),
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
    hiring: {
      totalHired: hired.length,
      averageTimeToHire: average(hired.map((record) => record.time_to_hire_days)),
      trend: trend(hired, (record) => record.hiring_date, normalizedFilters.period),
      byDepartment: groupBy(hired, (record) => record.department),
      byRole: groupBy(hired, (record) => record.position),
      bySource: hiringBySource,
      statuses: groupBy(hiring, (record) => record.recruitment_status),
      rows: hiring.slice(0, 250),
    },
    attrition: {
      totalExits: attrition.length,
      rate: attritionRate,
      voluntary: attrition.filter((record) => record.exit_type.toLowerCase() === "voluntary").length,
      involuntary: attrition.filter((record) => record.exit_type.toLowerCase() === "involuntary").length,
      trend: trend(attrition, (record) => record.exit_date, normalizedFilters.period),
      byDepartment: attritionByDepartment,
      byRole: groupBy(attrition, (record) => employeeMap.get(record.employee_id)?.job_title ?? "Unknown"),
      byTenure: groupBy(attrition, (record) => record.tenure_years < 1 ? "< 1 year" : record.tenure_years < 3 ? "1–2 years" : record.tenure_years < 5 ? "3–4 years" : "5+ years"),
      highRiskEmployees,
      rows: attrition.slice(0, 250),
    },
    leave: {
      totalDays: Number(approvedLeave.reduce((sum, record) => sum + record.leave_days, 0).toFixed(1)),
      averageDaysPerEmployee: Number((approvedLeave.reduce((sum, record) => sum + record.leave_days, 0) / Math.max(1, new Set(approvedLeave.map((record) => record.employee_id)).size)).toFixed(1)),
      pending: leave.filter((record) => record.approval_status.toLowerCase() === "pending").length,
      approved: approvedLeave.length,
      trend: trend(approvedLeave, (record) => record.start_date, normalizedFilters.period, (record) => record.leave_days),
      byType: groupBy(approvedLeave, (record) => record.leave_type, (record) => record.leave_days),
      byDepartment: leaveByDepartment,
      rows: leave.slice(0, 250),
    },
    training: {
      completionRate: percent(completedTraining.length, training.length),
      totalHours: Number(training.reduce((sum, record) => sum + record.training_hours, 0).toFixed(1)),
      averageScore: average(completedTraining.map((record) => record.assessment_score)),
      requiringMandatoryTraining: training.filter((record) => record.completion_status.toLowerCase() !== "completed" && /security|safety/i.test(record.training_program)).length,
      trend: trend(completedTraining, (record) => record.completion_date, normalizedFilters.period, (record) => record.training_hours),
      byDepartment: trainingByDepartment,
      byProgram: groupBy(training, (record) => record.training_program, (record) => record.training_hours),
      statuses: groupBy(training, (record) => record.completion_status),
      rows: training.slice(0, 250),
    },
    promotions: {
      total: promotions.length,
      rate: percent(promotions.length, activeEmployees.length),
      averageMonthsToPromotion: average(promotions.map((record) => record.months_since_previous_promotion)),
      withoutPromotionOver36Months: withoutPromotion,
      trend: trend(promotions, (record) => record.promotion_date, normalizedFilters.period),
      byDepartment: promotionByDepartment,
      rows: promotions.slice(0, 250),
    },
    employees: employees.slice(0, 500),
    executiveInsights: insights.slice(0, 5),
  }
}

export function filtersFromSearchParams(params: URLSearchParams): HrFilters {
  const period = params.get("period")
  return {
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    department: params.get("department") || undefined,
    jobTitle: params.get("jobTitle") || undefined,
    location: params.get("location") || undefined,
    period: period === "quarter" || period === "year" ? period : "month",
  }
}
