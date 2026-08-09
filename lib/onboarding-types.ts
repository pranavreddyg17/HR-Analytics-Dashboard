export type OnboardingJoiner = {
  employeeId: string
  name: string
  workEmail: string | null
  department: string
  jobTitle: string
  location: string
  manager: string
  managerId: string | null
  startDate: string
  verificationStatus: "Verification" | "Ready" | "Profile setup"
  submissionId: string | null
  dueDate: string | null
  nextAction: string
  reviewHref: string
}

export type OnboardingOperations = {
  generatedAt: string
  summary: {
    preboarding: number
    awaitingVerification: number
    startingNext30Days: number
    missingManager: number
  }
  joiners: OnboardingJoiner[]
}
