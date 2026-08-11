import type {
  AttritionEmployeeRecord,
  AttritionRecord,
  EmployeeRecord,
  HiringRecord,
  TrainingRecord,
  WorkforceAnalytics,
  WorkforceCostAssumptions,
} from "@/lib/hr-types"

type ImpactInput = {
  workforceEmployees: EmployeeRecord[]
  activeEmployees: EmployeeRecord[]
  attrition: AttritionRecord[]
  hired: HiringRecord[]
  openRequisitions: HiringRecord[]
  training: TrainingRecord[]
  modelEmployees: AttritionEmployeeRecord[]
  annualPayByEmployee: Map<string, number>
  assumptions: WorkforceCostAssumptions
  policy: {
    fallbackRefillDays: number
    criticalReviewShare: number
    watchReviewShare: number
  }
}

type RefillEstimate = {
  days: number
  basis: "role" | "department" | "company" | "policy"
}

const DAYS_PER_WORK_YEAR = 260

function average(values: number[]): number {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0)
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0
}

function money(value: number): number {
  return Math.round(Number.isFinite(value) ? value : 0)
}

function percent(numerator: number, denominator: number): number {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 0
}

function roleKey(department: string, jobTitle: string): string {
  return `${department.trim().toLowerCase()}::${jobTitle.trim().toLowerCase()}`
}

export function calculateReplacementCost(
  annualPay: number,
  refillDays: number,
  assumptions: WorkforceCostAssumptions,
): { direct: number; vacancy: number; onboarding: number; total: number } {
  const dailyPay = annualPay / DAYS_PER_WORK_YEAR
  const direct = assumptions.recruitingCostPerHire
  const vacancy = dailyPay * refillDays * (assumptions.vacancyProductivityPercent / 100)
  const onboarding = dailyPay * assumptions.onboardingDays * (assumptions.onboardingProductivityPercent / 100)
  const roundedDirect = money(direct)
  const roundedVacancy = money(vacancy)
  const roundedOnboarding = money(onboarding)
  return {
    direct: roundedDirect,
    vacancy: roundedVacancy,
    onboarding: roundedOnboarding,
    total: roundedDirect + roundedVacancy + roundedOnboarding,
  }
}

export function calculateContinuityStatus(input: {
  active: number
  exits: number
  hires: number
  openRoles: number
  reviewShare: number
  refillDays: number
}, policy: ImpactInput["policy"]): "Critical" | "Watch" | "Covered" {
  const uncoveredExits = Math.max(0, input.exits - input.hires - input.openRoles)
  const uncoveredShare = input.active ? uncoveredExits / input.active : uncoveredExits
  if ((input.active <= 3 && input.exits > 0 && input.openRoles === 0)
    || (uncoveredExits > 0 && (uncoveredShare >= 0.05 || input.refillDays >= 60))) return "Critical"
  if ((input.active <= 1 && input.openRoles === 0)
    || uncoveredExits > 0
    || input.exits > input.hires + input.openRoles
    || input.refillDays >= 60
    || (input.reviewShare >= policy.criticalReviewShare && input.openRoles === 0)
    || (input.reviewShare >= policy.watchReviewShare && input.exits > 0)) return "Watch"
  return "Covered"
}

export function buildWorkforceImpact(input: ImpactInput): WorkforceAnalytics["decisionSupport"]["workforceImpact"] {
  const activeIds = new Set(input.activeEmployees.map((employee) => employee.employee_id))
  const activeModelEmployees = input.modelEmployees.filter((employee) => activeIds.has(employee.employeeId))
  const allModelByEmployee = new Map(input.modelEmployees.map((employee) => [employee.employeeId, employee]))
  const workforceByEmployee = new Map(input.workforceEmployees.map((employee) => [employee.employee_id, employee]))
  const modelByEmployee = new Map(activeModelEmployees.map((employee) => [employee.employeeId, employee]))
  const reviewedEmployees = activeModelEmployees.filter((employee) => employee.riskLevel === "high")

  const completedFillDays = input.hired
    .map((record) => Number(record.time_to_hire_days))
    .filter((value) => Number.isFinite(value) && value > 0)
  const observedCompanyFillDays = average(completedFillDays)
  const companyFillDays = Math.round(observedCompanyFillDays || input.policy.fallbackRefillDays)
  const fillByRole = new Map<string, number[]>()
  const fillByDepartment = new Map<string, number[]>()
  for (const record of input.hired) {
    const days = Number(record.time_to_hire_days)
    if (!Number.isFinite(days) || days <= 0) continue
    const key = roleKey(record.department, record.position)
    fillByRole.set(key, [...(fillByRole.get(key) ?? []), days])
    fillByDepartment.set(record.department, [...(fillByDepartment.get(record.department) ?? []), days])
  }
  const refillFor = (department: string, jobTitle: string): RefillEstimate => {
    const roleDays = average(fillByRole.get(roleKey(department, jobTitle)) ?? [])
    if (roleDays) return { days: Math.round(roleDays), basis: "role" }
    const departmentDays = average(fillByDepartment.get(department) ?? [])
    if (departmentDays) return { days: Math.round(departmentDays), basis: "department" }
    return { days: companyFillDays, basis: observedCompanyFillDays ? "company" : "policy" }
  }

  const activeByRole = new Map<string, EmployeeRecord[]>()
  for (const employee of input.activeEmployees) {
    const key = roleKey(employee.department, employee.job_title)
    activeByRole.set(key, [...(activeByRole.get(key) ?? []), employee])
  }
  const exitsByRole = new Map<string, number>()
  for (const event of input.attrition) {
    const employee = workforceByEmployee.get(event.employee_id)
    if (!employee) continue
    const key = roleKey(employee.department, employee.job_title)
    exitsByRole.set(key, (exitsByRole.get(key) ?? 0) + 1)
  }
  const hiresByRole = new Map<string, number>()
  for (const record of input.hired) {
    const key = roleKey(record.department, record.position)
    hiresByRole.set(key, (hiresByRole.get(key) ?? 0) + 1)
  }
  const openByRole = new Map<string, number>()
  for (const record of input.openRequisitions) {
    const key = roleKey(record.department, record.position)
    openByRole.set(key, (openByRole.get(key) ?? 0) + 1)
  }

  const statusRank = { Critical: 0, Watch: 1, Covered: 2 }
  const roles: WorkforceAnalytics["decisionSupport"]["workforceImpact"]["roles"] = [...activeByRole.entries()].map(([key, employees]) => {
    const { department, job_title: jobTitle } = employees[0]
    const modelRows = employees.map((employee) => modelByEmployee.get(employee.employee_id)).filter((row): row is AttritionEmployeeRecord => Boolean(row))
    const reviewRows = modelRows.filter((employee) => employee.riskLevel === "high")
    const annualPayRows = employees.map((employee) => input.annualPayByEmployee.get(employee.employee_id) ?? 0).filter((value) => value > 0)
    const averageAnnualPay = average(annualPayRows)
    const refill = refillFor(department, jobTitle)
    const costs = calculateReplacementCost(averageAnnualPay, refill.days, input.assumptions)
    const reviewWeightedExposure = reviewRows.reduce((sum, employee) => {
      const employeeCost = calculateReplacementCost(input.annualPayByEmployee.get(employee.employeeId) ?? 0, refill.days, input.assumptions).total
      return sum + employeeCost * (employee.riskScore / 100)
    }, 0)
    const recordedExits = exitsByRole.get(key) ?? 0
    const completedHires = hiresByRole.get(key) ?? 0
    const openRequisitions = openByRole.get(key) ?? 0
    const reviewShare = percent(reviewRows.length, modelRows.length || employees.length)
    return {
      department,
      jobTitle,
      activeEmployees: employees.length,
      recordedExits,
      completedHires,
      openRequisitions,
      reviewProfiles: reviewRows.length,
      reviewShare,
      meanModelRisk: Number(average(modelRows.map((employee) => employee.riskScore)).toFixed(1)),
      averageAnnualPay: money(averageAnnualPay),
      payDataCoverage: percent(annualPayRows.length, employees.length),
      refillDays: refill.days,
      refillBasis: refill.basis,
      directRecruitingCost: costs.direct,
      vacancyCost: costs.vacancy,
      onboardingCost: costs.onboarding,
      replacementCostPerExit: costs.total,
      reviewWeightedExposure: money(reviewWeightedExposure),
      continuityStatus: calculateContinuityStatus({ active: employees.length, exits: recordedExits, hires: completedHires, openRoles: openRequisitions, reviewShare, refillDays: refill.days }, input.policy),
    }
  }).sort((left, right) => statusRank[left.continuityStatus] - statusRank[right.continuityStatus]
    || right.reviewWeightedExposure - left.reviewWeightedExposure
    || right.recordedExits - left.recordedExits
    || left.jobTitle.localeCompare(right.jobTitle))

  const roleByKey = new Map(roles.map((role) => [roleKey(role.department, role.jobTitle), role]))
  const incompleteTrainingByEmployee = new Map<string, TrainingRecord[]>()
  for (const assignment of input.training.filter((record) => record.completion_status.toLowerCase() !== "completed")) {
    incompleteTrainingByEmployee.set(assignment.employee_id, [...(incompleteTrainingByEmployee.get(assignment.employee_id) ?? []), assignment])
  }
  const directReports = new Map<string, number>()
  for (const employee of input.activeEmployees) {
    if (employee.manager_id) directReports.set(employee.manager_id, (directReports.get(employee.manager_id) ?? 0) + 1)
  }

  const employees: WorkforceAnalytics["decisionSupport"]["workforceImpact"]["employees"] = reviewedEmployees.map((employee) => {
    const role = roleByKey.get(roleKey(employee.department, employee.jobTitle))
    const refill = refillFor(employee.department, employee.jobTitle)
    const annualPay = input.annualPayByEmployee.get(employee.employeeId) ?? 0
    const costs = calculateReplacementCost(annualPay, refill.days, input.assumptions)
    const hourlyPay = annualPay / 2080
    const proposedLearningInvestment = money(input.assumptions.courseFeePerLearner + hourlyPay * input.assumptions.courseHoursPerLearner)
    const incompleteAssignments = incompleteTrainingByEmployee.get(employee.employeeId)?.length ?? 0
    return {
      employeeId: employee.employeeId,
      name: employee.name,
      department: employee.department,
      jobTitle: employee.jobTitle,
      location: employee.location,
      manager: employee.manager,
      employmentStatus: employee.employmentStatus,
      riskScore: employee.riskScore,
      riskLevel: employee.riskLevel,
      topDriver: employee.topDriver,
      activeRolePeers: Math.max(0, (role?.activeEmployees ?? 1) - 1),
      directReports: directReports.get(employee.employeeId) ?? 0,
      openMatchingRequisitions: role?.openRequisitions ?? 0,
      refillDays: refill.days,
      refillBasis: refill.basis,
      payDataAvailable: annualPay > 0,
      annualPay: money(annualPay),
      directRecruitingCost: costs.direct,
      vacancyCost: costs.vacancy,
      onboardingCost: costs.onboarding,
      replacementCost: costs.total,
      reviewWeightedExposure: money(costs.total * (employee.riskScore / 100)),
      incompleteLearningAssignments: incompleteAssignments,
      proposedLearningInvestment,
      learningBreakEvenPercent: costs.total ? Number((proposedLearningInvestment / costs.total * 100).toFixed(1)) : 0,
      continuityStatus: role?.continuityStatus ?? "Covered",
    }
  }).sort((left, right) => statusRank[left.continuityStatus] - statusRank[right.continuityStatus]
    || right.reviewWeightedExposure - left.reviewWeightedExposure
    || right.riskScore - left.riskScore)
    .slice(0, 100)

  const learningCases: WorkforceAnalytics["decisionSupport"]["workforceImpact"]["learningCases"] = [...new Set(reviewedEmployees.map((employee) => employee.department))].map((department) => {
    const reviewRows = reviewedEmployees.filter((employee) => employee.department === department)
    const assignments = reviewRows.flatMap((employee) => incompleteTrainingByEmployee.get(employee.employeeId) ?? [])
    const employeesWithGap = new Set(assignments.map((assignment) => assignment.employee_id))
    const programCounts = new Map<string, number>()
    for (const assignment of assignments) programCounts.set(assignment.training_program, (programCounts.get(assignment.training_program) ?? 0) + 1)
    const proposedLearningInvestment = [...employeesWithGap].reduce((sum, employeeId) => {
      const model = modelByEmployee.get(employeeId)
      const hourlyPay = model ? (input.annualPayByEmployee.get(model.employeeId) ?? 0) / 2080 : 0
      return sum + input.assumptions.courseFeePerLearner + hourlyPay * input.assumptions.courseHoursPerLearner
    }, 0)
    const replacementScenario = [...employeesWithGap].reduce((sum, employeeId) => {
      const model = modelByEmployee.get(employeeId)
      if (!model) return sum
      const refill = refillFor(model.department, model.jobTitle)
      return sum + calculateReplacementCost(input.annualPayByEmployee.get(model.employeeId) ?? 0, refill.days, input.assumptions).total
    }, 0)
    const reviewWeightedExposure = [...employeesWithGap].reduce((sum, employeeId) => {
      const model = modelByEmployee.get(employeeId)
      if (!model) return sum
      const refill = refillFor(model.department, model.jobTitle)
      return sum + calculateReplacementCost(input.annualPayByEmployee.get(model.employeeId) ?? 0, refill.days, input.assumptions).total * (model.riskScore / 100)
    }, 0)
    const leadingProgram = [...programCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
    return {
      department,
      employeesInReview: reviewRows.length,
      employeesWithLearningGap: employeesWithGap.size,
      incompleteAssignments: assignments.length,
      assignedHours: Number(assignments.reduce((sum, assignment) => sum + assignment.training_hours, 0).toFixed(1)),
      proposedLearningInvestment: money(proposedLearningInvestment),
      replacementScenario: money(replacementScenario),
      reviewWeightedExposure: money(reviewWeightedExposure),
      breakEvenPercent: replacementScenario ? Number((proposedLearningInvestment / replacementScenario * 100).toFixed(1)) : null,
      leadingProgram,
      decision: assignments.length ? "Assess skill fit" as const : "No linked gap" as const,
    }
  }).sort((left, right) => right.reviewWeightedExposure - left.reviewWeightedExposure || left.department.localeCompare(right.department))

  const today = new Date().toISOString().slice(0, 10)
  const activeTraining = input.training.filter((assignment) => activeIds.has(assignment.employee_id))
  const capabilityDepartments = [...new Set([
    ...input.activeEmployees.map((employee) => employee.department),
    ...activeTraining.map((assignment) => assignment.department),
  ])].filter(Boolean)
  const capabilityPlans: WorkforceAnalytics["decisionSupport"]["workforceImpact"]["capabilityPlans"] = capabilityDepartments.map((department) => {
    const departmentEmployees = input.activeEmployees.filter((employee) => employee.department === department)
    const assignments = activeTraining.filter((assignment) => assignment.department === department)
    const completed = assignments.filter((assignment) => assignment.completion_status.toLowerCase() === "completed")
    const incomplete = assignments.filter((assignment) => assignment.completion_status.toLowerCase() !== "completed")
    const mandatory = incomplete.filter((assignment) => Boolean(Number(assignment.is_mandatory)))
    const overdueMandatory = mandatory.filter((assignment) => Boolean(assignment.due_date && assignment.due_date.slice(0, 10) < today))
    const programCounts = new Map<string, number>()
    for (const assignment of incomplete) {
      programCounts.set(assignment.training_program, (programCounts.get(assignment.training_program) ?? 0) + 1)
    }
    const estimatedRemainingCost = incomplete.reduce((sum, assignment) => {
      const annualPay = input.annualPayByEmployee.get(assignment.employee_id) ?? 0
      const hours = assignment.training_hours > 0 ? assignment.training_hours : input.assumptions.courseHoursPerLearner
      return sum + input.assumptions.courseFeePerLearner + (annualPay / 2080) * hours
    }, 0)
    const status = overdueMandatory.length > 0 ? "Overdue required" as const
      : mandatory.length > 0 ? "Required work open" as const
        : incomplete.length > 0 ? "Follow up" as const
          : "On track" as const
    return {
      department,
      activeEmployees: departmentEmployees.length,
      assignedEmployees: new Set(assignments.map((assignment) => assignment.employee_id)).size,
      totalAssignments: assignments.length,
      completedAssignments: completed.length,
      completionRate: percent(completed.length, assignments.length),
      incompleteEmployees: new Set(incomplete.map((assignment) => assignment.employee_id)).size,
      incompleteAssignments: incomplete.length,
      mandatoryGaps: mandatory.length,
      overdueMandatoryGaps: overdueMandatory.length,
      remainingHours: Number(incomplete.reduce((sum, assignment) => sum + (assignment.training_hours > 0 ? assignment.training_hours : input.assumptions.courseHoursPerLearner), 0).toFixed(1)),
      estimatedRemainingCost: money(estimatedRemainingCost),
      leadingProgram: [...programCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null,
      status,
    }
  }).sort((left, right) => {
    const rank = { "Overdue required": 0, "Required work open": 1, "Follow up": 2, "On track": 3 }
    return rank[left.status] - rank[right.status]
      || right.overdueMandatoryGaps - left.overdueMandatoryGaps
      || right.mandatoryGaps - left.mandatoryGaps
      || left.department.localeCompare(right.department)
  })

  const payDataCoverage = percent(input.activeEmployees.filter((employee) => (input.annualPayByEmployee.get(employee.employee_id) ?? 0) > 0).length, input.activeEmployees.length)
  const recordedExitCosts = input.attrition.map((event) => {
    const employee = workforceByEmployee.get(event.employee_id)
    const annualPay = input.annualPayByEmployee.get(event.employee_id) ?? 0
    if (!employee || !annualPay) return 0
    const refill = refillFor(employee.department, employee.job_title)
    return calculateReplacementCost(annualPay, refill.days, input.assumptions).total
  }).filter((value) => value > 0)
  const reviewWeightedExposure = employees.reduce((sum, employee) => sum + employee.reviewWeightedExposure, 0)

  return {
    assumptions: input.assumptions,
    summary: {
      payDataCoverage,
      estimatedCostOfRecordedExits: money(recordedExitCosts.reduce((sum, value) => sum + value, 0)),
      averageReplacementCost: money(average(recordedExitCosts)),
      reviewWeightedExposure: money(reviewWeightedExposure),
      rolesNeedingContinuityReview: roles.filter((role) => role.continuityStatus !== "Covered").length,
    },
    roles: roles.slice(0, 30),
    employees,
    learningCases,
    capabilityPlans,
  }
}
