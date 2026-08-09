export type LearningCourse = {
  id: string
  code: string | null
  title: string
  defaultHours: number
  isMandatory: boolean
}

export type LearningSkill = {
  id: string
  name: string
  category: string
}

export type LearningPerson = {
  employeeId: string
  displayName: string
  department: string
  jobTitle: string
  jobLevel: string
  location: string
  jobProfileId: string
}

export type LearningRecommendation = {
  id: string
  skillId: string
  skillName: string
  category: string
  courseId: string
  courseTitle: string
  targetType: "job_profile"
  targetValue: string
  jobTitle: string
  department: string
  activeEmployees: number
  openRequisitions: number
  completedEvidence: number
  employeesNeedingEvidence: number
  priority: "High" | "Medium" | "Standard"
  reason: string
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
  dimensions: { departments: string[]; locations: string[]; jobTitles: string[]; jobLevels: string[] }
  courses: LearningCourse[]
  skills: LearningSkill[]
  people: LearningPerson[]
  assignments: LearningAssignment[]
  departmentCoverage: Array<{ department: string; assigned: number; completed: number; overdue: number; completionRate: number }>
  recommendations: LearningRecommendation[]
}
