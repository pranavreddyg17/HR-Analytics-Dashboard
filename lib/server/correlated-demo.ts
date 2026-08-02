import type { HrDomain } from "@/lib/hr-types"
import type { Employee as ScoredEmployee } from "@/lib/types"

type DemoRow = Record<string, string | number | null>
type DemoDataset = Record<HrDomain, DemoRow[]>

type DemoModelProfile = {
  employee_id: string
  observed_attrition: "Yes" | "No"
  risk_score: number
  risk_level: "high" | "medium" | "low"
  top_driver: string
  monthly_income: number
  distance_from_home: number
  education_level: number
  education_field: string
  environment_satisfaction: number
  job_satisfaction: number
  prior_companies: number
  work_life_balance: number
  years_at_company: number
  model_version: string
  data_source: "demo"
}

export type CorrelatedDemoData = {
  dataset: DemoDataset
  modelProfiles: DemoModelProfile[]
}

type DemoEmployee = DemoRow & {
  employee_id: string
  first_name: string
  last_name: string
  department: string
  job_title: string
  location: string
  manager: string
  manager_id: string | null
  hire_date: string
  employment_status: string
  tenure_years: number
  data_source: "demo"
}

const snapshotDate = "2026-08-01"
const dayMs = 86_400_000

const titleLadders: Record<string, string[]> = {
  "Research & Development": ["Research Associate", "Research Analyst", "Senior Research Analyst", "Research Manager", "R&D Director"],
  Sales: ["Sales Development Representative", "Account Executive", "Senior Account Executive", "Sales Manager", "Sales Director"],
  "Human Resources": ["HR Coordinator", "People Operations Specialist", "HR Business Partner", "HR Manager", "People Director"],
}

const locationsByDepartment: Record<string, string[]> = {
  "Research & Development": ["Austin", "San Francisco", "London", "Remote"],
  Sales: ["New York", "Austin", "London", "Singapore", "Remote"],
  "Human Resources": ["New York", "San Francisco", "London", "Remote"],
}

const hiringSources = ["Employee referral", "LinkedIn", "Careers site", "University", "Agency"]
const leaveTypes = ["Annual", "Personal", "Caregiver", "Sick"]

function employeeNumber(employeeId: string): number {
  return Number(employeeId.match(/\d+/)?.[0] ?? 0)
}

function parseDate(value: string): number {
  return new Date(`${value}T12:00:00Z`).getTime()
}

function isoDate(value: number): string {
  return new Date(value).toISOString().slice(0, 10)
}

function addDays(value: string, days: number): string {
  return isoDate(parseDate(value) + days * dayMs)
}

function addYears(value: string, years: number, extraDays = 0): string {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCFullYear(date.getUTCFullYear() + years)
  date.setUTCDate(date.getUTCDate() + extraDays)
  return date.toISOString().slice(0, 10)
}

function laterDate(left: string, right: string): string {
  return left > right ? left : right
}

function dateWithin(start: string, end: string, seed: number): string {
  const startTime = parseDate(start)
  const endTime = parseDate(end)
  if (endTime <= startTime) return start
  const availableDays = Math.max(1, Math.floor((endTime - startTime) / dayMs))
  return isoDate(startTime + (seed % availableDays) * dayMs)
}

function careerLevel(employee: ScoredEmployee): number {
  const incomeLevel = employee.monthlyIncome >= 15_000 ? 4
    : employee.monthlyIncome >= 9_000 ? 3
      : employee.monthlyIncome >= 5_000 ? 2
        : employee.monthlyIncome >= 2_800 ? 1
          : 0
  const tenureLevel = employee.yearsAtCompany >= 12 ? 4
    : employee.yearsAtCompany >= 7 ? 3
      : employee.yearsAtCompany >= 3 ? 2
        : employee.yearsAtCompany >= 1 ? 1
          : 0
  return Math.min(4, Math.max(incomeLevel, tenureLevel - 1))
}

function exitReason(topDriver: string, seed: number): string {
  if (/income|compensation/i.test(topDriver)) return "Compensation"
  if (/work-life|workload/i.test(topDriver)) return "Work-life balance"
  if (/environment|manager/i.test(topDriver)) return "Work environment"
  if (/satisfaction|role fit/i.test(topDriver)) return "Role fit"
  if (/commute|distance/i.test(topDriver)) return "Commute or relocation"
  return seed % 2 === 0 ? "Career growth" : "External opportunity"
}

function roleTraining(department: string): { program: string; hours: number } {
  if (department === "Sales") return { program: "Responsible selling and CRM practice", hours: 5 }
  if (department === "Human Resources") return { program: "Employment policy and case management", hours: 6 }
  return { program: "Data handling and research quality", hours: 7 }
}

export function generateCorrelatedDemoData(sourceEmployees: ScoredEmployee[], modelVersion: string): CorrelatedDemoData {
  const internal = sourceEmployees.map((employee) => {
    const seed = employeeNumber(employee.id)
    const exited = employee.observedAttrition === "Yes"
    const exitDate = exited ? addDays(snapshotDate, -(20 + (seed * 37) % 680)) : null
    const tenureDays = Math.max(45, employee.yearsAtCompany * 365 + 45 + (seed * 17) % 280)
    const employmentEnd = exitDate ?? snapshotDate
    const hireDate = addDays(employmentEnd, -tenureDays)
    const ladder = titleLadders[employee.department] ?? ["Associate", "Specialist", "Senior Specialist", "Manager", "Director"]
    const level = careerLevel(employee)
    const departmentLocations = locationsByDepartment[employee.department] ?? ["Remote"]
    return {
      source: employee,
      seed,
      exited,
      exitDate,
      hireDate,
      employmentEnd,
      level,
      ladder,
      location: departmentLocations[(seed + employee.distanceFromHome) % departmentLocations.length],
      managerId: null as string | null,
      jobTitle: ladder[level],
    }
  })

  const byDepartment = new Map<string, typeof internal>()
  for (const employee of internal) {
    const rows = byDepartment.get(employee.source.department) ?? []
    rows.push(employee)
    byDepartment.set(employee.source.department, rows)
  }

  for (const rows of byDepartment.values()) {
    const active = rows.filter((employee) => !employee.exited)
    const managerCount = Math.max(2, Math.ceil(active.length / 18))
    const managers = [...active]
      .sort((left, right) => right.level - left.level || right.source.monthlyIncome - left.source.monthlyIncome || left.seed - right.seed)
      .slice(0, managerCount)
    const managerIds = new Set(managers.map((employee) => employee.source.id))
    const departmentHead = managers[0]
    managers.forEach((manager, index) => {
      manager.jobTitle = manager.ladder[index === 0 ? 4 : 3]
      manager.managerId = index === 0 ? null : departmentHead.source.id
    })
    rows.forEach((employee) => {
      if (managerIds.has(employee.source.id)) return
      employee.managerId = managers[employee.seed % managers.length]?.source.id ?? departmentHead?.source.id ?? null
    })
  }

  const employees: DemoEmployee[] = internal.map((employee) => {
    const manager = employee.managerId ? internal.find((candidate) => candidate.source.id === employee.managerId) : null
    const onLeave = !employee.exited && employee.seed % 97 === 0
    return {
      employee_id: employee.source.id,
      first_name: "Demo",
      last_name: `Employee ${String(employee.seed).padStart(4, "0")}`,
      preferred_name: null,
      work_email: `demo.employee${String(employee.seed).padStart(4, "0")}@demo.laidbackhr.invalid`,
      phone: null,
      department: employee.source.department,
      job_title: employee.jobTitle,
      location: employee.location,
      manager: manager ? `Demo Employee ${String(manager.seed).padStart(4, "0")}` : "Not assigned",
      manager_id: employee.managerId,
      hire_date: employee.hireDate,
      employment_type: employee.seed % 19 === 0 ? "Contract" : employee.seed % 13 === 0 ? "Part-time" : "Full-time",
      employment_status: employee.exited ? "Terminated" : onLeave ? "On leave" : "Active",
      tenure_years: employee.source.yearsAtCompany,
      data_source: "demo",
    }
  })

  const employeeById = new Map(employees.map((employee) => [employee.employee_id, employee]))
  const hiring: DemoRow[] = internal.map((employee) => {
    const timeToHire = 18 + (employee.seed * 11 + employee.source.distanceFromHome) % 58
    return {
      id: `HIR-DEMO-${employee.source.id}`,
      position: employee.jobTitle,
      department: employee.source.department,
      application_date: addDays(employee.hireDate, -timeToHire),
      hiring_date: employee.hireDate,
      hiring_source: hiringSources[(employee.seed + employee.source.priorCompanies) % hiringSources.length],
      time_to_hire_days: timeToHire,
      recruitment_status: "Hired",
      location: employee.location,
      data_source: "demo",
    }
  })

  const departmentNames = [...byDepartment.keys()]
  for (let index = 0; index < 30; index += 1) {
    const department = departmentNames[index % departmentNames.length]
    const ladder = titleLadders[department]
    const seed = 2_000 + index
    const locations = locationsByDepartment[department]
    hiring.push({
      id: `HIR-DEMO-OPEN-${String(index + 1).padStart(3, "0")}`,
      position: ladder[1 + (index % 3)],
      department,
      application_date: addDays(snapshotDate, -(5 + (index * 7) % 75)),
      hiring_date: null,
      hiring_source: index % 4 === 0 ? "Workforce plan" : hiringSources[index % hiringSources.length],
      time_to_hire_days: null,
      recruitment_status: index % 6 === 0 ? "Offer" : "Open",
      location: locations[seed % locations.length],
      data_source: "demo",
    })
  }

  const attrition: DemoRow[] = internal.filter((employee) => employee.exited).map((employee) => ({
    id: `EXT-DEMO-${employee.source.id}`,
    employee_id: employee.source.id,
    exit_date: employee.exitDate,
    exit_reason: employee.seed % 11 === 0 ? "Performance" : exitReason(employee.source.topDriver, employee.seed),
    exit_type: employee.seed % 11 === 0 ? "Involuntary" : "Voluntary",
    department: employee.source.department,
    tenure_years: employee.source.yearsAtCompany,
    data_source: "demo",
  }))

  const leave: DemoRow[] = []
  const training: DemoRow[] = []
  const promotions: DemoRow[] = []

  for (const employee of internal) {
    const recentStart = laterDate(employee.hireDate, addDays(employee.employmentEnd, -700))
    const leaveCount = Math.min(4, 1 + Math.floor(Math.max(0, employee.source.yearsAtCompany) / 4))
    for (let index = 0; index < leaveCount; index += 1) {
      const days = 1 + ((employee.seed + index * 3) % 5)
      const latestStart = addDays(employee.employmentEnd, -(days + 2))
      const start = dateWithin(recentStart, latestStart, employee.seed * 31 + index * 127)
      const status = employee.seed % 23 === 0 && index === leaveCount - 1 ? "Rejected" : "Approved"
      leave.push({
        id: `LEV-DEMO-${employee.source.id}-${index + 1}`,
        employee_id: employee.source.id,
        leave_type: leaveTypes[(employee.seed + index) % leaveTypes.length],
        start_date: start,
        end_date: addDays(start, days - 1),
        leave_days: days,
        approval_status: status,
        department: employee.source.department,
        data_source: "demo",
      })
    }

    if (!employee.exited && employee.seed % 97 === 0) {
      leave.push({
        id: `LEV-DEMO-CURRENT-${employee.source.id}`,
        employee_id: employee.source.id,
        leave_type: "Annual",
        start_date: addDays(snapshotDate, -1),
        end_date: addDays(snapshotDate, 2),
        leave_days: 4,
        approval_status: "Approved",
        department: employee.source.department,
        data_source: "demo",
      })
    } else if (!employee.exited && employee.seed % 71 === 0) {
      const start = addDays(snapshotDate, 7 + employee.seed % 21)
      leave.push({
        id: `LEV-DEMO-UPCOMING-${employee.source.id}`,
        employee_id: employee.source.id,
        leave_type: "Annual",
        start_date: start,
        end_date: addDays(start, 2),
        leave_days: 3,
        approval_status: employee.seed % 2 === 0 ? "Pending" : "Approved",
        department: employee.source.department,
        data_source: "demo",
      })
    }

    const mandatoryIncomplete = !employee.exited && employee.seed % 9 === 0
    const securityDate = dateWithin(recentStart, addDays(employee.employmentEnd, -1), employee.seed * 19)
    training.push({
      id: `TRN-DEMO-SEC-${employee.source.id}`,
      training_program: "Security and privacy",
      employee_id: employee.source.id,
      completion_status: mandatoryIncomplete ? "Incomplete" : "Completed",
      completion_date: mandatoryIncomplete ? null : securityDate,
      training_hours: 3,
      assessment_score: mandatoryIncomplete ? null : 70 + (employee.seed * 7) % 31,
      department: employee.source.department,
      data_source: "demo",
    })
    const roleCourse = roleTraining(employee.source.department)
    const roleIncomplete = !employee.exited && employee.source.yearsAtCompany === 0 && employee.seed % 3 === 0
    training.push({
      id: `TRN-DEMO-ROLE-${employee.source.id}`,
      training_program: roleCourse.program,
      employee_id: employee.source.id,
      completion_status: roleIncomplete ? "Incomplete" : "Completed",
      completion_date: roleIncomplete ? null : dateWithin(recentStart, addDays(employee.employmentEnd, -1), employee.seed * 43),
      training_hours: roleCourse.hours,
      assessment_score: roleIncomplete ? null : 68 + (employee.seed * 13) % 33,
      department: employee.source.department,
      data_source: "demo",
    })

    const promotionCount = Math.min(3, employee.level, Math.floor(employee.source.yearsAtCompany / 3))
    const firstLevel = Math.max(0, employee.level - promotionCount)
    let previousDate = employee.hireDate
    for (let index = 0; index < promotionCount; index += 1) {
      const remainingYears = Math.max(1, employee.source.yearsAtCompany)
      const promotionDate = addYears(employee.hireDate, Math.max(1, Math.floor(((index + 1) * remainingYears) / (promotionCount + 1))), (employee.seed + index * 29) % 90)
      const safePromotionDate = promotionDate > employee.employmentEnd ? addDays(employee.employmentEnd, -(30 + index * 15)) : promotionDate
      const previousTitle = employee.ladder[Math.min(4, firstLevel + index)]
      const newTitle = index === promotionCount - 1 ? employee.jobTitle : employee.ladder[Math.min(4, firstLevel + index + 1)]
      const months = Math.max(1, Math.round((parseDate(safePromotionDate) - parseDate(previousDate)) / (30.44 * dayMs)))
      promotions.push({
        id: `PRO-DEMO-${employee.source.id}-${index + 1}`,
        employee_id: employee.source.id,
        previous_title: previousTitle,
        new_title: newTitle,
        promotion_date: safePromotionDate,
        department: employee.source.department,
        months_since_previous_promotion: months,
        data_source: "demo",
      })
      previousDate = safePromotionDate
    }
  }

  const modelProfiles: DemoModelProfile[] = sourceEmployees.map((employee) => ({
    employee_id: employee.id,
    observed_attrition: employee.observedAttrition === "Yes" ? "Yes" : "No",
    risk_score: employee.riskScore,
    risk_level: employee.riskLevel,
    top_driver: employee.topDriver,
    monthly_income: employee.monthlyIncome,
    distance_from_home: employee.distanceFromHome,
    education_level: employee.educationLevel,
    education_field: employee.educationField,
    environment_satisfaction: employee.environmentSatisfaction,
    job_satisfaction: employee.jobSatisfaction,
    prior_companies: employee.priorCompanies,
    work_life_balance: employee.workLifeBalance,
    years_at_company: employee.yearsAtCompany,
    model_version: modelVersion,
    data_source: "demo",
  }))

  for (const profile of modelProfiles) {
    if (!employeeById.has(profile.employee_id)) throw new Error(`Missing demo employee for model profile ${profile.employee_id}`)
  }

  return { dataset: { employees, hiring, attrition, leave, training, promotions }, modelProfiles }
}
