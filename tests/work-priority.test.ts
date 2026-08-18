import assert from "node:assert/strict"
import test from "node:test"

import { assessWorkPriority } from "../lib/server/work-priority.ts"

const base = {
  id: "CASE-1",
  type: "case" as const,
  title: "Equipment request",
  detail: "equipment",
  dueDate: "2026-08-20",
  slaStatus: "on_track" as const,
  createdAt: "2026-08-17T12:00:00.000Z",
  isCompleted: false,
  requiresDecision: false,
  timeInStatusDays: 0,
  requestContext: [{ label: "Employee request", value: "Replacement mouse" }],
}

test("work-blocking remote equipment outranks a routine claim", () => {
  const blocked = assessWorkPriority({
    ...base,
    slaStatus: "due_soon",
    detail: "Remote · equipment",
    requestContext: [{ label: "Employee request", value: "My laptop failed diagnostics and I cannot work." }],
  })
  const claim = assessWorkPriority({
    ...base,
    id: "EXP-1",
    type: "reimbursement",
    title: "Travel reimbursement",
    detail: "USD 350 · travel",
    requestContext: [{ label: "Amount", value: "USD 350" }],
  })
  assert.ok(blocked.score > claim.score)
  assert.ok(blocked.factors.some((row) => row.code === "work_blocked"))
  assert.ok(blocked.factors.some((row) => row.code === "remote_fulfilment"))
})

test("requester seniority and location alone do not change priority", () => {
  const employee = assessWorkPriority({ ...base, requestContext: [{ label: "Submitted by", value: "employee@example.com" }] })
  const executive = assessWorkPriority({ ...base, requestContext: [{ label: "Submitted by", value: "Chief Executive Officer · New York" }] })
  assert.equal(employee.score, executive.score)
  assert.equal(employee.level, executive.level)
})

test("overdue decisions are explainable but not automatically P1", () => {
  const assessment = assessWorkPriority({ ...base, type: "leave", slaStatus: "overdue", requiresDecision: true, timeInStatusDays: 8 })
  assert.equal(assessment.level, "P2")
  assert.deepEqual(assessment.factors.map((row) => row.code), ["overdue", "decision", "age_7"])
})

test("completed work is removed from active priority", () => {
  const assessment = assessWorkPriority({ ...base, isCompleted: true, slaStatus: "complete" })
  assert.equal(assessment.level, "P4")
  assert.equal(assessment.score, 0)
})
