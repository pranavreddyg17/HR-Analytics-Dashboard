import runtimeJson from "./runtime-data.json"

import type {
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

type SharedPredictionModel = {
  numericColumns: Array<keyof PredictionInput>
  categoricalColumns: Array<keyof PredictionInput>
  numericMedians: number[]
  categoricalValues: string[][]
  referenceProfile: PredictionInput
}

type LogisticPredictionModel = SharedPredictionModel & {
  type: "logistic"
  coefficients: number[]
  intercept: number
  numericMeans: number[]
  numericScales: number[]
}

type GradientTree = {
  childrenLeft: number[]
  childrenRight: number[]
  features: number[]
  thresholds: number[]
  values: number[]
}

type GradientBoostingPredictionModel = SharedPredictionModel & {
  type: "gradient_boosting"
  learningRate: number
  initialRawScore: number
  trees: GradientTree[]
}

type PredictionModel = LogisticPredictionModel | GradientBoostingPredictionModel

type RuntimeData = {
  sourceSha256: string
  metadata: ModelMetadata
  schema: PredictionSchema
  dashboard: DashboardData
  employees: Employee[]
  dataDictionary: DataDictionary
  predictionModel: PredictionModel
}

const runtime = runtimeJson as unknown as RuntimeData

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
      ragKnowledge: "ready",
      employeeCommunicationWorkflows: "ready",
      workforceWarehouse: "ready",
      mcpTools: "ready",
      langchainAgent: "ready",
      reportExports: "ready",
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
    const observed = runtime.schema.numericRanges[column]
    const minimum = Math.floor(observed.min)
    const maximum = Math.ceil(observed.max)
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

function vectorFor(record: PredictionInput, model: PredictionModel): number[] {
  const vector = model.numericColumns.map((column, index) => {
    const value = Number(record[column])
    return Number.isFinite(value) ? value : model.numericMedians[index]
  })
  model.categoricalColumns.forEach((column, columnIndex) => {
    for (const option of model.categoricalValues[columnIndex]) vector.push(record[column] === option ? 1 : 0)
  })
  return vector
}

function evaluateTree(tree: GradientTree, vector: number[]): number {
  let node = 0
  while (tree.childrenLeft[node] !== -1) {
    node = vector[tree.features[node]] <= tree.thresholds[node]
      ? tree.childrenLeft[node]
      : tree.childrenRight[node]
  }
  return tree.values[node]
}

function probabilityFor(record: PredictionInput): number {
  const model = runtime.predictionModel
  const vector = vectorFor(record, model)
  let rawScore: number
  if (model.type === "gradient_boosting") {
    rawScore = model.initialRawScore
    for (const tree of model.trees) rawScore += model.learningRate * evaluateTree(tree, vector)
  } else {
    rawScore = model.intercept
    let coefficientIndex = 0
    model.numericColumns.forEach((_, index) => {
      const transformed = (vector[index] - model.numericMeans[index]) / model.numericScales[index]
      rawScore += transformed * model.coefficients[coefficientIndex]
      coefficientIndex += 1
    })
    for (let index = model.numericColumns.length; index < vector.length; index += 1) {
      rawScore += vector[index] * model.coefficients[coefficientIndex]
      coefficientIndex += 1
    }
  }
  return 1 / (1 + Math.exp(-rawScore))
}

export function predict(value: unknown): PredictionResult {
  const record = validatePrediction(value)
  const model = runtime.predictionModel
  const probability = probabilityFor(record)
  const referenceProbability = probabilityFor(model.referenceProfile)
  const effects = [...model.numericColumns, ...model.categoricalColumns].map((feature) => {
    const comparison = { ...record, [feature]: model.referenceProfile[feature] }
    return [feature, (probability - probabilityFor(comparison)) * 100] as const
  })

  const ranked = effects.sort((left, right) => right[1] - left[1])
  const positive = ranked.filter(([, contribution]) => contribution > 0)
  const selected = (positive.length ? positive : ranked).slice(0, 3)
  const topDrivers: PredictionDriver[] = selected.map(([feature, contribution]) => ({
    feature,
    label: labels[feature],
    value: record[feature],
    contribution: Number(contribution.toFixed(4)),
    referenceValue: model.referenceProfile[feature],
    explanation: explanation(feature, record),
  }))

  return {
    probability: Number(probability.toFixed(6)),
    riskScore: Number((probability * 100).toFixed(1)),
    riskLevel: riskLevel(probability),
    decisionThreshold: Number(runtime.schema.threshold.toFixed(4)),
    aboveInterventionThreshold: probability >= runtime.schema.threshold,
    referenceProbability: Number(referenceProbability.toFixed(6)),
    topDrivers,
    recommendation: recommendation(topDrivers[0].feature as keyof PredictionInput),
    disclaimer: "This is a statistical estimate for human review. Do not use it as the sole basis for an employment decision.",
  }
}
