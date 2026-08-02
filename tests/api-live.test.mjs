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
  assert.deepEqual(body.status.map((item) => item.domain), ["employees", "hiring", "attrition", "leave", "training", "promotions"])
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
  assert.ok(items.filter((item) => item.actionable).length >= 15)
  assert.ok(items.some((item) => item.isCompleted && item.completionNotes))
  assert.ok(items.some((item) => item.slaStatus === "overdue" && !item.isCompleted))
  assert.ok(items.every((item) => item.owner && item.nextAction && item.attentionReason && item.completionEffect))
  assert.ok(items.every((item) => item.reviewHref.startsWith("/inbox?") && item.recordHref.startsWith("/")))
  assert.ok(items.every((item) => Array.isArray(item.requestContext) && item.requestContext.length > 0))
  assert.ok(items.every((item) => ["overdue", "due_today", "due_soon", "on_track", "complete", "unscheduled"].includes(item.slaStatus)))

  assert.ok(workforce.body.leave.pending >= 6)
  assert.ok(workforce.body.leave.currentlyAway.length > 0)
  assert.ok(workforce.body.leave.upcoming.length > 0)
  assert.ok(workforce.body.hiring.rows.some((row) => row.position === "Security Engineer"))
  assert.ok(workforce.body.hiring.rows.some((row) => row.position === "Senior Backend Engineer"))
  assert.ok(workforce.body.training.rows.some((row) => row.training_program === "Secure Coding Fundamentals"))
  assert.ok(workforce.body.training.rows.some((row) => row.training_program === "Incident Response Tabletop"))
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

test("grounded data endpoints expose the real dataset", async () => {
  const [dashboard, model, schema, employees, dictionary] = await Promise.all([
    json("/api/v1/dashboard"),
    json("/api/v1/model"),
    json("/api/v1/schema"),
    json("/api/v1/employees?risk=high&limit=5"),
    json("/api/v1/data-dictionary"),
  ])
  assert.equal(dashboard.body.kpis[0].value, "1,470")
  assert.equal(model.body.metrics.roc_auc.toFixed(2), "0.71")
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
  assert.equal(body.probability, 0.429134)
  assert.equal(body.riskScore, 42.9)
  assert.deepEqual(body.topDrivers.map((driver) => driver.feature), [
    "Department",
    "MonthlyIncome",
    "EnvironmentSatisfaction",
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
  assert.match(workforcePlan.body.answer, /Workforce retention plan/)
  assert.match(workforcePlan.body.answer, /30-day operating plan/)

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
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF")
  assert.equal(Buffer.from(await workbook.arrayBuffer()).subarray(0, 2).toString(), "PK")
  assert.match(await feed.text(), /^id,employee_id,leave_type/m)
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
