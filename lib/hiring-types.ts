export const hiringCandidateStages = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"] as const

export type HiringCandidateStage = typeof hiringCandidateStages[number]

export type HiringCandidate = {
  id: string
  requisitionId: string
  requisitionTitle: string
  department: string
  location: string
  fullName: string
  email: string
  stage: HiringCandidateStage
  source: string
  appliedAt: string
  ownerEmail: string
  ownerName: string
  nextStep: string
  nextStepDueAt: string | null
  notes: string | null
  rejectedReason: string | null
  isOverdue: boolean
  createdAt: string
  updatedAt: string
}

export type HiringRequisition = {
  id: string
  position: string
  department: string
  location: string
  status: string
  openedAt: string
  source: string
  ownerEmail: string | null
  ownerName: string
  dueDate: string | null
  nextAction: string
  requestedByEmail: string | null
  employmentType: string
  justification: string
  ageDays: number
  candidateCount: number
  activeCandidateCount: number
  interviewCount: number
  offerCount: number
  canDecide: boolean
  canAddCandidate: boolean
  reviewHref: string
}

export type HiringOperations = {
  generatedAt: string
  summary: {
    approvalsRequired: number
    activeRequisitions: number
    activeCandidates: number
    interviews: number
    offers: number
    overdueFollowUps: number
    averageTimeToFill: number
  }
  stageCounts: Array<{ stage: HiringCandidateStage; count: number }>
  requisitions: HiringRequisition[]
  candidates: HiringCandidate[]
  recentHires: Array<{
    id: string
    position: string
    department: string
    location: string
    hiringDate: string
    timeToHireDays: number | null
    source: string
  }>
}

export type HiringCandidateInput = {
  requisitionId: string
  fullName: string
  email: string
  source: string
  ownerEmail?: string
  notes?: string
}

export type HiringCandidateUpdate = {
  stage: HiringCandidateStage
  nextStep?: string
  nextStepDueAt?: string | null
  notes?: string
  rejectedReason?: string
}
