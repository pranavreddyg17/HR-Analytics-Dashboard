import type { AttritionRecord, EmployeeRecord, LeaveRecord, PromotionRecord, TrainingRecord } from "@/lib/hr-types"

export type ManagedEmployee = EmployeeRecord & {
  display_name: string
  initials: string
  manager_name: string | null
  direct_reports: number
}

export type EmployeeActivity = {
  id: string
  employee_id: string
  event_type: string
  summary: string
  changes_json: string | null
  actor_email: string
  created_at: string
}

export type EmployeeDirectoryResponse = {
  total: number
  items: ManagedEmployee[]
  dimensions: {
    departments: string[]
    locations: string[]
    statuses: string[]
    employmentTypes: string[]
  }
}

export type EmployeeProfileResponse = {
  employee: ManagedEmployee
  manager: ManagedEmployee | null
  directReports: ManagedEmployee[]
  leave: LeaveRecord[]
  training: TrainingRecord[]
  promotions: PromotionRecord[]
  attrition: AttritionRecord[]
  activity: EmployeeActivity[]
}

export type EmployeeInput = {
  employee_id?: string
  first_name: string
  last_name: string
  preferred_name?: string | null
  work_email?: string | null
  phone?: string | null
  department: string
  job_title: string
  location: string
  manager_id?: string | null
  hire_date: string
  employment_type: string
  employment_status: string
  version?: number
}

export type InboxItem = {
  id: string
  type: "leave" | "hiring" | "training" | "review"
  title: string
  detail: string
  person: string | null
  employeeId: string | null
  dueDate: string | null
  status: string
  priority: "high" | "medium" | "low"
  actionable: boolean
  actions?: Array<"approve" | "reject" | "complete">
}

export type WorkflowActorContext = {
  role: "admin" | "hr" | "manager" | "viewer"
  employeeId: string | null
  employeeName: string | null
  canRequestHiring: boolean
  canAssignTraining: boolean
}
