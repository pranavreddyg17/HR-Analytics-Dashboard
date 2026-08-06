export type LeaveOperationRecord = {
  id: string
  employeeId: string
  employeeName: string
  employeeEmail: string | null
  managerId: string | null
  leaveType: string
  startDate: string
  endDate: string
  leaveDays: number
  status: string
  department: string
  location: string
  requestedAt: string
  requestedByEmail: string | null
  decisionNote: string | null
  canDecide: boolean
  coverage: { departmentHeadcount: number; approvedAway: number; pendingRequests: number }
}

export type LeaveOperations = {
  generatedAt: string
  summary: { requests: number; pending: number; reviewable: number; awayToday: number; approvedDays: number }
  dimensions: { departments: string[]; locations: string[]; leaveTypes: string[]; statuses: string[] }
  requests: LeaveOperationRecord[]
  awayToday: LeaveOperationRecord[]
  upcoming: LeaveOperationRecord[]
}
