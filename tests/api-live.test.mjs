import assert from "node:assert/strict"
import test from "node:test"

const baseUrl = process.env.LAIDBACKHR_BASE_URL ?? "http://localhost:3000"

async function json(path, init) {
  const response = await fetch(baseUrl + path, init)
  const body = await response.json()
  return { response, body }
}

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
