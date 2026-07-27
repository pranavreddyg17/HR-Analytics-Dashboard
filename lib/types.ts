export type RiskLevel = "high" | "medium" | "low"

export type Kpi = {
  label: string
  value: string
  delta: number
  deltaLabel: string
  positiveIsGood: boolean
}

export type TrendPoint = {
  month: string
  actual: number | null
  predicted: number
  benchmark: number
  count?: number
}

export type DeptRisk = {
  department: string
  headcount: number
  attrition: number
  atRisk: number
  riskScore: number
}

export type LeaveReason = {
  reason: string
  share: number
  trend: "up" | "down" | "flat"
}

export type Feature = {
  feature: string
  importance: number
}

export type ModelMetric = {
  label: string
  value: string
  hint: string
}

export type RiskBucket = {
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
  suggestion: string
  monthlyIncome: number
  jobSatisfaction: number
  workLifeBalance: number
  observedAttrition: string
}

export type AgentActionStatus = "pending" | "running" | "completed" | "needs_approval" | "dismissed"

export type AgentAction = {
  id: string
  title: string
  detail: string
  agent: string
  impact: string
  status: AgentActionStatus
  confidence: number
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

export type ActionsResponse = {
  items: AgentAction[]
  stats: {
    actions: number
    awaitingApproval: number
    completed: number
  }
}

export type NumericRange = {
  min: number
  max: number
  median: number
}

export type PredictionSchema = {
  numericRanges: Record<string, NumericRange>
  categoricalOptions: Record<string, string[]>
  excludedFromModel: string[]
  threshold: number
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
  explanation: string
}

export type PredictionResult = {
  probability: number
  riskScore: number
  riskLevel: RiskLevel
  decisionThreshold: number
  aboveInterventionThreshold: boolean
  topDrivers: PredictionDriver[]
  recommendation: string
  disclaimer: string
}

export type ModelMetadata = {
  model_name: string
  model_version: string
  trained_at: string
  evaluation: string
  threshold: number
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
