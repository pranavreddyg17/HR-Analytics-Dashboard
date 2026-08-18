export type RiskLevel = "high" | "medium" | "low"

type Kpi = {
  label: string
  value: string
  delta: number
  deltaLabel: string
  positiveIsGood: boolean
}

type TrendPoint = {
  month: string
  actual: number | null
  predicted: number
  benchmark: number
  count?: number
}

type DeptRisk = {
  department: string
  headcount: number
  attrition: number
  atRisk: number
  riskScore: number
}

type LeaveReason = {
  reason: string
  share: number
  trend: "up" | "down" | "flat"
}

type Feature = {
  feature: string
  importance: number
}

type ModelMetric = {
  label: string
  value: string
  hint: string
}

type RiskBucket = {
  band: string
  count: number
  level: RiskLevel
}

export type Employee = {
  id: string
  name: string
  role: string
  department: string
  tenure: string
  riskScore: number
  riskLevel: RiskLevel
  topDriver: string
  modelDrivers: PredictionDriver[]
  suggestion: string
  monthlyIncome: number
  distanceFromHome: number
  educationLevel: number
  educationField: string
  environmentSatisfaction: number
  jobSatisfaction: number
  priorCompanies: number
  workLifeBalance: number
  yearsAtCompany: number
  observedAttrition: string
}

export type DashboardData = {
  dailyBrief: string
  kpis: Kpi[]
  attritionTrend: TrendPoint[]
  departmentRisk: DeptRisk[]
  leaveReasons: LeaveReason[]
  featureImportance: Feature[]
  riskDistribution: RiskBucket[]
  modelMetrics: ModelMetric[]
  topEmployees: Employee[]
  highRiskCount: number
  highRiskPayroll: number
  threshold: number
  datasetNotes: string[]
}

export type EmployeesResponse = {
  total: number
  items: Employee[]
}

type NumericRange = {
  min: number
  max: number
  median: number
}

export type PredictionSchema = {
  numericRanges: Record<string, NumericRange>
  categoricalOptions: Record<string, string[]>
  excludedFromModel: string[]
  threshold: number
  modelName: string
  modelVersion: string
  evaluation: string
  explanationMethod: string
  thresholdPolicy: string
  metrics: Record<string, number | number[][]>
  confidenceIntervals95: Record<string, number[]>
}

export type PredictionInput = {
  Department: string
  DistanceFromHome: number
  Education: number
  EducationField: string
  EnvironmentSatisfaction: number
  JobSatisfaction: number
  MonthlyIncome: number
  NumCompaniesWorked: number
  WorkLifeBalance: number
  YearsAtCompany: number
}

export type PredictionDriver = {
  feature: string
  label: string
  value: string | number
  contribution: number
  referenceValue: string | number
  explanation: string
}

export type PredictionResult = {
  probability: number
  riskScore: number
  riskLevel: RiskLevel
  decisionThreshold: number
  aboveInterventionThreshold: boolean
  referenceProbability: number
  topDrivers: PredictionDriver[]
  recommendation: string
  disclaimer: string
}

export type ModelMetadata = {
  model_name: string
  model_version: string
  trained_at: string
  evaluation: string
  model_family: string
  threshold: number
  threshold_policy: string
  explanation_method: string
  metrics: Record<string, number | number[][]>
  dataset: {
    rows: number
    features: number
    excluded_from_model: string[]
    positive_rows: number
    negative_rows: number
    observed_attrition_rate: number
    source_file: string
  }
  notes: string[]
}

export type DataDictionary = {
  source: string
  rows: number
  columns: Array<{
    name: string
    definition: string
    usedByModel: boolean
    type: string
  }>
  categoricalOptions: Record<string, string[]>
  numericRanges: Record<string, NumericRange>
  notes: string[]
}
