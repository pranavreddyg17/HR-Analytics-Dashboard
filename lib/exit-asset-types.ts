export type AssetStatus = "Available" | "Assigned" | "Returned" | "Broken" | "Lost" | "Retired"
export type AssetCondition = "Good" | "Degraded" | "Broken"
type AssetLifecycle = "Healthy" | "Replacement Soon" | "Degraded" | "Broken"
export type AssetType = "Laptop" | "Monitor" | "Phone" | "Access badge" | "Other"

export type AssetAssignment = {
  id: string
  employeeId: string
  employeeName: string
  assignedAt: string
  returnedAt: string | null
  status: "Assigned" | "Returned"
  returnCondition: AssetCondition | null
  notes: string | null
}

export type AssetRecord = {
  id: string
  assetTag: string
  assetType: AssetType
  manufacturer: string | null
  model: string | null
  serialNumber: string | null
  status: AssetStatus
  condition: AssetCondition
  lifecycle: AssetLifecycle
  acquiredOn: string | null
  warrantyExpiresOn: string | null
  replacementDueOn: string | null
  notes: string | null
  currentAssignment: AssetAssignment | null
  createdAt: string
  updatedAt: string
}

export type AssetInventory = {
  generatedAt: string
  summary: {
    total: number
    assigned: number
    available: number
    broken: number
    lost: number
    degraded: number
    warrantyExpiring: number
    replacementDue: number
  }
  dimensions: { types: AssetType[]; statuses: AssetStatus[]; conditions: AssetCondition[] }
  total: number
  items: AssetRecord[]
}

export type AssetDetail = AssetRecord & { assignmentHistory: AssetAssignment[] }

export type OffboardingTask = {
  id: string
  taskType: string
  title: string
  ownerTeam: "HR" | "Manager" | "IT" | "Payroll"
  status: "Pending" | "In Progress" | "Completed"
  dueDate: string | null
  completedAt: string | null
  completedByEmail: string | null
  assetAssignmentId: string | null
  assetTag: string | null
  notes: string | null
}

export type EmployeeExitRecord = {
  id: string
  employeeId: string
  employeeName: string
  department: string
  jobTitle: string
  manager: string
  employmentStatus: string
  exitType: "Resignation" | "Termination" | "Contract end" | "Other"
  expectedExitDate: string
  actualExitDate: string | null
  status: "Scheduled" | "In Progress" | "Completed" | "Cancelled"
  notes: string | null
  progress: number
  outstandingHrTasks: number
  outstandingItTasks: number
  outstandingAssets: number
  pendingAccessTasks: number
  taskCount: number
  completedTaskCount: number
  createdAt: string
  updatedAt: string
}

export type EmployeeExitDetail = EmployeeExitRecord & {
  tasks: OffboardingTask[]
  assets: AssetRecord[]
}

export type ExitDashboard = {
  generatedAt: string
  summary: {
    leaving30Days: number
    leaving60Days: number
    leaving90Days: number
    incompleteOffboarding: number
    outstandingAssets: number
    pendingAccessRemoval: number
  }
  total: number
  items: EmployeeExitRecord[]
}
