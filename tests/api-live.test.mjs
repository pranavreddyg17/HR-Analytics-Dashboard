import assert from "node:assert/strict"
import test from "node:test"

const baseUrl = process.env.LAIDBACKHR_BASE_URL ?? "http://localhost:3000"

async function json(path, init) {
  const response = await fetch(baseUrl + path, init)
  const body = await response.json()
  return { response, body }
}

test("workspace navigation exposes canonical routes and preserves legacy query state", async () => {
  const canonicalRoutes = ["/", "/people", "/inbox", "/hiring", "/leaves", "/courses", "/insights", "/attrition", "/assistant", "/imports", "/access"]
  const responses = await Promise.all(canonicalRoutes.map((path) => fetch(baseUrl + path)))
  responses.forEach((response, index) => assert.equal(response.status, 200, `${canonicalRoutes[index]} should render`))

  const redirects = [
    ["/time-off?department=Sales", "/leaves?department=Sales"],
    ["/learning?q=security", "/courses?q=security"],
    ["/ai-agents?conversation=CONV-1", "/assistant?conversation=CONV-1"],
    ["/data?domain=employees", "/imports?domain=employees"],
  ]
  for (const [legacy, canonical] of redirects) {
    const response = await fetch(baseUrl + legacy, { redirect: "manual" })
    assert.ok([307, 308].includes(response.status), `${legacy} should redirect`)
    assert.equal(new URL(response.headers.get("location"), baseUrl).pathname + new URL(response.headers.get("location"), baseUrl).search, canonical)
  }
})

test("health reports every production capability ready", async () => {
  const { response, body } = await json("/api/v1/health")
  assert.equal(response.status, 200)
  assert.equal(body.service, "LaidbackHR.AI")
  assert.equal(body.rows, 1470)
  assert.deepEqual(body.capabilities, {
    prediction: "ready",
    groundedAnalytics: "ready",
    ragKnowledge: "ready",
    employeeCommunicationWorkflows: "ready",
    workforceWarehouse: "ready",
    mcpTools: "ready",
    langchainAgent: "ready",
    reportExports: "ready",
  })
})

test("workforce analytics spans every requested HR domain", async () => {
  const { response, body } = await json("/api/v1/workforce?department=Sales&period=quarter")
  assert.equal(response.status, 200)
  assert.equal(body.filters.department, "Sales")
  assert.ok(body.kpis.totalEmployees > 0)
  assert.ok(Array.isArray(body.hiring.trend))
  assert.ok(Array.isArray(body.attrition.highRiskEmployees))
  assert.ok(body.attrition.employeeRecords.length > 0)
  assert.ok(body.attrition.employeeRecords.every((item) => item.employeeId.startsWith("DEMO-EMP-") && item.department === "Sales"))
  assert.ok(Array.isArray(body.leave.byType))
  assert.ok(Array.isArray(body.training.byProgram))
  assert.ok(Array.isArray(body.promotions.byDepartment))
  assert.ok(Array.isArray(body.employeeAnalytics.byDepartment))
  assert.ok(Array.isArray(body.employeeAnalytics.managerSpan))
  assert.equal(body.operatingSignals.windowLabel, "Rolling 12 months")
  assert.ok(Array.isArray(body.operatingSignals.managerExitConcentration))
  assert.ok(Array.isArray(body.operatingSignals.replacementCoverage))
  assert.ok(body.operatingSignals.replacementCoverage.every((item) => ["Gap", "Watch", "Covered"].includes(item.status)))
  assert.ok(Array.isArray(body.decisionSupport.departments))
  assert.ok(body.decisionSupport.departments.length > 0)
  assert.ok(body.decisionSupport.departments.every((item) => typeof item.attritionRate === "number" && typeof item.vacancyRate === "number"))
  assert.ok(body.decisionSupport.departments.every((item) => item.replacementRate === null || typeof item.replacementRate === "number"))
  assert.deepEqual(body.decisionSupport.tenureAttrition.map((item) => item.cohort), ["< 1 year", "1–2 years", "3–4 years", "5+ years"])
  assert.ok(body.decisionSupport.tenureAttrition.every((item) => item.population === item.activeEmployees + item.exits))
  assert.equal(body.decisionSupport.tenureAttrition.reduce((sum, item) => sum + item.exits, 0), body.attrition.totalExits)
  assert.ok(body.decisionSupport.workforceImpact.summary.estimatedCostOfRecordedExits > 0)
  assert.ok(body.decisionSupport.workforceImpact.summary.payDataCoverage > 0)
  assert.ok(body.decisionSupport.workforceImpact.roles.length > 0)
  assert.ok(body.decisionSupport.workforceImpact.roles.every((item) => item.replacementCostPerExit === item.directRecruitingCost + item.vacancyCost + item.onboardingCost))
  assert.ok(body.decisionSupport.workforceImpact.employees.every((item) => item.replacementCost === item.directRecruitingCost + item.vacancyCost + item.onboardingCost))
  assert.ok(body.decisionSupport.workforceImpact.learningCases.every((item) => item.breakEvenPercent === null || item.breakEvenPercent >= 0))
  assert.ok(Array.isArray(body.decisionSupport.actions))
  assert.ok(body.decisionSupport.actions.every((item) => item.department && item.evidence && item.recommendedAction && item.target))
  assert.deepEqual(body.status.map((item) => item.domain), ["employees", "hiring", "attrition", "leave", "training", "promotions"])
})

test("workforce impact assumptions are bounded and recalculated by the backend", async () => {
  const defaults = await json("/api/v1/workforce?dataMode=all&period=quarter")
  const adjusted = await json("/api/v1/workforce?dataMode=all&period=quarter&recruitingCostPerHire=1000&vacancyProductivityPercent=20&onboardingDays=30&onboardingProductivityPercent=10&courseFeePerLearner=100&courseHoursPerLearner=4")
  assert.equal(defaults.response.status, 200)
  assert.equal(adjusted.response.status, 200)
  assert.equal(adjusted.body.decisionSupport.workforceImpact.assumptions.recruitingCostPerHire, 1000)
  assert.equal(adjusted.body.decisionSupport.workforceImpact.assumptions.vacancyProductivityPercent, 20)
  assert.equal(adjusted.body.decisionSupport.workforceImpact.assumptions.onboardingDays, 30)
  assert.equal(adjusted.body.decisionSupport.workforceImpact.assumptions.courseFeePerLearner, 100)
  assert.ok(adjusted.body.decisionSupport.workforceImpact.summary.averageReplacementCost < defaults.body.decisionSupport.workforceImpact.summary.averageReplacementCost)
})

test("retention insights expose computed evidence and persist a governed review", async () => {
  const initial = await json("/api/v1/retention/insights")
  assert.equal(initial.response.status, 200)
  assert.equal(initial.body.apiVersion, "1.0")
  assert.ok(initial.body.cohortAlerts.length > 0)
  assert.ok(initial.body.cohortAlerts.every((row) => Array.isArray(row.triggerReasons)))
  assert.deepEqual(initial.body.operatingCycle.map((row) => row.stage), ["Detect", "Validate", "Act", "Follow up", "Learn"])
  assert.ok(initial.body.operatingCycle.every((row) => typeof row.count === "number" && row.finding && row.nextAction))

  const department = initial.body.priorities[0]?.cohort ?? initial.body.cohortAlerts[0].department
  const created = await json("/api/v1/retention/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ department }),
  })
  assert.equal(created.response.status, 201)
  assert.match(created.body.id, /^RET-/)

  const updated = await json("/api/v1/retention/insights")
  const cohort = updated.body.cohortAlerts.find((row) => row.department === department)
  assert.equal(cohort.reviewId, created.body.id)
  assert.equal(cohort.reviewStatus, "pending")

  const started = await json(`/api/v1/retention/reviews/${created.body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start", note: "Validate compensation and workforce coverage evidence." }),
  })
  assert.equal(started.response.status, 200)
  assert.equal(started.body.status, "in_progress")

  const completed = await json(`/api/v1/retention/reviews/${created.body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "complete", note: "Evidence reviewed and accountable follow-up recorded." }),
  })
  assert.equal(completed.response.status, 200)
  assert.equal(completed.body.status, "completed")
})

test("insights reporting uses persisted workforce records and a bounded quarterly series", async () => {
  const [report, liveOnly] = await Promise.all([
    json("/api/v1/workforce?dataMode=all&from=2025-08-03&to=2026-08-02&period=quarter"),
    json("/api/v1/workforce?dataMode=live&from=2025-08-03&to=2026-08-02&period=quarter"),
  ])
  assert.equal(report.response.status, 200)
  assert.equal(liveOnly.response.status, 200)
  assert.equal(report.body.filters.dataMode, "all")
  assert.equal(report.body.filters.period, "quarter")
  assert.ok(report.body.kpis.activeEmployees >= liveOnly.body.kpis.activeEmployees)
  assert.ok(report.body.hiring.trend.length > 0)
  assert.ok(report.body.attrition.trend.length > 0)
  assert.ok(report.body.hiring.trend.length <= 5)
  assert.ok(report.body.attrition.trend.length <= 5)
  assert.ok(report.body.hiring.trend.every((row) => /^202[5-6] Q[1-4]$/.test(row.period)))
  assert.ok(report.body.attrition.trend.every((row) => /^202[5-6] Q[1-4]$/.test(row.period)))
  const department = report.body.decisionSupport.departments[0]
  assert.equal(department.attritionRate, department.activeEmployees + department.exits
    ? Number(((department.exits / (department.activeEmployees + department.exits)) * 100).toFixed(1))
    : 0)
  assert.equal(department.vacancyRate, department.activeEmployees
    ? Number(((department.openRequisitions / department.activeEmployees) * 100).toFixed(1))
    : 0)
})

test("insight exceptions create and complete durable work items", async () => {
  const filters = { dataMode: "all", from: "2025-08-03", to: "2026-08-02", period: "quarter" }
  const query = new URLSearchParams(filters).toString()
  const report = await json(`/api/v1/workforce?${query}`)
  assert.equal(report.response.status, 200)
  const signal = report.body.decisionSupport.actions[0]
  assert.ok(signal?.id)

  const created = await json("/api/v1/insights/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signalId: signal.id, filters: { from: filters.from, to: filters.to, period: filters.period } }),
  })
  assert.equal(created.response.status, 201)
  assert.match(created.body.id, /^INS-/)

  let status = created.body.status
  if (status === "pending") {
    const started = await json(`/api/v1/insights/actions/${created.body.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", note: "Validate the evidence and confirm an accountable operating plan." }),
    })
    assert.equal(started.response.status, 200)
    status = started.body.status
  }
  assert.equal(status, "in_progress")

  const completed = await json(`/api/v1/insights/actions/${created.body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "complete", note: "Evidence validated and the accountable follow-up was recorded." }),
  })
  assert.equal(completed.response.status, 200)
  assert.equal(completed.body.status, "completed")

  const [updated, inbox] = await Promise.all([
    json(`/api/v1/workforce?${query}`),
    json("/api/v1/hr/inbox"),
  ])
  assert.equal(updated.body.decisionSupport.actions.find((item) => item.id === signal.id)?.workItem?.id, created.body.id)
  const inboxItem = inbox.body.items.find((item) => item.id === created.body.id)
  assert.equal(inboxItem?.type, "insight")
  assert.equal(inboxItem?.isCompleted, true)
  assert.match(inboxItem?.completionNotes ?? "", /accountable follow-up/i)
})

test("operational workspaces contain actionable software-company workflows", async () => {
  const [inbox, workforce] = await Promise.all([
    json("/api/v1/hr/inbox"),
    json("/api/v1/workforce?dataMode=live"),
  ])
  assert.equal(inbox.response.status, 200)
  assert.equal(workforce.response.status, 200)

  const items = Array.isArray(inbox.body) ? inbox.body : inbox.body.items
  assert.ok(items.filter((item) => item.type === "leave").length >= 6)
  assert.ok(items.filter((item) => item.type === "hiring").length >= 5)
  assert.ok(items.filter((item) => item.type === "training").length >= 10)
  assert.ok(items.some((item) => item.isCompleted && item.completionNotes))
  assert.ok(items.some((item) => item.slaStatus === "overdue" && !item.isCompleted))
  assert.ok(items.every((item) => item.owner && item.nextAction && item.attentionReason && item.completionEffect))
  assert.ok(items.every((item) => item.reviewHref.startsWith("/inbox?") && item.recordHref.startsWith("/")))
  assert.ok(items.filter((item) => item.type === "leave").every((item) => item.recordHref.startsWith("/leaves?request=")))
  assert.ok(items.filter((item) => item.type === "training").every((item) => item.recordHref.startsWith("/courses?assignment=")))
  assert.ok(items.every((item) => Array.isArray(item.requestContext) && item.requestContext.length > 0))
  assert.ok(items.every((item) => ["overdue", "due_today", "due_soon", "on_track", "complete", "unscheduled"].includes(item.slaStatus)))
  const open = items.filter((item) => !item.isCompleted)
  assert.equal(inbox.body.summary.allOpen, open.length)
  assert.equal(inbox.body.summary.completed, items.filter((item) => item.isCompleted).length)
  assert.equal(inbox.body.summary.decisions, open.filter((item) => item.requiresDecision && item.actionable).length)
  assert.equal(inbox.body.summary.overdue, open.filter((item) => item.slaStatus === "overdue").length)
  assert.equal(inbox.body.summary.assignedToMe, open.filter((item) => item.actionable || item.ownerEmail?.toLowerCase() === "local-admin@laidbackhr.ai").length)

  assert.ok(workforce.body.leave.totalRequests >= 6)
  assert.ok(workforce.body.leave.currentlyAway.length > 0)
  assert.ok(workforce.body.leave.upcoming.length > 0)
  assert.ok(workforce.body.hiring.rows.some((row) => row.position === "Security Engineer"))
  assert.ok(workforce.body.hiring.rows.some((row) => row.position === "Senior Backend Engineer"))
  assert.ok(workforce.body.training.rows.some((row) => row.training_program === "Secure Coding Fundamentals"))
  assert.ok(workforce.body.training.rows.some((row) => row.training_program === "Incident Response Tabletop"))
})

test("dedicated leave and learning APIs expose operational records instead of dashboard slices", async () => {
  const [leave, learning] = await Promise.all([
    json("/api/v1/hr/leave"),
    json("/api/v1/hr/learning"),
  ])
  assert.equal(leave.response.status, 200)
  assert.equal(learning.response.status, 200)
  assert.equal(leave.body.summary.requests, leave.body.requests.length)
  assert.equal(leave.body.summary.reviewable, leave.body.requests.filter((row) => row.canDecide).length)
  assert.ok(leave.body.requests.every((row) => row.coverage && typeof row.coverage.departmentHeadcount === "number"))
  assert.ok(learning.body.courses.length > 0)
  assert.equal(learning.body.summary.assignments, learning.body.assignments.length)
  assert.ok(learning.body.assignments.every((row) => typeof row.isMandatory === "boolean" && typeof row.canComplete === "boolean"))
  assert.ok(learning.body.people.length > 0)
})

test("learning assignments use the course catalog and preserve completion evidence", async () => {
  const initial = await json("/api/v1/hr/learning")
  const existing = new Set(initial.body.assignments.filter((row) => row.status.toLowerCase() !== "completed").map((row) => `${row.employeeId}:${row.courseId}`))
  let selection
  for (const person of initial.body.people) {
    const course = initial.body.courses.find((item) => !existing.has(`${person.employeeId}:${item.id}`))
    if (course) { selection = { person, course }; break }
  }
  assert.ok(selection)
  const assigned = await json("/api/v1/hr/learning", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeId: selection.person.employeeId, courseId: selection.course.id, dueDate: "2031-08-15", note: "API lifecycle validation" }),
  })
  assert.equal(assigned.response.status, 201)
  assert.match(assigned.body.id, /^TRN-/)

  const completed = await json(`/api/v1/hr/learning/assignments/${assigned.body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assessmentScore: 92, note: "Completion evidence recorded by the operations API test." }),
  })
  assert.equal(completed.response.status, 200)
  const updated = await json("/api/v1/hr/learning")
  const row = updated.body.assignments.find((item) => item.id === assigned.body.id)
  assert.equal(row.status, "Completed")
  assert.equal(row.assessmentScore, 92)
  assert.match(row.completionNote, /Completion evidence recorded/)
})

test("leave decisions require a reason when declined and persist decision context", async () => {
  const learning = await json("/api/v1/hr/learning")
  const employeeId = learning.body.people[0].employeeId
  const offset = Date.now() % 250
  const start = new Date(Date.UTC(2034, 0, 1 + offset))
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  const created = await json("/api/v1/hr/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "leave", employeeId, leaveType: "Personal", startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), note: "Operations API validation" }),
  })
  assert.equal(created.response.status, 201)
  const missingReason = await json(`/api/v1/hr/leave/${created.body.id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "Rejected" }),
  })
  assert.equal(missingReason.response.status, 422)
  const reason = "Coverage is unavailable during the requested validation dates."
  const declined = await json(`/api/v1/hr/leave/${created.body.id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "Rejected", note: reason }),
  })
  assert.equal(declined.response.status, 200)
  const updated = await json("/api/v1/hr/leave")
  const row = updated.body.requests.find((item) => item.id === created.body.id)
  assert.equal(row.status, "Rejected")
  assert.equal(row.decisionNote, reason)
})

test("hiring work moves from decision to owned follow-up and records completion", async () => {
  const created = await json("/api/v1/hr/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "hiring",
      position: "Workflow Validation Engineer",
      department: "Research & Development",
      location: "Remote",
      employmentType: "Full-time",
      justification: "Validate accountable hiring workflow state transitions.",
    }),
  })
  assert.equal(created.response.status, 201)

  const requested = await json("/api/v1/hr/inbox")
  const requestedItem = requested.body.items.find((item) => item.id === created.body.id)
  assert.equal(requestedItem.status, "Requested")
  assert.equal(requestedItem.requiresDecision, true)
  assert.equal(requestedItem.nextAction, "Approve or decline the requisition.")
  assert.ok(requestedItem.ownerEmail)
  assert.ok(requestedItem.dueDate)
  assert.match(requestedItem.reviewHref, new RegExp(`^/inbox\\?view=decisions&type=hiring&item=${created.body.id}$`))
  assert.equal(requestedItem.recordHref, `/hiring?requisition=${created.body.id}`)
  assert.equal(requestedItem.requestContext.find((item) => item.label === "Employment type")?.value, "Full-time")
  assert.match(requestedItem.requestContext.find((item) => item.label === "Business justification")?.value ?? "", /accountable hiring workflow/)

  const approved = await json("/api/v1/hr/workflows/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: created.body.id, type: "hiring", action: "approve" }),
  })
  assert.equal(approved.response.status, 200)
  assert.equal(approved.body.status, "Open")

  const opened = await json("/api/v1/hr/inbox")
  const openedItem = opened.body.items.find((item) => item.id === created.body.id)
  assert.equal(openedItem.status, "Open")
  assert.equal(openedItem.requiresDecision, false)
  assert.equal(openedItem.isCompleted, false)
  assert.match(openedItem.nextAction, /Record recruiting progress/)
  assert.match(openedItem.reviewHref, new RegExp(`^/inbox\\?view=my_work&type=hiring&item=${created.body.id}$`))

  const followUp = await json(`/api/v1/hr/hiring/requisitions/${created.body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "follow_up", nextAction: "Confirm interview panel availability", dueDate: "2026-08-10", note: "Validation follow-up" }),
  })
  assert.equal(followUp.response.status, 200)

  const updatedOperations = await json("/api/v1/hr/hiring")
  assert.equal(updatedOperations.body.requisitions.find((item) => item.id === created.body.id)?.nextAction, "Confirm interview panel availability")
  assert.ok(updatedOperations.body.recentActivity.some((item) => item.requisitionId === created.body.id && item.action === "follow_up_updated"))

  const closed = await json(`/api/v1/hr/hiring/requisitions/${created.body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "close", note: "Validation workflow completed" }),
  })
  assert.equal(closed.response.status, 200)
  const completed = await json("/api/v1/hr/inbox")
  const completedItem = completed.body.items.find((item) => item.id === created.body.id)
  assert.equal(completedItem.isCompleted, true)
  assert.ok(completedItem.completedAt)
  assert.match(completedItem.completionNotes, /closed .*Workflow Validation Engineer/i)
})

test("declining a hiring request requires and stores an auditable reason", async () => {
  const created = await json("/api/v1/hr/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "hiring",
      position: "Decline Validation Engineer",
      department: "Research & Development",
      location: "Remote",
      employmentType: "Full-time",
      justification: "Validate that declined requisitions preserve decision evidence.",
    }),
  })
  assert.equal(created.response.status, 201)
  const missingReason = await json("/api/v1/hr/workflows/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: created.body.id, type: "hiring", action: "reject" }),
  })
  assert.equal(missingReason.response.status, 422)
  const reason = "The approved workforce plan does not include this headcount request."
  const rejected = await json("/api/v1/hr/workflows/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: created.body.id, type: "hiring", action: "reject", note: reason }),
  })
  assert.equal(rejected.response.status, 200)
  const inbox = await json("/api/v1/hr/inbox")
  const item = inbox.body.items.find((row) => row.id === created.body.id)
  assert.equal(item.isCompleted, true)
  assert.match(item.completionNotes, new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("hiring operations persist a candidate pipeline against approved requisitions", async () => {
  const initial = await json("/api/v1/hr/hiring")
  assert.equal(initial.response.status, 200)
  assert.ok(initial.body.requisitions.length >= 10)
  assert.ok(initial.body.requisitions.every((item) => !item.id.startsWith("HIR-DEMO-")))
  assert.ok(initial.body.candidates.length >= 10)
  assert.ok(initial.body.candidates.some((item) => item.requisitionId.startsWith("HIR-SOFTWARE-")))
  assert.ok(initial.body.summary.activeCandidates > 0)

  const created = await json("/api/v1/hr/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "hiring",
      position: "Candidate Pipeline Validation Engineer",
      department: "Research & Development",
      location: "Remote",
      employmentType: "Full-time",
      justification: "Validate that approved requisitions own persistent candidate records.",
    }),
  })
  assert.equal(created.response.status, 201)
  const approved = await json("/api/v1/hr/workflows/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: created.body.id, type: "hiring", action: "approve" }),
  })
  assert.equal(approved.response.status, 200)

  const candidateEmail = `pipeline-${Date.now()}@example.test`
  const candidate = await json("/api/v1/hr/hiring/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requisitionId: created.body.id, fullName: "Pipeline Test Candidate", email: candidateEmail, source: "Careers site", notes: "Validation record" }),
  })
  assert.equal(candidate.response.status, 201)
  assert.match(candidate.body.id, /^CAN-/)

  const skippedStage = await json(`/api/v1/hr/hiring/candidates/${candidate.body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage: "Interview", nextStep: "Invalid skipped stage" }),
  })
  assert.equal(skippedStage.response.status, 409)

  const screening = await json(`/api/v1/hr/hiring/candidates/${candidate.body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage: "Screening", nextStep: "Complete validation screen", nextStepDueAt: "2026-08-08" }),
  })
  assert.equal(screening.response.status, 200)
  assert.equal(screening.body.stage, "Screening")

  const missingReason = await json(`/api/v1/hr/hiring/candidates/${candidate.body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage: "Rejected" }),
  })
  assert.equal(missingReason.response.status, 422)

  const rejected = await json(`/api/v1/hr/hiring/candidates/${candidate.body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage: "Rejected", rejectedReason: "Validation completed" }),
  })
  assert.equal(rejected.response.status, 200)

  const persisted = await json("/api/v1/hr/hiring")
  assert.equal(persisted.response.status, 200)
  const persistedCandidate = persisted.body.candidates.find((item) => item.id === candidate.body.id)
  assert.equal(persistedCandidate.requisitionId, created.body.id)
  assert.equal(persistedCandidate.email, candidateEmail)
  assert.equal(persistedCandidate.stage, "Rejected")
  assert.equal(persistedCandidate.rejectedReason, "Validation completed")
  assert.ok(persisted.body.recentActivity.some((item) => item.entityId === candidate.body.id && item.action === "candidate_added"))
  assert.ok(persisted.body.recentActivity.some((item) => item.entityId === candidate.body.id && item.action === "stage_changed"))

  const closed = await json(`/api/v1/hr/hiring/requisitions/${created.body.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "close", note: "Candidate pipeline validation completed" }),
  })
  assert.equal(closed.response.status, 200)
})

test("a hired candidate creates a linked preboarding employee record", async () => {
  const requisition = await json("/api/v1/hr/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "hiring", position: "Preboarding Validation Engineer", department: "Research & Development", location: "Remote", employmentType: "Full-time", justification: "Validate the recruiting to employee system-of-record handoff." }),
  })
  assert.equal(requisition.response.status, 201)
  const approved = await json("/api/v1/hr/workflows/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: requisition.body.id, type: "hiring", action: "approve" }) })
  assert.equal(approved.response.status, 200)
  const email = `preboarding-${Date.now()}@example.test`
  const candidate = await json("/api/v1/hr/hiring/candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requisitionId: requisition.body.id, fullName: "Preboarding Test Candidate", email, source: "Careers site" }) })
  assert.equal(candidate.response.status, 201)
  for (const stage of ["Screening", "Interview", "Offer"]) {
    const moved = await json(`/api/v1/hr/hiring/candidates/${candidate.body.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) })
    assert.equal(moved.response.status, 200)
  }
  const missingStart = await json(`/api/v1/hr/hiring/candidates/${candidate.body.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "Hired" }) })
  assert.equal(missingStart.response.status, 422)
  const hired = await json(`/api/v1/hr/hiring/candidates/${candidate.body.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "Hired", startDate: "2031-09-01" }) })
  assert.equal(hired.response.status, 200)
  assert.match(hired.body.message, /preboarding profile EMP-/)
  const people = await json(`/api/v1/hr/people?search=${encodeURIComponent(email)}`)
  assert.equal(people.response.status, 200)
  assert.equal(people.body.items.length, 1)
  assert.equal(people.body.items[0].employment_status, "Preboarding")
  assert.equal(people.body.items[0].hire_date, "2031-09-01")
  assert.equal(people.body.items[0].job_title, "Preboarding Validation Engineer")
})

test("grounded data endpoints expose the real dataset", async () => {
  const [dashboard, model, schema, employees, dictionary] = await Promise.all([
    json("/api/v1/dashboard"),
    json("/api/v1/model"),
    json("/api/v1/schema"),
    json("/api/v1/employees?risk=high&limit=5"),
    json("/api/v1/data-dictionary"),
  ])
  assert.equal(dashboard.body.kpis[0].value, "1,470")
  assert.equal(model.body.metrics.roc_auc.toFixed(2), "0.73")
  assert.ok(schema.body.excludedFromModel.includes("Age"))
  assert.equal(employees.body.items.length, 5)
  assert.equal(dictionary.body.rows, 1470)
})

test("web-runtime prediction exactly matches the Python model", async () => {
  const input = {
    Department: "Sales",
    DistanceFromHome: 10,
    Education: 3,
    EducationField: "Marketing",
    EnvironmentSatisfaction: 2,
    JobSatisfaction: 2,
    MonthlyIncome: 4500,
    NumCompaniesWorked: 3,
    WorkLifeBalance: 2,
    YearsAtCompany: 2,
  }
  const { response, body } = await json("/api/v1/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  assert.equal(response.status, 200)
  assert.equal(body.probability, 0.193043)
  assert.equal(body.riskScore, 19.3)
  assert.equal(body.referenceProbability, 0.067964)
  assert.deepEqual(body.topDrivers.map((driver) => driver.feature), [
    "Department",
    "YearsAtCompany",
    "WorkLifeBalance",
  ])
})

test("prediction rejects unsupported categories", async () => {
  const { response } = await json("/api/v1/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Department: "Unknown",
      DistanceFromHome: 10,
      Education: 3,
      EducationField: "Marketing",
      EnvironmentSatisfaction: 2,
      JobSatisfaction: 2,
      MonthlyIncome: 4500,
      NumCompaniesWorked: 3,
      WorkLifeBalance: 2,
      YearsAtCompany: 2,
    }),
  })
  assert.equal(response.status, 422)
})

test("LangChain agent invokes MCP tools and returns its trace", async () => {
  const { response, body } = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Which department has the highest predicted risk?" }),
  })
  assert.equal(response.status, 200)
  assert.equal(body.provider, "langchain-mcp-deterministic-orchestrator")
  assert.match(body.conversationId, /^CONV-/)
  assert.ok(body.tools.some((trace) => trace.tool === "analyze_attrition_signals" && trace.status === "completed"))
  assert.match(body.answer, /recorded exits/)
  assert.ok(body.context.some((item) => item.section === "Attrition and model risk"))
})

test("analytics assistant handles a greeting without an irrelevant scope warning", async () => {
  const { response, body } = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  })
  assert.equal(response.status, 200)
  assert.equal(body.provider, "conversation")
  assert.deepEqual(body.tools, [])
  assert.deepEqual(body.context, [])
  assert.match(body.answer, /^Hi\./)
})

test("workspace search returns persisted records with direct review routes", async () => {
  const { response, body } = await json("/api/v1/search?q=engineer")
  assert.equal(response.status, 200)
  assert.ok(body.results.length > 0)
  assert.ok(body.results.some((item) => item.section === "Hiring" && item.href.startsWith("/hiring?requisition=")))
  assert.ok(body.results.every((item) => item.kind === "record" || item.kind === "person"))
})

test("analytics assistant streams grounded output and persists the completed response", async () => {
  const response = await fetch(baseUrl + "/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ message: "Give me a concise workforce summary", stream: true }),
  })
  assert.equal(response.status, 200)
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/)
  const stream = await response.text()
  assert.match(stream, /event: conversation/)
  assert.match(stream, /event: delta/)
  assert.match(stream, /event: metadata/)
  assert.match(stream, /event: done/)
  assert.match(stream, /workforce_overview/)

  const conversationId = stream.match(/event: conversation\ndata: \{"conversationId":"([^"]+)"\}/)?.[1]
  assert.ok(conversationId)
  const history = await json(`/api/v1/chat/conversations/${conversationId}`)
  assert.equal(history.response.status, 200)
  assert.equal(history.body.messages.at(-1)?.role, "assistant")
  assert.ok(history.body.messages.at(-1)?.content.length > 0)
  const removed = await json(`/api/v1/chat/conversations/${conversationId}`, { method: "DELETE" })
  assert.equal(removed.response.status, 200)
})

test("analytics assistant persists conversation history and uses it for follow-up filters", async () => {
  const first = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Compare attrition across departments" }),
  })
  assert.equal(first.response.status, 200)
  assert.match(first.body.conversationId, /^CONV-/)

  const followUp = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "What about Sales?", conversationId: first.body.conversationId }),
  })
  assert.equal(followUp.response.status, 200)
  assert.ok(followUp.body.tools.some((trace) => trace.tool === "analyze_attrition_signals" && trace.input.department === "Sales"))

  const stored = await json(`/api/v1/chat/conversations/${first.body.conversationId}`)
  assert.equal(stored.response.status, 200)
  assert.equal(stored.body.messages.length, 4)
  assert.deepEqual(stored.body.messages.map((message) => message.role), ["user", "assistant", "user", "assistant"])

  const listed = await json("/api/v1/chat/conversations")
  assert.equal(listed.response.status, 200)
  assert.ok(listed.body.conversations.some((conversation) => conversation.id === first.body.conversationId && conversation.messageCount === 4))
})

test("analytics assistant deletes an owned conversation and its message history", async () => {
  const created = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Summarize hiring activity for this deletion test" }),
  })
  assert.equal(created.response.status, 200)
  const conversationId = created.body.conversationId

  const deleted = await json(`/api/v1/chat/conversations/${conversationId}`, { method: "DELETE" })
  assert.equal(deleted.response.status, 200)
  assert.equal(deleted.body.deleted, true)
  assert.equal(deleted.body.conversation.id, conversationId)

  const stored = await json(`/api/v1/chat/conversations/${conversationId}`)
  assert.equal(stored.response.status, 404)
  const listed = await json("/api/v1/chat/conversations")
  assert.equal(listed.response.status, 200)
  assert.ok(!listed.body.conversations.some((conversation) => conversation.id === conversationId))
  const repeated = await json(`/api/v1/chat/conversations/${conversationId}`, { method: "DELETE" })
  assert.equal(repeated.response.status, 404)
})

test("analytics assistant resolves focused follow-ups without topic contamination", async () => {
  const first = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Top 5 employees with attrition risk" }),
  })
  assert.equal(first.response.status, 200)
  assert.equal(first.body.tools.length, 1)
  assert.equal(first.body.tools[0].tool, "analyze_attrition_signals")
  assert.equal(first.body.tools[0].input.recordScope, "high_risk")
  assert.equal(first.body.tools[0].input.limit, 5)
  assert.equal(first.body.tools[0].resultContext.employeeIds.length, 5)
  assert.equal((first.body.answer.match(/Demo Employee/g) ?? []).length, 5)

  const limited = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Just top 5", conversationId: first.body.conversationId }),
  })
  assert.equal(limited.response.status, 200)
  assert.equal(limited.body.tools.length, 1)
  assert.equal(limited.body.tools[0].input.recordScope, "high_risk")
  assert.equal(limited.body.tools[0].input.limit, 5)
  assert.equal((limited.body.answer.match(/Demo Employee/g) ?? []).length, 5)

  const explanation = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Can you tell me what could the reason be?", conversationId: first.body.conversationId }),
  })
  assert.equal(explanation.response.status, 200)
  assert.equal(explanation.body.tools.length, 1)
  assert.equal(explanation.body.tools[0].input.recordScope, "high_risk")
  assert.deepEqual(explanation.body.tools[0].input.employeeIds, first.body.tools[0].resultContext.employeeIds)
  assert.match(explanation.body.answer, /Why the model flagged these 5 synthetic profiles/)
  assert.match(explanation.body.answer, /Model contributors:/)
  assert.match(explanation.body.answer, /HR review:/)
  assert.match(explanation.body.answer, /not proven reasons/)
  assert.equal((explanation.body.answer.match(/Demo Employee/g) ?? []).length, 5)

  const workforcePlan = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "What should I do to prevent attrition?", conversationId: first.body.conversationId }),
  })
  assert.equal(workforcePlan.response.status, 200)
  assert.equal(workforcePlan.body.tools.length, 1)
  assert.equal(workforcePlan.body.tools[0].input.recordScope, "summary")
  assert.match(workforcePlan.body.answer, /Retention operating plan/)
  assert.match(workforcePlan.body.answer, /30\/60\/90-day follow-up/)
  assert.match(workforcePlan.body.answer, /Skills and continuity/)
  assert.match(workforcePlan.body.answer, /360-degree checks/)

  const cohortPlan = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "What should I do to prevent attrition for these employees?", conversationId: first.body.conversationId }),
  })
  assert.equal(cohortPlan.response.status, 200)
  assert.deepEqual(cohortPlan.body.tools.map((trace) => trace.tool), ["analyze_attrition_signals", "review_people_operations"])
  assert.deepEqual(cohortPlan.body.tools.map((trace) => trace.iteration), [1, 2])
  assert.deepEqual(cohortPlan.body.tools[0].input.employeeIds, first.body.tools[0].resultContext.employeeIds)
  assert.deepEqual(cohortPlan.body.tools[1].input.employeeIds, first.body.tools[0].resultContext.employeeIds)
  assert.match(cohortPlan.body.answer, /Retention review plan · 5 synthetic model-scored profiles/)
  assert.match(cohortPlan.body.answer, /Review cycle/)
  assert.match(cohortPlan.body.answer, /Promotion context for the selected cohort/)
  assert.doesNotMatch(cohortPlan.body.answer, /Attrition summary/)

  const managers = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Where are exits concentrated by manager?", conversationId: first.body.conversationId }),
  })
  assert.equal(managers.response.status, 200)
  assert.deepEqual(managers.body.tools.map((trace) => trace.tool), ["workforce_overview"])
  assert.match(managers.body.answer, /Manager exit concentration/)
  assert.doesNotMatch(managers.body.answer, /Historical model review/)

  const summary = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Summarize the current workforce and open HR work", conversationId: first.body.conversationId }),
  })
  assert.equal(summary.response.status, 200)
  assert.deepEqual(summary.body.tools.map((trace) => trace.tool), ["workforce_overview"])
  assert.match(summary.body.answer, /Workforce summary/)
  assert.doesNotMatch(summary.body.answer, /joined synthetic employee records/)

  const replacement = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Which departments have a replacement coverage gap?", conversationId: first.body.conversationId }),
  })
  assert.equal(replacement.response.status, 200)
  assert.deepEqual(replacement.body.tools.map((trace) => trace.tool), ["workforce_overview"])
  assert.match(replacement.body.answer, /Replacement coverage/)

  const mobility = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Which active employees meet the mobility review criteria?", conversationId: first.body.conversationId }),
  })
  assert.equal(mobility.response.status, 200)
  assert.deepEqual(mobility.body.tools.map((trace) => trace.tool), ["review_people_operations"])
  assert.equal(mobility.body.tools[0].input.domain, "promotions")
  assert.match(mobility.body.answer, /Mobility review/)
})

test("analytics assistant explains an explicitly named model-scored profile", async () => {
  const { response, body } = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Why is DEMO-EMP-0537 at high attrition risk?" }),
  })
  assert.equal(response.status, 200)
  assert.equal(body.tools.length, 1)
  assert.deepEqual(body.tools[0].input.query, "DEMO-EMP-0537")
  assert.match(body.answer, /Demo Employee 0537/)
  assert.match(body.answer, /Environment satisfaction is 1\/4/)
  assert.match(body.answer, /HR review:/)
  assert.doesNotMatch(body.answer, /proven cause/i)
})

test("analytics assistant returns employee records joined to observed attrition", async () => {
  const { response, body } = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Pull up records of employees with attrition" }),
  })
  assert.equal(response.status, 200)
  assert.ok(body.tools.some((trace) => trace.tool === "analyze_attrition_signals" && trace.status === "completed"))
  assert.match(body.answer, /Demo Employee/)
  assert.match(body.answer, /recorded exit \d{4}-\d{2}-\d{2}/)
  assert.match(body.answer, /synthetic demonstration profiles/)
})

test("MCP server lists and calls the HR tools", async () => {
  const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }
  const listed = await json("/api/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) })
  assert.equal(listed.response.status, 200)
  assert.equal(listed.body.result.tools.length, 5)
  assert.ok(listed.body.result.tools.some((tool) => tool.name === "review_people_operations"))
  assert.ok(listed.body.result.tools.some((tool) => tool.name === "find_employee_records"))
  const called = await json("/api/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "workforce_overview", arguments: {} } }) })
  assert.equal(called.response.status, 200)
  assert.match(called.body.result.content[0].text, /dataMode/)
})

test("report and Power BI exports are valid files", async () => {
  const [pdf, workbook, feed] = await Promise.all([
    fetch(baseUrl + "/api/v1/reports?format=pdf&department=Sales"),
    fetch(baseUrl + "/api/v1/reports?format=xlsx&department=Sales"),
    fetch(baseUrl + "/api/v1/power-bi/leave?department=Sales"),
  ])
  assert.equal(pdf.status, 200)
  assert.equal(workbook.status, 200)
  assert.equal(feed.status, 200)
  assert.match(pdf.headers.get("content-disposition") ?? "", /workforce-decision-brief\.pdf/)
  assert.match(workbook.headers.get("content-disposition") ?? "", /workforce-analysis\.xlsx/)
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF")
  const workbookBytes = Buffer.from(await workbook.arrayBuffer())
  assert.equal(workbookBytes.subarray(0, 2).toString(), "PK")
  assert.ok(workbookBytes.length > 100_000)
  assert.match(await feed.text(), /^id,employee_id,leave_type/m)
})

test("CSV imports validate before applying and record an auditable job", async () => {
  const employeeId = `IMPORT-${Date.now()}`
  const rows = [{
    employee_id: employeeId,
    first_name: "Import",
    last_name: "Validation",
    preferred_name: "",
    work_email: `${employeeId.toLowerCase()}@example.test`,
    phone: "",
    department: "Research & Development",
    job_title: "Data Engineer",
    location: "Remote",
    manager: "People Operations",
    manager_id: "",
    hire_date: "2026-08-05",
    employment_type: "Full-time",
    employment_status: "Active",
    tenure_years: "0",
  }]
  const validated = await json("/api/v1/data/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "validate", domain: "employees", filename: "employees-test.csv", mode: "merge", rows }),
  })
  assert.equal(validated.response.status, 200)
  assert.equal(validated.body.preview.canApply, true)
  assert.equal(validated.body.preview.inserts, 1)
  assert.equal(validated.body.preview.updates, 0)

  const applied = await json("/api/v1/data/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "apply", domain: "employees", filename: "employees-test.csv", mode: "merge", rows }),
  })
  assert.equal(applied.response.status, 201)
  assert.equal(applied.body.imported, 1)
  assert.equal(applied.body.preview.inserts, 1)

  const status = await json("/api/v1/data/status")
  assert.equal(status.response.status, 200)
  assert.ok(status.body.imports.some((job) => job.id === applied.body.jobId && job.status === "completed" && job.insertedRows === 1))
  assert.ok(status.body.summary.completedImports >= 1)

  const duplicate = await json("/api/v1/data/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "validate", domain: "employees", filename: "employees-test.csv", mode: "merge", rows: [rows[0], rows[0]] }),
  })
  assert.equal(duplicate.response.status, 200)
  assert.equal(duplicate.body.preview.canApply, false)
  assert.ok(duplicate.body.preview.issues.some((issue) => issue.code === "duplicate_id"))
})

test("HR admins can manage an employee lifecycle with an attributable activity log", async () => {
  const employeeId = `TEST-${Date.now()}`
  const created = await json("/api/v1/hr/people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employee_id: employeeId,
      first_name: "Test",
      last_name: "Person",
      preferred_name: "",
      work_email: `${employeeId.toLowerCase()}@example.test`,
      phone: "",
      department: "People",
      job_title: "HR Operations Specialist",
      location: "Remote",
      manager_id: "",
      hire_date: "2026-08-03",
      employment_type: "Full-time",
      employment_status: "Preboarding",
    }),
  })
  assert.equal(created.response.status, 201)
  assert.equal(created.body.employee_id, employeeId)
  assert.equal(created.body.version, 1)

  const updated = await json(`/api/v1/hr/people/${employeeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...created.body,
      job_title: "People Operations Partner",
      employment_status: "Active",
      version: created.body.version,
    }),
  })
  assert.equal(updated.response.status, 200)
  assert.equal(updated.body.version, 2)
  assert.equal(updated.body.job_title, "People Operations Partner")

  const stale = await json(`/api/v1/hr/people/${employeeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...created.body, version: 1 }),
  })
  assert.equal(stale.response.status, 409)

  const profile = await json(`/api/v1/hr/people/${employeeId}`)
  assert.equal(profile.response.status, 200)
  assert.ok(profile.body.activity.some((item) => item.event_type === "created"))
  assert.ok(profile.body.activity.some((item) => item.event_type === "updated"))
  assert.ok(profile.body.activity.every((item) => item.actor_email === "local-admin@laidbackhr.ai"))

  const archived = await json(`/api/v1/hr/people/${employeeId}/archive`, { method: "POST" })
  assert.equal(archived.response.status, 200)
  assert.ok(archived.body.archived_at)
  const restored = await json(`/api/v1/hr/people/${employeeId}/restore`, { method: "POST" })
  assert.equal(restored.response.status, 200)
  assert.equal(restored.body.archived_at, null)
  const finalArchive = await json(`/api/v1/hr/people/${employeeId}/archive`, { method: "POST" })
  assert.equal(finalArchive.response.status, 200)
})
