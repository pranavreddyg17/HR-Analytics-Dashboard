import assert from "node:assert/strict"
import test from "node:test"

import { buildOnboardingOperations, type OnboardingPersistenceRow } from "../lib/server/onboarding"

const baseRow: OnboardingPersistenceRow = {
  employee_id: "EMP-NEW-1",
  name: "Avery Newhire",
  work_email: "avery.newhire@example.com",
  department: "Engineering",
  job_title: "Software Engineer",
  location: "Remote",
  manager: "Morgan Manager",
  manager_id: "EMP-MANAGER-1",
  hire_date: "2026-08-20",
  submission_id: "ONB-1",
  submission_status: "submitted",
  workflow_due_at: "2026-08-18T17:00:00.000Z",
}

test("new-joiner operations normalize PostgreSQL date values and preserve review routing", () => {
  const result = buildOnboardingOperations([
    { ...baseRow, hire_date: new Date("2026-08-20T00:00:00.000Z"), workflow_due_at: new Date("2026-08-18T17:00:00.000Z") },
  ], new Date("2026-08-16T12:00:00.000Z"))

  assert.deepEqual(result.summary, { preboarding: 1, awaitingVerification: 1, startingNext30Days: 1, missingManager: 0 })
  assert.equal(result.joiners[0]?.startDate, "2026-08-20")
  assert.equal(result.joiners[0]?.dueDate, "2026-08-18")
  assert.equal(result.joiners[0]?.reviewHref, "/inbox?view=decisions&type=onboarding&item=ONB-1&returnTo=%2Fonboarding")
})

test("new-joiner operations tolerate missing dates and route incomplete profiles to People", () => {
  const result = buildOnboardingOperations([
    { ...baseRow, employee_id: "EMP-NEW-2", hire_date: "", submission_id: null, submission_status: null, workflow_due_at: null, manager_id: null },
  ], new Date("2026-08-16T12:00:00.000Z"))

  assert.equal(result.summary.startingNext30Days, 0)
  assert.equal(result.summary.missingManager, 1)
  assert.equal(result.joiners[0]?.dueDate, null)
  assert.equal(result.joiners[0]?.reviewHref, "/people/EMP-NEW-2?returnTo=%2Fonboarding")
})
