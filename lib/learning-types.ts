export type LearningCourse = {
  id: string
  code: string | null
  title: string
  defaultHours: number
  isMandatory: boolean
}

export type LearningPerson = {
  employeeId: string
  displayName: string
  department: string
  jobTitle: string
  location: string
}

export type LearningAssignment = {
  id: string
  courseId: string
  courseTitle: string
  isMandatory: boolean
  employeeId: string
  employeeName: string
  department: string
  location: string
  status: string
  assignedAt: string
  dueDate: string | null
  completedAt: string | null
  assignedHours: number
  assessmentScore: number | null
  requestedByEmail: string | null
  completionNote: string | null
  canComplete: boolean
}

export type LearningOperations = {
  generatedAt: string
  summary: {
    assignments: number
    completed: number
    completionRate: number
    overdue: number
    mandatoryGaps: number
  }
  dimensions: { departments: string[]; locations: string[] }
  courses: LearningCourse[]
  people: LearningPerson[]
  assignments: LearningAssignment[]
  departmentCoverage: Array<{ department: string; assigned: number; completed: number; overdue: number; completionRate: number }>
}
