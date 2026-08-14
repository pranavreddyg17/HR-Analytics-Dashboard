import assert from "node:assert/strict"
import test from "node:test"

const baseUrl = process.env.LAIDBACKHR_BASE_URL ?? "http://localhost:3000"
const allowMutations = process.env.LAIDBACKHR_LIVE_MUTATIONS === "true"

async function request(path, init) {
  return fetch(baseUrl + path, init)
}

async function json(path, init) {
  const response = await request(path, init)
  const body = await response.json()
  return { response, body }
}

test("canonical workspace routes render and legacy routes preserve query state", async () => {
  const routes = ["/", "/people", "/inbox", "/onboarding", "/leaves", "/courses", "/exits", "/assets", "/insights", "/attrition", "/assistant", "/imports", "/admin", "/access", "/employee"]
  const responses = await Promise.all(routes.map((path) => request(path)))
  responses.forEach((response, index) => assert.equal(response.status, 200, `${routes[index]} should render`))

  const redirects = [
    ["/hiring?requisition=REQ-1", "/onboarding?requisition=REQ-1&view=talent"],
    ["/time-off?department=Sales", "/leaves?department=Sales"],
    ["/learning?q=security", "/courses?q=security"],
    ["/ai-agents?conversation=CONV-1", "/assistant?conversation=CONV-1"],
    ["/data?domain=employees", "/imports?domain=employees"],
  ]
  for (const [legacy, canonical] of redirects) {
    const response = await request(legacy, { redirect: "manual" })
    assert.ok([307, 308].includes(response.status), `${legacy} should redirect`)
    const location = new URL(response.headers.get("location"), baseUrl)
    assert.equal(location.pathname + location.search, canonical)
  }
})

test("readiness reports the Azure-native runtime contract", async () => {
  const { response, body } = await json("/api/v1/ready")
  assert.equal(response.status, 200)
  assert.equal(body.status, "ready")
  assert.equal(body.database.engine, "postgresql")
  assert.equal(body.model.runtime, "embedded")
})

test("health exposes the model, analytics, RAG, workflow, and reporting capabilities", async () => {
  const { response, body } = await json("/api/v1/health")
  assert.equal(response.status, 200)
  assert.equal(body.service, "LaidbackHR.AI")
  for (const capability of ["prediction", "groundedAnalytics", "ragKnowledge", "employeeCommunicationWorkflows", "workforceWarehouse", "mcpTools", "langchainAgent", "reportExports"]) {
    assert.equal(body.capabilities[capability], "ready", `${capability} should be ready`)
  }
})

test("workforce analytics are database-backed and internally consistent", async () => {
  const { response, body } = await json("/api/v1/workforce?period=quarter")
  assert.equal(response.status, 200)
  assert.equal(body.filters.period, "quarter")
  assert.ok(Array.isArray(body.hiring.trend))
  assert.ok(Array.isArray(body.attrition.trend))
  assert.ok(Array.isArray(body.leave.byType))
  assert.ok(Array.isArray(body.training.byProgram))
  assert.ok(Array.isArray(body.promotions.byDepartment))
  assert.ok(Array.isArray(body.decisionSupport.departments))
  assert.ok(Array.isArray(body.decisionSupport.actions))
  assert.ok(Array.isArray(body.status))
  assert.deepEqual(body.status.map((row) => row.domain), ["employees", "hiring", "attrition", "leave", "training", "promotions"])

  for (const department of body.decisionSupport.departments) {
    const expectedAttrition = department.activeEmployees + department.exits
      ? Number(((department.exits / (department.activeEmployees + department.exits)) * 100).toFixed(1))
      : 0
    const expectedVacancy = department.activeEmployees
      ? Number(((department.openRequisitions / department.activeEmployees) * 100).toFixed(1))
      : 0
    assert.equal(department.attritionRate, expectedAttrition)
    assert.equal(department.vacancyRate, expectedVacancy)
  }
})

test("operational APIs expose persisted queue, leave, learning, and hiring contracts", async () => {
  const [inbox, leave, learning, hiring] = await Promise.all([
    json("/api/v1/hr/inbox"),
    json("/api/v1/hr/leave"),
    json("/api/v1/hr/learning"),
    json("/api/v1/hr/hiring"),
  ])
  for (const result of [inbox, leave, learning, hiring]) assert.equal(result.response.status, 200)

  assert.ok(Array.isArray(inbox.body.items))
  assert.equal(inbox.body.summary.allOpen, inbox.body.items.filter((item) => !item.isCompleted).length)
  assert.ok(inbox.body.items.every((item) => item.id && item.owner && item.nextAction && Array.isArray(item.actions)))
  assert.ok(Array.isArray(leave.body.requests))
  assert.equal(leave.body.summary.requests, leave.body.requests.length)
  assert.ok(Array.isArray(learning.body.assignments))
  assert.equal(learning.body.summary.assignments, learning.body.assignments.length)
  assert.ok(Array.isArray(hiring.body.requisitions))
  assert.ok(Array.isArray(hiring.body.candidates))
})

test("workspace search returns only navigable persisted results", async () => {
  const { response, body } = await json("/api/v1/search?q=engineer")
  assert.equal(response.status, 200)
  assert.ok(Array.isArray(body.results))
  assert.ok(body.results.every((item) => ["record", "person"].includes(item.kind)))
  assert.ok(body.results.every((item) => typeof item.href === "string" && item.href.startsWith("/")))
  assert.ok(body.results.filter((item) => item.section === "Hiring").every((item) => item.href.startsWith("/onboarding?")))
})

test("the explainable prediction runtime validates inputs and returns bounded output", async () => {
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
  const prediction = await json("/api/v1/predict", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })
  assert.equal(prediction.response.status, 200)
  assert.ok(prediction.body.probability >= 0 && prediction.body.probability <= 1)
  assert.ok(Array.isArray(prediction.body.topDrivers) && prediction.body.topDrivers.length > 0)

  const invalid = await json("/api/v1/predict", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, Department: "Unknown" }) })
  assert.equal(invalid.response.status, 422)
})

test("integration API exposes reporting, people, operations, workflows, retention, asset, and model contracts", async () => {
  const [capabilities, overview, workforceImpact, model, exits, assets, people, onboarding, recruiting, leave, learning, workItems, workflowCatalog] = await Promise.all([
    json("/api/v1/integrations/v1/capabilities"),
    json("/api/v1/integrations/v1/insights?view=overview&period=quarter"),
    json("/api/v1/integrations/v1/insights?view=workforce-impact"),
    json("/api/v1/integrations/v1/retention/model"),
    json("/api/v1/integrations/v1/exits"),
    json("/api/v1/integrations/v1/assets"),
    json("/api/v1/integrations/v1/people?limit=2"),
    json("/api/v1/integrations/v1/onboarding?limit=2"),
    json("/api/v1/integrations/v1/recruiting?limit=2"),
    json("/api/v1/integrations/v1/leave?limit=2"),
    json("/api/v1/integrations/v1/learning?limit=2"),
    json("/api/v1/integrations/v1/work-items?limit=2"),
    json("/api/v1/integrations/v1/workflows/catalog"),
  ])
  for (const result of [capabilities, overview, workforceImpact, model, exits, assets, people, onboarding, recruiting, leave, learning, workItems, workflowCatalog]) assert.equal(result.response.status, 200)
  assert.ok(capabilities.body.data.endpoints.some((endpoint) => endpoint.path.endsWith("/retention/predict")))
  assert.ok(capabilities.body.data.endpoints.some((endpoint) => endpoint.path.endsWith("/exits")))
  assert.ok(capabilities.body.data.endpoints.some((endpoint) => endpoint.path.endsWith("/assets")))
  assert.ok(capabilities.body.data.endpoints.some((endpoint) => endpoint.path.endsWith("/assistant/conversations")))
  assert.ok(capabilities.body.data.endpoints.some((endpoint) => endpoint.path.endsWith("/workflows/requests")))
  assert.equal(overview.body.data.view, "overview")
  assert.ok(Array.isArray(overview.body.data.departments))
  assert.equal(workforceImpact.body.data.view, "workforce-impact")
  assert.ok(Array.isArray(workforceImpact.body.data.workforceImpact.roles))
  assert.ok(model.body.data.metadata.model_name)
  assert.ok(model.body.data.inputSchema.threshold > 0)
  assert.ok(Array.isArray(exits.body.data.items))
  assert.ok(Array.isArray(assets.body.data.items))
  assert.ok(Array.isArray(people.body.data.items))
  assert.ok(Array.isArray(onboarding.body.data.joiners.items))
  assert.ok(Array.isArray(recruiting.body.data.requisitions.items))
  assert.ok(Array.isArray(leave.body.data.requests.items))
  assert.ok(Array.isArray(learning.body.data.assignments.items))
  assert.ok(Array.isArray(workItems.body.data.workItems.items))
  assert.equal(workflowCatalog.body.data.controls.executeRequiresIdempotencyKey, true)

  const prediction = await json("/api/v1/integrations/v1/retention/predict", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ Department: "Sales", DistanceFromHome: 10, Education: 3, EducationField: "Marketing", EnvironmentSatisfaction: 2, JobSatisfaction: 2, MonthlyIncome: 4500, NumCompaniesWorked: 3, WorkLifeBalance: 2, YearsAtCompany: 2 }),
  })
  assert.equal(prediction.response.status, 200)
  assert.ok(prediction.body.data.probability >= 0 && prediction.body.data.probability <= 1)
  assert.equal(prediction.response.headers.get("cache-control"), "no-store")
})

test("admin monitor exposes internal usage even when Azure reader roles are unavailable", async () => {
  const { response, body } = await json("/api/v1/admin/metrics")
  assert.equal(response.status, 200)
  assert.equal(body.usage.status, "ready")
  assert.ok(body.usage.data.users.total >= 1)
  assert.ok(["ready", "unavailable"].includes(body.application.status))
  assert.ok(["ready", "unavailable"].includes(body.cost.status))
})

test("MCP exposes the production HR tools and can call the workforce tool", async () => {
  const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }
  const listed = await json("/api/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) })
  assert.equal(listed.response.status, 200)
  assert.ok(listed.body.result.tools.length >= 9)
  for (const name of ["workforce_overview", "review_work_queue", "review_people_operations", "find_employee_records", "review_exit_and_asset_operations"]) {
    assert.ok(listed.body.result.tools.some((tool) => tool.name === name), `${name} should be available`)
  }
  const called = await json("/api/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "workforce_overview", arguments: {} } }) })
  assert.equal(called.response.status, 200)
  assert.match(called.body.result.content[0].text, /dataMode/)
})

test("PDF, workbook, and reporting feeds remain valid for empty or populated workspaces", async () => {
  const [pdf, workbook, feed] = await Promise.all([
    request("/api/v1/reports?format=pdf"),
    request("/api/v1/reports?format=xlsx"),
    request("/api/v1/power-bi/leave"),
  ])
  assert.equal(pdf.status, 200)
  assert.equal(workbook.status, 200)
  assert.equal(feed.status, 200)
  const pdfBytes = Buffer.from(await pdf.arrayBuffer())
  const workbookBytes = Buffer.from(await workbook.arrayBuffer())
  assert.equal(pdfBytes.subarray(0, 4).toString(), "%PDF")
  assert.equal(workbookBytes.subarray(0, 2).toString(), "PK")
  assert.ok(pdfBytes.length > 1_000)
  assert.ok(workbookBytes.length > 2_000)
  assert.match(await feed.text(), /^id,employee_id,leave_type/m)
})

test("assistant conversation persistence and streaming work when live mutations are enabled", { skip: !allowMutations }, async () => {
  const response = await request("/api/v1/chat", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({ message: "Summarize the current work queue", pageContext: { key: "inbox", route: "/inbox", label: "Inbox", filters: {} }, stream: true }),
  })
  assert.equal(response.status, 200)
  const stream = await response.text()
  assert.match(stream, /event: conversation/)
  assert.match(stream, /event: delta/)
  assert.match(stream, /event: done/)
  const conversationId = stream.match(/event: conversation\ndata: \{"conversationId":"([^"]+)"\}/)?.[1]
  assert.ok(conversationId)
  const stored = await json(`/api/v1/chat/conversations/${conversationId}`)
  assert.equal(stored.response.status, 200)
  assert.equal(stored.body.messages.at(-1)?.role, "assistant")
  const removed = await json(`/api/v1/chat/conversations/${conversationId}`, { method: "DELETE" })
  assert.equal(removed.response.status, 200)
})
