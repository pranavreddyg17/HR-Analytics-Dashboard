import type { AttritionModelProfile, AttritionRecord, EmployeeRecord, LeaveRecord, PromotionRecord, TrainingRecord } from "@/lib/hr-types"

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
  composition: {
    departments: Array<{ name: string; count: number }>
  }
  dimensions: {
    departments: string[]
    locations: string[]
    statuses: string[]
    employmentTypes: string[]
  }
}

export type EmployeeProfileResponse = {
  permissions: {
    canManageEmployment: boolean
    canManageMeetings: boolean
  }
  employee: ManagedEmployee
  manager: ManagedEmployee | null
  directReports: ManagedEmployee[]
  leave: LeaveRecord[]
  training: TrainingRecord[]
  promotions: PromotionRecord[]
  attrition: AttritionRecord[]
  attritionModel: AttritionModelProfile | null
  activity: EmployeeActivity[]
  projects: Array<Record<string, unknown>>
  compensation: Record<string, unknown> | null
  documents: Array<Record<string, unknown>>
  reimbursements: Array<Record<string, unknown>>
  cases: Array<Record<string, unknown>>
  reviews: Array<Record<string, unknown>>
  meetings: Array<Record<string, unknown>>
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
  type: "leave" | "hiring" | "training" | "insight" | "reimbursement" | "case"
  title: string
  detail: string
  person: string | null
  employeeId: string | null
  dueDate: string | null
  status: string
  priority: "high" | "medium" | "low"
  owner: string
  ownerEmail: string | null
  nextAction: string
  attentionReason: string
  completionEffect: string
  requestContext: Array<{ label: string; value: string }>
  assignedTo: "hr" | "manager" | "employee"
  requiresDecision: boolean
  isCompleted: boolean
  slaStatus: "overdue" | "due_today" | "due_soon" | "on_track" | "complete" | "unscheduled"
  timeInStatusDays: number
  createdAt: string
  completedAt: string | null
  completionNotes: string | null
  blockedReason: string | null
  actionable: boolean
  actions?: Array<"approve" | "reject" | "complete">
  reviewHref: string
  recordHref: string
}

export type WorkflowActorContext = {
  role: "admin" | "hr" | "manager" | "viewer" | "employee"
  email: string
  employeeId: string | null
  employeeName: string | null
  canRequestHiring: boolean
  canAssignTraining: boolean
}
