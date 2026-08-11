import assert from "node:assert/strict"
import test from "node:test"

import type { EmployeeRecord, TrainingRecord, WorkforceCostAssumptions } from "../lib/hr-types"
import { buildWorkforceImpact } from "../lib/server/workforce-impact"

const assumptions: WorkforceCostAssumptions = {
  currency: "USD",
  recruitingCostPerHire: 7_500,
  vacancyProductivityPercent: 50,
  onboardingDays: 90,
  onboardingProductivityPercent: 25,
  courseFeePerLearner: 500,
  courseHoursPerLearner: 8,
}

const employee: EmployeeRecord = {
  employee_id: "EMP-1",
  first_name: "Avery",
  last_name: "Chen",
  preferred_name: null,
  work_email: "avery@example.com",
  phone: null,
  department: "Engineering",
  job_title: "Software Engineer",
  location: "Seattle",
  manager: "Morgan Lee",
  manager_id: null,
  hire_date: "2024-01-01",
  employment_type: "Full time",
  employment_status: "Active",
  tenure_years: 2,
  data_source: "operational",
  archived_at: null,
  version: 1,
}

const training = (overrides: Partial<TrainingRecord>): TrainingRecord => ({
  id: "TRN-1",
  training_program: "Secure engineering",
  employee_id: employee.employee_id,
  completion_status: "Incomplete",
  completion_date: null,
  training_hours: 3,
  assessment_score: null,
  department: employee.department,
  is_mandatory: 1,
  data_source: "operational",
  due_date: "2000-01-01",
  ...overrides,
})

test("capability planning uses assignment, pay, and due-date records", () => {
  const result = buildWorkforceImpact({
    workforceEmployees: [employee],
    activeEmployees: [employee],
    attrition: [],
    hired: [],
    openRequisitions: [],
    training: [
      training({}),
      training({ id: "TRN-2", training_program: "Privacy fundamentals", completion_status: "Completed", completion_date: "2026-01-15", due_date: "2026-01-15" }),
    ],
    modelEmployees: [],
    annualPayByEmployee: new Map([[employee.employee_id, 104_000]]),
    assumptions,
    policy: { fallbackRefillDays: 45, criticalReviewShare: 40, watchReviewShare: 20 },
  })

  assert.equal(result.capabilityPlans.length, 1)
  assert.deepEqual(result.capabilityPlans[0], {
    department: "Engineering",
    activeEmployees: 1,
    assignedEmployees: 1,
    totalAssignments: 2,
    completedAssignments: 1,
    completionRate: 50,
    incompleteEmployees: 1,
    incompleteAssignments: 1,
    mandatoryGaps: 1,
    overdueMandatoryGaps: 1,
    remainingHours: 3,
    estimatedRemainingCost: 650,
    leadingProgram: "Secure engineering",
    status: "Overdue required",
  })
})

test("capability planning uses configured hours only when assignment hours are missing", () => {
  const result = buildWorkforceImpact({
    workforceEmployees: [employee],
    activeEmployees: [employee],
    attrition: [],
    hired: [],
    openRequisitions: [],
    training: [training({ training_hours: 0, is_mandatory: 0, due_date: null })],
    modelEmployees: [],
    annualPayByEmployee: new Map([[employee.employee_id, 104_000]]),
    assumptions,
    policy: { fallbackRefillDays: 45, criticalReviewShare: 40, watchReviewShare: 20 },
  })

  assert.equal(result.capabilityPlans[0]?.remainingHours, 8)
  assert.equal(result.capabilityPlans[0]?.estimatedRemainingCost, 900)
  assert.equal(result.capabilityPlans[0]?.status, "Follow up")
})
