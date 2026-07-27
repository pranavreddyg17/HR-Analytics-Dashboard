import runtimeJson from "./runtime-data.json"

import type {
  AgentAction,
  DashboardData,
  DataDictionary,
  Employee,
  EmployeesResponse,
  ModelMetadata,
  PredictionDriver,
  PredictionInput,
  PredictionResult,
  PredictionSchema,
  RiskLevel,
} from "@/lib/types"

type PredictionModel = {
  numericColumns: Array<keyof PredictionInput>
  categoricalColumns: Array<keyof PredictionInput>
  featureNames: string[]
  coefficients: number[]
  intercept: number
  numericMedians: number[]
  numericMeans: number[]
  numericScales: number[]
  categoricalModes: string[]
  categoricalValues: string[][]
}

type RuntimeData = {
  brand: string
  sourceSha256: string
  metadata: ModelMetadata
  schema: PredictionSchema
  dashboard: DashboardData
  employees: Employee[]
  actions: AgentAction[]
  dataDictionary: DataDictionary
  predictionModel: PredictionModel
}

const runtime = runtimeJson as unknown as RuntimeData

const numericBounds: Record<string, [number, number]> = {
  DistanceFromHome: [0, 100],
  Education: [1, 5],
  EnvironmentSatisfaction: [1, 4],
  JobSatisfaction: [1, 4],
  MonthlyIncome: [0, 1_000_000],
  NumCompaniesWorked: [0, 100],
  WorkLifeBalance: [1, 4],
  YearsAtCompany: [0, 100],
}

export class RequestValidationError extends Error {}

export function getDashboard(): DashboardData {
  return runtime.dashboard
}

export function getModelMetadata(): ModelMetadata {
  return runtime.metadata
}

export function getPredictionSchema(): PredictionSchema {
  return runtime.schema
}

export function getDataDictionary(): DataDictionary {
  return runtime.dataDictionary
}

export function getActionTemplates(): AgentAction[] {
  return runtime.actions
}

export function getHealth() {
  return {
    status: "ok",
    service: "LaidbackHR.AI",
    model: runtime.metadata.model_name,
    modelVersion: runtime.metadata.model_version,
    rows: runtime.employees.length,
    sourceSha256: runtime.sourceSha256,
    capabilities: {
      prediction: "ready",
      groundedAnalytics: "ready",
      reviewActions: "ready",
    },
  }
}

export function getEmployees({
  risk = "all",
  search = "",
  limit = 2000,
  offset = 0,
}: {
  risk?: RiskLevel | "all"
  search?: string
  limit?: number
  offset?: number
} = {}): EmployeesResponse {
  const needle = search.trim().toLowerCase()
  const items = runtime.employees.filter((employee) => {
    if (risk !== "all" && employee.riskLevel !== risk) return false
    if (!needle) return true
    return `${employee.id} ${employee.name} ${employee.department} ${employee.role}`
      .toLowerCase()
      .includes(needle)
  })
  return { total: items.length, items: items.slice(offset, offset + limit) }
}

function validatePrediction(value: unknown): PredictionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("Request body must be a JSON object.")
  }
  const record = value as Record<string, unknown>
  const allowed = new Set([...runtime.predictionModel.numericColumns, ...runtime.predictionModel.categoricalColumns])
  const extras = Object.keys(record).filter((key) => !allowed.has(key as keyof PredictionInput))
  if (extras.length) throw new RequestValidationError(`Unexpected fields: ${extras.join(", ")}`)

  for (const column of runtime.predictionModel.numericColumns) {
    const number = record[column]
    const [minimum, maximum] = numericBounds[column]
    if (!Number.isInteger(number) || (number as number) < minimum || (number as number) > maximum) {
      throw new RequestValidationError(`${column} must be an integer between ${minimum} and ${maximum}.`)
    }
  }
  for (const column of runtime.predictionModel.categoricalColumns) {
    const value = record[column]
    const options = runtime.schema.categoricalOptions[column] ?? []
    if (typeof value !== "string" || !options.includes(value)) {
      throw new RequestValidationError(`${column} must be one of: ${options.join(", ")}.`)
    }
  }
  return record as unknown as PredictionInput
}

function riskLevel(probability: number): RiskLevel {
  if (probability >= runtime.schema.threshold) return "high"
  if (probability >= runtime.schema.threshold * 0.55) return "medium"
  return "low"
}

function formatTenure(years: number): string {
  return years === 1 ? "1 year" : `${years} years`
}

function explanation(feature: keyof PredictionInput, record: PredictionInput): string {
  const value = record[feature]
  const messages: Partial<Record<keyof PredictionInput, string>> = {
    Department: `Department is ${value}.`,
    DistanceFromHome: `Commute distance is ${value} miles.`,
    Education: `Education level is coded as ${value} on the source dataset's 1-5 scale.`,
    EducationField: `Education field is ${value}.`,
    EnvironmentSatisfaction: `Environment satisfaction is ${value}/4.`,
    JobSatisfaction: `Job satisfaction is ${value}/4.`,
    MonthlyIncome: `Monthly income is $${Number(value).toLocaleString("en-US")}.`,
    NumCompaniesWorked: `The employee has worked at ${value} prior companies.`,
    WorkLifeBalance: `Work-life balance is ${value}/4.`,
    YearsAtCompany: `Tenure is ${formatTenure(Number(value))}.`,
  }
  return messages[feature] ?? `${feature} is ${value}.`
}

const labels: Record<keyof PredictionInput, string> = {
  Department: "Department",
  DistanceFromHome: "Commute distance",
  Education: "Education level",
  EducationField: "Education field",
  EnvironmentSatisfaction: "Environment satisfaction",
  JobSatisfaction: "Job satisfaction",
  MonthlyIncome: "Monthly income",
  NumCompaniesWorked: "Prior companies worked",
  WorkLifeBalance: "Work-life balance",
  YearsAtCompany: "Years at company",
}

function recommendation(feature: keyof PredictionInput): string {
  const suggestions: Record<keyof PredictionInput, string> = {
    JobSatisfaction: "Schedule a stay interview and review role fit, recognition, and growth opportunities.",
    EnvironmentSatisfaction: "Review team environment, manager support, workload, and workplace concerns with the employee.",
    WorkLifeBalance: "Review workload, schedule flexibility, PTO usage, and sustainable staffing options.",
    MonthlyIncome: "Run a role- and location-adjusted compensation review before taking action.",
    DistanceFromHome: "Discuss hybrid or flexible-work options where the role allows them.",
    YearsAtCompany: "Create a documented career-growth and internal-mobility conversation.",
    NumCompaniesWorked: "Use a stay interview to understand career expectations and likely next-step goals.",
    Department: "Review department-level workload, manager practices, compensation, and mobility patterns.",
    EducationField: "Review role alignment and internal opportunities that better match the employee's skills.",
    Education: "Review development pathways and whether role scope matches the employee's capabilities.",
  }
  return suggestions[feature]
}

export function predict(value: unknown): PredictionResult {
  const record = validatePrediction(value)
  const model = runtime.predictionModel
  const contributions = new Map<keyof PredictionInput, number>()
  let logit = model.intercept
  let coefficientIndex = 0

  model.numericColumns.forEach((column, index) => {
    const transformed = (Number(record[column]) - model.numericMeans[index]) / model.numericScales[index]
    const contribution = transformed * model.coefficients[coefficientIndex]
    contributions.set(column, contribution)
    logit += contribution
    coefficientIndex += 1
  })
  model.categoricalColumns.forEach((column, columnIndex) => {
    let grouped = 0
    for (const option of model.categoricalValues[columnIndex]) {
      const contribution = record[column] === option ? model.coefficients[coefficientIndex] : 0
      grouped += contribution
      logit += contribution
      coefficientIndex += 1
    }
    contributions.set(column, grouped)
  })

  const probability = 1 / (1 + Math.exp(-logit))
  const ranked = [...contributions.entries()].sort((left, right) => right[1] - left[1])
  const positive = ranked.filter(([, contribution]) => contribution > 0)
  const selected = (positive.length ? positive : ranked).slice(0, 3)
  const topDrivers: PredictionDriver[] = selected.map(([feature, contribution]) => ({
    feature,
    label: labels[feature],
    value: record[feature],
    contribution: Number(contribution.toFixed(4)),
    explanation: explanation(feature, record),
  }))

  return {
    probability: Number(probability.toFixed(6)),
    riskScore: Number((probability * 100).toFixed(1)),
    riskLevel: riskLevel(probability),
    decisionThreshold: Number(runtime.schema.threshold.toFixed(4)),
    aboveInterventionThreshold: probability >= runtime.schema.threshold,
    topDrivers,
    recommendation: recommendation(topDrivers[0].feature as keyof PredictionInput),
    disclaimer: "This is a statistical estimate for human review. Do not use it as the sole basis for an employment decision.",
  }
}

export function answerAnalytics(message: unknown): { answer: string; provider: string } {
  if (typeof message !== "string" || !message.trim() || message.length > 2000) {
    throw new RequestValidationError("message must contain between 1 and 2,000 characters.")
  }
  const text = message.toLowerCase()
  const dashboard = runtime.dashboard
  const hotspot = dashboard.departmentRisk[0]
  const metrics = Object.fromEntries(dashboard.modelMetrics.map((item) => [item.label, item.value]))
  const drivers = dashboard.leaveReasons
    .slice(0, 4)
    .map((item) => `${item.reason} (${item.share.toFixed(1)}%)`)
    .join(", ")
  let answer: string

  if (text.includes("department") || text.includes("highest") || text.includes("sales")) {
    answer = `${hotspot.department} has the highest average predicted risk at ${hotspot.riskScore.toFixed(1)}%. It contains ${hotspot.headcount} historical records, ${hotspot.atRisk} above the review threshold, and an observed attrition rate of ${hotspot.attrition.toFixed(1)}%.`
  } else if (["model", "accuracy", "auc", "performance"].some((term) => text.includes(term))) {
    answer = `The deployed model is ${metrics.Model}. Its 5-fold out-of-fold ROC-AUC is ${metrics["ROC-AUC"]}, precision is ${metrics.Precision}, and recall is ${metrics.Recall}. Age and marital status are excluded from training. The model is a review aid, not an automated employment decision system.`
  } else if (["driver", "why", "reason"].some((term) => text.includes(term))) {
    answer = `The strongest global model signals are ${drivers}. These are associations learned from the historical dataset, not proven causes of attrition.`
  } else if (["risk", "summary", "brief"].some((term) => text.includes(term))) {
    answer = dashboard.dailyBrief + " Model outputs require human review."
  } else {
    answer = dashboard.dailyBrief + " Ask about the highest-risk department, model performance, global risk drivers, or the review threshold."
  }
  return { answer, provider: "grounded-analytics-engine" }
}
