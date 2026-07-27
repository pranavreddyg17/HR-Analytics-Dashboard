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
    reviewActions: "ready",
  })
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

test("analytics agent stays grounded in model facts", async () => {
  const { response, body } = await json("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Which department has the highest predicted risk?" }),
  })
  assert.equal(response.status, 200)
  assert.equal(body.provider, "grounded-analytics-engine")
  assert.match(body.answer, /Sales has the highest average predicted risk/)
})

test("review action status persists and can be restored", async () => {
  const update = await json("/api/v1/actions/A-01", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "running" }),
  })
  assert.equal(update.response.status, 200)
  const after = await json("/api/v1/actions")
  assert.equal(after.body.items.find((item) => item.id === "A-01").status, "running")
  const restore = await json("/api/v1/actions/A-01", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "needs_approval" }),
  })
  assert.equal(restore.response.status, 200)
})
