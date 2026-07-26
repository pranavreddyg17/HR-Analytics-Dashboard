// Central mock data layer for the HR attrition dashboard.
// Frontend-only: values are hardcoded but realistic.

export type RiskLevel = "high" | "medium" | "low"

export type Kpi = {
  label: string
  value: string
  delta: number // percentage change vs prior period
  deltaLabel: string
  positiveIsGood: boolean
}

export const kpis: Kpi[] = [
  {
    label: "Headcount",
    value: "4,812",
    delta: 2.1,
    deltaLabel: "vs last quarter",
    positiveIsGood: true,
  },
  {
    label: "Annualized Attrition",
    value: "14.3%",
    delta: -1.8,
    deltaLabel: "vs last quarter",
    positiveIsGood: false,
  },
  {
    label: "Predicted At-Risk",
    value: "386",
    delta: 4.6,
    deltaLabel: "flagged by model",
    positiveIsGood: false,
  },
  {
    label: "Est. Replacement Cost",
    value: "$21.4M",
    delta: -6.2,
    deltaLabel: "projected annual",
    positiveIsGood: false,
  },
  {
    label: "Retention Save Rate",
    value: "62%",
    delta: 8.4,
    deltaLabel: "interventions succeeded",
    positiveIsGood: true,
  },
  {
    label: "eNPS",
    value: "+34",
    delta: 5.0,
    deltaLabel: "vs last survey",
    positiveIsGood: true,
  },
]

// 12 months of actual attrition + model-predicted forecast
export type TrendPoint = {
  month: string
  actual: number | null
  predicted: number
  benchmark: number
}

export const attritionTrend: TrendPoint[] = [
  { month: "Jan", actual: 13.1, predicted: 13.4, benchmark: 15.2 },
  { month: "Feb", actual: 13.6, predicted: 13.7, benchmark: 15.2 },
  { month: "Mar", actual: 14.2, predicted: 14.0, benchmark: 15.1 },
  { month: "Apr", actual: 14.8, predicted: 14.6, benchmark: 15.1 },
  { month: "May", actual: 15.1, predicted: 15.0, benchmark: 15.0 },
  { month: "Jun", actual: 14.9, predicted: 15.1, benchmark: 15.0 },
  { month: "Jul", actual: 14.5, predicted: 14.7, benchmark: 14.9 },
  { month: "Aug", actual: 14.3, predicted: 14.4, benchmark: 14.9 },
  { month: "Sep", actual: 14.3, predicted: 14.2, benchmark: 14.8 },
  { month: "Oct", actual: null, predicted: 13.9, benchmark: 14.8 },
  { month: "Nov", actual: null, predicted: 13.5, benchmark: 14.7 },
  { month: "Dec", actual: null, predicted: 13.1, benchmark: 14.7 },
]

export type DeptRisk = {
  department: string
  headcount: number
  attrition: number
  atRisk: number
  riskScore: number // 0-100
}

export const departmentRisk: DeptRisk[] = [
  { department: "Engineering", headcount: 1240, attrition: 16.2, atRisk: 118, riskScore: 74 },
  { department: "Sales", headcount: 890, attrition: 21.4, atRisk: 96, riskScore: 82 },
  { department: "Customer Success", headcount: 640, attrition: 18.1, atRisk: 71, riskScore: 68 },
  { department: "Product", headcount: 320, attrition: 11.3, atRisk: 22, riskScore: 41 },
  { department: "Marketing", headcount: 410, attrition: 13.7, atRisk: 34, riskScore: 52 },
  { department: "Operations", headcount: 720, attrition: 9.8, atRisk: 28, riskScore: 33 },
  { department: "Finance", headcount: 290, attrition: 8.4, atRisk: 12, riskScore: 27 },
  { department: "People/HR", headcount: 180, attrition: 10.1, atRisk: 9, riskScore: 31 },
]

// Reasons employees leave (from exit interviews + model attribution)
export type LeaveReason = {
  reason: string
  share: number // percent
  trend: "up" | "down" | "flat"
}

export const leaveReasons: LeaveReason[] = [
  { reason: "Compensation & benefits", share: 28, trend: "up" },
  { reason: "Career growth stalled", share: 24, trend: "up" },
  { reason: "Manager relationship", share: 17, trend: "down" },
  { reason: "Work-life balance", share: 13, trend: "flat" },
  { reason: "Lack of recognition", share: 9, trend: "down" },
  { reason: "Relocation / personal", share: 6, trend: "flat" },
  { reason: "Company direction", share: 3, trend: "down" },
]

// ML model feature importance (SHAP-style)
export type Feature = {
  feature: string
  importance: number // 0-1
}

export const featureImportance: Feature[] = [
  { feature: "Months since last promotion", importance: 0.92 },
  { feature: "Compa-ratio vs market", importance: 0.86 },
  { feature: "Manager span of control", importance: 0.71 },
  { feature: "Engagement survey score", importance: 0.68 },
  { feature: "Overtime hours (90d)", importance: 0.61 },
  { feature: "Internal mobility applications", importance: 0.54 },
  { feature: "Tenure", importance: 0.47 },
  { feature: "Commute distance", importance: 0.33 },
]

export type ModelMetric = {
  label: string
  value: string
  hint: string
}

export const modelMetrics: ModelMetric[] = [
  { label: "Model", value: "GradientBoost v4.2", hint: "Last trained 3 days ago" },
  { label: "AUC-ROC", value: "0.89", hint: "Holdout validation" },
  { label: "Precision", value: "0.81", hint: "At 0.5 threshold" },
  { label: "Recall", value: "0.76", hint: "At 0.5 threshold" },
  { label: "Predictions / day", value: "4,812", hint: "Full workforce scored" },
  { label: "Data freshness", value: "6h", hint: "Since last sync" },
]

// Risk distribution buckets for histogram
export type RiskBucket = {
  band: string
  count: number
  level: RiskLevel
}

export const riskDistribution: RiskBucket[] = [
  { band: "0-20%", count: 2680, level: "low" },
  { band: "20-40%", count: 1120, level: "low" },
  { band: "40-60%", count: 626, level: "medium" },
  { band: "60-80%", count: 268, level: "high" },
  { band: "80-100%", count: 118, level: "high" },
]

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
  manager: string
  location: string
}

export const employees: Employee[] = [
  {
    id: "E-2041",
    name: "Marcus Chen",
    role: "Staff Software Engineer",
    department: "Engineering",
    tenure: "4y 2m",
    riskScore: 91,
    riskLevel: "high",
    topDriver: "No promotion in 28 months",
    suggestion: "Fast-track promotion review + equity refresh",
    manager: "Dana Whitfield",
    location: "Austin, TX",
  },
  {
    id: "E-1188",
    name: "Priya Nadella",
    role: "Enterprise Account Executive",
    department: "Sales",
    tenure: "2y 7m",
    riskScore: 88,
    riskLevel: "high",
    topDriver: "Below-market compa-ratio (0.84)",
    suggestion: "Off-cycle comp adjustment to 50th percentile",
    manager: "Rob Feld",
    location: "Chicago, IL",
  },
  {
    id: "E-3320",
    name: "Tomás Herrera",
    role: "Senior CSM",
    department: "Customer Success",
    tenure: "3y 1m",
    riskScore: 83,
    riskLevel: "high",
    topDriver: "Overtime spike (52h/wk avg)",
    suggestion: "Rebalance book of business + PTO nudge",
    manager: "Lena Ortiz",
    location: "Remote",
  },
  {
    id: "E-0774",
    name: "Aisha Bello",
    role: "Product Designer",
    department: "Product",
    tenure: "1y 9m",
    riskScore: 64,
    riskLevel: "medium",
    topDriver: "Low engagement survey score",
    suggestion: "Manager 1:1 + growth plan conversation",
    manager: "Kevin Park",
    location: "New York, NY",
  },
  {
    id: "E-4512",
    name: "Jonathan Reyes",
    role: "Marketing Manager",
    department: "Marketing",
    tenure: "5y 4m",
    riskScore: 58,
    riskLevel: "medium",
    topDriver: "Stalled internal mobility",
    suggestion: "Surface 2 open lateral roles",
    manager: "Sara Kline",
    location: "Denver, CO",
  },
  {
    id: "E-2907",
    name: "Wei Zhang",
    role: "Data Engineer",
    department: "Engineering",
    tenure: "2y 0m",
    riskScore: 72,
    riskLevel: "high",
    topDriver: "Manager span too wide (17 reports)",
    suggestion: "Reassign to smaller team pod",
    manager: "Dana Whitfield",
    location: "Seattle, WA",
  },
  {
    id: "E-5510",
    name: "Hannah Okafor",
    role: "Financial Analyst",
    department: "Finance",
    tenure: "3y 8m",
    riskScore: 39,
    riskLevel: "low",
    topDriver: "Commute distance increase",
    suggestion: "Offer hybrid schedule",
    manager: "Paul Grant",
    location: "Boston, MA",
  },
  {
    id: "E-1642",
    name: "Diego Martins",
    role: "SDR Team Lead",
    department: "Sales",
    tenure: "1y 3m",
    riskScore: 79,
    riskLevel: "high",
    topDriver: "No recognition in 6 months",
    suggestion: "Spot bonus + public recognition",
    manager: "Rob Feld",
    location: "Miami, FL",
  },
]

// Agentic AI action queue
export type AgentActionStatus = "pending" | "running" | "completed" | "needs_approval"
export type AgentAction = {
  id: string
  title: string
  detail: string
  agent: string
  impact: string
  status: AgentActionStatus
  confidence: number
}

export const agentActions: AgentAction[] = [
  {
    id: "A-01",
    title: "Draft retention offers for 6 flight-risk engineers",
    detail: "Generate personalized comp + growth proposals using latest market data.",
    agent: "Retention Agent",
    impact: "Protects $1.9M in replacement cost",
    status: "needs_approval",
    confidence: 92,
  },
  {
    id: "A-02",
    title: "Schedule stay interviews for top 20 at-risk employees",
    detail: "Auto-book 30-min sessions with managers and send prep briefs.",
    agent: "Scheduling Agent",
    impact: "Covers 34% of high-risk pool",
    status: "running",
    confidence: 88,
  },
  {
    id: "A-03",
    title: "Route 12 employees to internal mobility openings",
    detail: "Match skills to 8 open roles and notify hiring managers.",
    agent: "Mobility Agent",
    impact: "Estimated 9 retained",
    status: "pending",
    confidence: 81,
  },
  {
    id: "A-04",
    title: "Compile Q3 attrition brief for the board",
    detail: "Summarize trends, drivers, and interventions into a 1-pager.",
    agent: "Reporting Agent",
    impact: "Saves ~4 analyst hours",
    status: "completed",
    confidence: 96,
  },
  {
    id: "A-05",
    title: "Flag managers with >15% team attrition",
    detail: "Notify HRBPs and attach coaching resources.",
    agent: "Insights Agent",
    impact: "7 managers flagged",
    status: "needs_approval",
    confidence: 90,
  },
]

export type ChatMessage = {
  role: "user" | "assistant"
  content: string
}

export const seedConversation: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Good morning. Attrition is trending down to a projected 13.1% by year end. The biggest lever right now is compensation in Sales — want me to model an off-cycle adjustment?",
  },
]

export const suggestedPrompts: string[] = [
  "Which department has the highest predicted attrition?",
  "Draft a retention plan for Engineering",
  "What's driving Sales attrition this quarter?",
  "Summarize this month's flight risks",
]

// Learning & skills development
export type SkillGap = {
  skill: string
  current: number
  target: number
}

export const skillGaps: SkillGap[] = [
  { skill: "AI / ML fluency", current: 42, target: 80 },
  { skill: "Data literacy", current: 58, target: 85 },
  { skill: "People leadership", current: 61, target: 78 },
  { skill: "Cloud architecture", current: 49, target: 75 },
  { skill: "Customer discovery", current: 66, target: 80 },
]

export type LearningTrack = {
  id: string
  title: string
  category: string
  enrolled: number
  completion: number
  retentionLift: number
  linkedRisk: string
}

export const learningTracks: LearningTrack[] = [
  {
    id: "L-01",
    title: "Engineering Leadership Academy",
    category: "Leadership",
    enrolled: 84,
    completion: 71,
    retentionLift: 18,
    linkedRisk: "Career growth stalled",
  },
  {
    id: "L-02",
    title: "Applied GenAI for Product Teams",
    category: "Technical",
    enrolled: 156,
    completion: 54,
    retentionLift: 12,
    linkedRisk: "Skill obsolescence",
  },
  {
    id: "L-03",
    title: "Consultative Enterprise Selling",
    category: "Sales",
    enrolled: 62,
    completion: 63,
    retentionLift: 21,
    linkedRisk: "Compensation & growth",
  },
  {
    id: "L-04",
    title: "Manager Essentials: Coaching",
    category: "Leadership",
    enrolled: 118,
    completion: 82,
    retentionLift: 24,
    linkedRisk: "Manager relationship",
  },
  {
    id: "L-05",
    title: "Data Storytelling & Analytics",
    category: "Technical",
    enrolled: 203,
    completion: 47,
    retentionLift: 9,
    linkedRisk: "Data literacy gap",
  },
]

export type SkillRecommendation = {
  name: string
  role: string
  recommendation: string
  reason: string
}

export const skillRecommendations: SkillRecommendation[] = [
  {
    name: "Marcus Chen",
    role: "Staff Engineer",
    recommendation: "Engineering Leadership Academy",
    reason: "Ready for tech lead track; growth is top attrition driver",
  },
  {
    name: "Aisha Bello",
    role: "Product Designer",
    recommendation: "Applied GenAI for Product Teams",
    reason: "Closes AI fluency gap and re-engages",
  },
  {
    name: "Diego Martins",
    role: "SDR Team Lead",
    recommendation: "Manager Essentials: Coaching",
    reason: "New to management; highest retention lift track",
  },
]

export const navItems = [
  { href: "/", label: "Overview", icon: "LayoutDashboard" },
  { href: "/attrition", label: "Attrition & ML", icon: "TrendingDown" },
  { href: "/employees", label: "At-Risk People", icon: "Users" },
  { href: "/ai-agents", label: "AI Agents", icon: "Bot" },
  { href: "/learning", label: "Learning & Skills", icon: "GraduationCap" },
] as const
