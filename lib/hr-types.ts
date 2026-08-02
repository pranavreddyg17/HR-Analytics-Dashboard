export const hrDomains = ["employees", "hiring", "attrition", "leave", "training", "promotions"] as const

export type HrDomain = (typeof hrDomains)[number]
type TrendPeriod = "month" | "quarter" | "year"

export type HrFilters = {
  from?: string
  to?: string
  department?: string
  jobTitle?: string
  location?: string
  leaveType?: string
  dataMode?: "live" | "all"
  period?: TrendPeriod
}

export type BreakdownPoint = { label: string; value: number; secondary?: number }
export type TimePoint = { period: string; value: number; secondary?: number }

export type EmployeeRecord = {
  employee_id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  work_email: string | null
  phone: string | null
  department: string
  job_title: string
  location: string
  manager: string
  manager_id: string | null
  hire_date: string
  employment_type: string
  employment_status: string
  tenure_years: number
  data_source: string
  archived_at: string | null
  version: number
  created_at?: string
  updated_at?: string
}

export type HiringRecord = {
  id: string
  position: string
  department: string
  application_date: string
  hiring_date: string | null
  hiring_source: string
  time_to_hire_days: number | null
  recruitment_status: string
  location: string
  data_source: string
}

export type AttritionRecord = {
  id: string
  employee_id: string
  exit_date: string
  exit_reason: string
  exit_type: string
  department: string
  tenure_years: number
  data_source: string
}

export type AttritionModelProfile = {
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
  data_source: string
}

export type AttritionEmployeeRecord = {
  employeeId: string
  name: string
  department: string
  jobTitle: string
  location: string
  manager: string
  employmentStatus: string
  tenureYears: number
  observedAttrition: "Yes" | "No"
  exitDate: string | null
  exitReason: string | null
  exitType: string | null
  riskScore: number
  riskLevel: "high" | "medium" | "low"
  topDriver: string
  distanceFromHome: number
  educationLevel: number
  educationField: string
  jobSatisfaction: number
  environmentSatisfaction: number
  workLifeBalance: number
  monthlyIncome: number
  priorCompanies: number
  yearsAtCompany: number
  modelVersion: string
  dataSource: string
}

export type LeaveRecord = {
  id: string
  employee_id: string
  leave_type: string
  start_date: string
  end_date: string
  leave_days: number
  approval_status: string
  department: string
  data_source: string
}

export type TrainingRecord = {
  id: string
  training_program: string
  employee_id: string
  completion_status: string
  completion_date: string | null
  training_hours: number
  assessment_score: number | null
  department: string
  data_source: string
  due_date?: string | null
  requested_by_email?: string | null
  assigned_at?: string | null
}

export type PromotionRecord = {
  id: string
  employee_id: string
  previous_title: string
  new_title: string
  promotion_date: string
  department: string
  months_since_previous_promotion: number
  data_source: string
}

export type DomainStatus = {
  domain: HrDomain
  count: number
  mode: "demo" | "imported" | "mixed" | "empty"
  lastImport: string | null
}

export type WorkforceAnalytics = {
  generatedAt: string
  filters: Required<Pick<HrFilters, "period">> & Omit<HrFilters, "period">
  dimensions: { departments: string[]; jobTitles: string[]; locations: string[]; leaveTypes: string[] }
  status: DomainStatus[]
  kpis: {
    totalEmployees: number
    activeEmployees: number
    hires: number
    averageTimeToHire: number
    attritionRate: number
    leaveDays: number
    trainingCompletionRate: number
    promotions: number
  }
  employeeAnalytics: {
    total: number
    active: number
    onLeave: number
    preboarding: number
    terminated: number
    byDepartment: BreakdownPoint[]
    activeByDepartment: BreakdownPoint[]
    byJobTitle: BreakdownPoint[]
    byLocation: BreakdownPoint[]
    byStatus: BreakdownPoint[]
    byEmploymentType: BreakdownPoint[]
    byTenure: BreakdownPoint[]
    managerSpan: BreakdownPoint[]
    rows: EmployeeRecord[]
  }
  hiring: {
    totalHired: number
    activeRequisitions: number
    offers: number
    averageTimeToHire: number
    trend: TimePoint[]
    requisitionTrend: TimePoint[]
    byDepartment: BreakdownPoint[]
    pipelineByDepartment: BreakdownPoint[]
    byRole: BreakdownPoint[]
    bySource: BreakdownPoint[]
    byLocation: BreakdownPoint[]
    sourceStats: Array<{ label: string; hires: number; averageDays: number }>
    statuses: BreakdownPoint[]
    rows: HiringRecord[]
  }
  attrition: {
    totalExits: number
    rate: number
    voluntary: number
    involuntary: number
    trend: TimePoint[]
    byDepartment: BreakdownPoint[]
    byExitReason: BreakdownPoint[]
    byRole: BreakdownPoint[]
    byTenure: BreakdownPoint[]
    highRiskEmployees: Array<{ id: string; department: string; role: string; riskScore: number; topDriver: string }>
    employeeRecords: AttritionEmployeeRecord[]
    rows: AttritionRecord[]
  }
  leave: {
    totalRequests: number
    totalDays: number
    averageDaysPerEmployee: number
    pending: number
    approved: number
    rejected: number
    currentlyAway: LeaveRecord[]
    upcoming: LeaveRecord[]
    trend: TimePoint[]
    byType: BreakdownPoint[]
    byDepartment: BreakdownPoint[]
    statuses: BreakdownPoint[]
    rows: LeaveRecord[]
  }
  training: {
    completionRate: number
    totalHours: number
    averageScore: number
    requiringMandatoryTraining: number
    trend: TimePoint[]
    byDepartment: BreakdownPoint[]
    byProgram: BreakdownPoint[]
    statuses: BreakdownPoint[]
    rows: TrainingRecord[]
  }
  promotions: {
    total: number
    rate: number
    averageMonthsToPromotion: number
    withoutPromotionOver36Months: number
    trend: TimePoint[]
    byDepartment: BreakdownPoint[]
    mobilityReview: Array<{
      employeeId: string
      name: string
      department: string
      jobTitle: string
      location: string
      employmentStatus: string
      tenureYears: number
      dataSource: string
    }>
    rows: PromotionRecord[]
  }
  operatingSignals: {
    windowLabel: string
    managerExitConcentration: Array<{
      managerId: string | null
      manager: string
      department: string
      activeTeamSize: number
      exits: number
      voluntaryExits: number
      shareOfDepartmentExits: number
    }>
    replacementCoverage: Array<{
      department: string
      activeEmployees: number
      hires: number
      exits: number
      openRequisitions: number
      netMovement: number
      averageTimeToHire: number
      mobilityReviewCount: number
      status: "Gap" | "Watch" | "Covered"
    }>
  }
  employees: EmployeeRecord[]
  directoryEmployees: EmployeeRecord[]
  executiveInsights: string[]
}

export const importFields: Record<HrDomain, string[]> = {
  employees: ["employee_id", "first_name", "last_name", "preferred_name", "work_email", "phone", "department", "job_title", "location", "manager", "manager_id", "hire_date", "employment_type", "employment_status", "tenure_years"],
  hiring: ["id", "position", "department", "application_date", "hiring_date", "hiring_source", "time_to_hire_days", "recruitment_status", "location"],
  attrition: ["id", "employee_id", "exit_date", "exit_reason", "exit_type", "department", "tenure_years"],
  leave: ["id", "employee_id", "leave_type", "start_date", "end_date", "leave_days", "approval_status", "department"],
  training: ["id", "training_program", "employee_id", "completion_status", "completion_date", "training_hours", "assessment_score", "department"],
  promotions: ["id", "employee_id", "previous_title", "new_title", "promotion_date", "department", "months_since_previous_promotion"],
}
