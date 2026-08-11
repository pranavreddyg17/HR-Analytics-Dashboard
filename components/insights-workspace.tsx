"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, ChevronsUpDown, LoaderCircle, Search } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { MetricStrip, WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import { InsightActionButton } from "@/components/insight-action-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { BreakdownPoint, EmployeeImpactScenario, EmployeeImpactSearchResult, TimePoint, WorkforceAnalytics } from "@/lib/hr-types"
import { cn } from "@/lib/utils"
import { categoricalChartColors, chartSeries } from "@/lib/chart-theme"

type Filters = {
  from: string
  to: string
  department: string
  location: string
  period: "month" | "quarter" | "year"
  recruitingCostPerHire?: number
  vacancyProductivityPercent?: number
  onboardingDays?: number
  onboardingProductivityPercent?: number
  courseFeePerLearner?: number
  courseHoursPerLearner?: number
}

type CostInputs = Required<Pick<Filters, "recruitingCostPerHire" | "vacancyProductivityPercent" | "onboardingDays" | "onboardingProductivityPercent" | "courseFeePerLearner" | "courseHoursPerLearner">>

type AnalysisView = "overview" | "impact" | "talent" | "capability"

const viewGuidance: Record<AnalysisView, { title: string; description: string }> = {
  overview: { title: "Operating overview", description: "Start with department exceptions, then create or open the work item that owns the follow-up." },
  impact: { title: "Workforce impact", description: "Test replacement-cost assumptions and inspect role coverage for a selected active employee." },
  talent: { title: "Talent supply", description: "Compare hiring supply with recorded exits, refill speed, tenure cohorts, and manager-level concentration." },
  capability: { title: "Capability", description: "Review current learning completion, required work, remaining effort, and assignment cost." },
}

const actionLinkClass = "inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2.5 text-control hover:bg-muted"

function rollingYear(): Pick<Filters, "from" | "to"> {
  const end = new Date()
  const start = new Date(end)
  start.setUTCFullYear(start.getUTCFullYear() - 1)
  start.setUTCDate(start.getUTCDate() + 1)
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

function initialFilters(searchParams: URLSearchParams): Filters {
  const fallback = rollingYear()
  const period = searchParams.get("period")
  const numberOr = (name: string): number | undefined => {
    const raw = searchParams.get(name)
    if (raw === null || raw.trim() === "") return undefined
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }
  return {
    from: searchParams.get("from") ?? fallback.from,
    to: searchParams.get("to") ?? fallback.to,
    department: searchParams.get("department") ?? "",
    location: searchParams.get("location") ?? "",
    period: period === "month" || period === "year" ? period : "quarter",
    recruitingCostPerHire: numberOr("recruitingCostPerHire"),
    vacancyProductivityPercent: numberOr("vacancyProductivityPercent"),
    onboardingDays: numberOr("onboardingDays"),
    onboardingProductivityPercent: numberOr("onboardingProductivityPercent"),
    courseFeePerLearner: numberOr("courseFeePerLearner"),
    courseHoursPerLearner: numberOr("courseHoursPerLearner"),
  }
}

function queryFor(filters: Filters): string {
  const params = new URLSearchParams({ dataMode: "all" })
  Object.entries(filters).forEach(([key, value]) => { if (value !== "" && value !== undefined) params.set(key, String(value)) })
  return params.toString()
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: Math.abs(value) >= 1_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value)
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard", maximumFractionDigits: 0 }).format(value)
}

function percent(value: number | null): string {
  return value === null ? "Not applicable" : `${value}%`
}

function refillBasisLabel(value: "role" | "department" | "company" | "policy"): string {
  return value === "policy" ? "Configured fallback" : `${value[0].toUpperCase()}${value.slice(1)} hiring history`
}

function flowRows(hiring: TimePoint[], attrition: TimePoint[]): Array<{ period: string; hires: number; exits: number }> {
  const periods = [...new Set([...hiring, ...attrition].map((row) => row.period))].sort()
  const hiringMap = new Map(hiring.map((row) => [row.period, row.value]))
  const attritionMap = new Map(attrition.map((row) => [row.period, row.value]))
  return periods.map((period) => ({ period, hires: hiringMap.get(period) ?? 0, exits: attritionMap.get(period) ?? 0 }))
}

function exitReasonRows(rows: BreakdownPoint[]): BreakdownPoint[] {
  const leading = rows.slice(0, 5)
  const remaining = rows.slice(5).reduce((sum, row) => sum + row.value, 0)
  return remaining ? [...leading, { label: "Other", value: remaining }] : leading
}

function FlowTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-meta shadow-sm">
      <p className="font-semibold">{label}</p>
      {payload.map((item) => <p key={item.name} className="mt-1 text-muted-foreground"><span className="font-semibold" style={{ color: item.color }}>{item.value}</span> {item.name}</p>)}
    </div>
  )
}

function FlowChart({ rows }: { rows: ReturnType<typeof flowRows> }) {
  if (!rows.length) return <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-body text-muted-foreground">No hires or exits are recorded for this period.</div>
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 256 }}>
        <BarChart data={rows} margin={{ left: -20, right: 10, top: 8, bottom: 2 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <Tooltip content={<FlowTooltip />} />
          <Legend />
          <Bar dataKey="hires" name="Completed hires" fill={chartSeries.positive} radius={[3, 3, 0, 0]} />
          <Bar dataKey="exits" name="Recorded exits" fill={chartSeries.negative} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function ExitReasonChart({ rows }: { rows: BreakdownPoint[] }) {
  if (!rows.length) return <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-body text-muted-foreground">No exit reasons are recorded for this period.</div>
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  return (
    <div className="grid min-h-64 items-center gap-2 sm:grid-cols-[180px_1fr]">
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 180, height: 192 }}>
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="label" innerRadius={45} outerRadius={76} paddingAngle={1} stroke="var(--card)">
              {rows.map((row, index) => <Cell key={row.label} fill={categoricalChartColors[index % categoricalChartColors.length]} />)}
            </Pie>
            <Tooltip formatter={(value) => [`${value} exits`, "Recorded"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.label} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-meta">
            <span className="size-2.5 rounded-sm" style={{ background: categoricalChartColors[index % categoricalChartColors.length] }} />
            <span className="truncate text-muted-foreground">{row.label}</span>
            <span className="tabular-nums">{row.value} · {Math.round((row.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DepartmentPressure({ data, onSelect }: { data: WorkforceAnalytics; onSelect: (department: string) => void }) {
  const statusRank = { Gap: 0, Watch: 1, Covered: 2 }
  const rows = [...data.decisionSupport.departments].sort((left, right) => statusRank[left.coverageStatus] - statusRank[right.coverageStatus] || right.attritionRate - left.attritionRate)
  if (!rows.length) return <div className="flex h-48 items-center justify-center text-body text-muted-foreground">No department measures in this scope.</div>
  return <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-body"><thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr><th className="px-4 py-2.5">Department</th><th className="px-4 py-2.5">Workforce</th><th className="px-4 py-2.5">Attrition</th><th className="px-4 py-2.5">Hiring coverage</th><th className="px-4 py-2.5">Required learning</th><th className="px-4 py-2.5">Leave</th><th className="px-4 py-2.5"><span className="sr-only">Filter</span></th></tr></thead><tbody>{rows.map((row) => {
    const attritionDelta = Number((row.attritionRate - data.attrition.rate).toFixed(1))
    return <tr key={row.department} className="border-t border-border/70 hover:bg-muted/20"><td className="px-4 py-3"><p className="font-semibold">{row.department}</p><Badge className="mt-1" variant={row.coverageStatus === "Gap" ? "destructive" : row.coverageStatus === "Watch" ? "secondary" : "outline"}>{row.coverageStatus === "Gap" ? "Coverage gap" : row.coverageStatus === "Watch" ? "Monitor" : "Covered"}</Badge></td><td className="px-4 py-3"><p className="tabular-nums">{row.activeEmployees.toLocaleString()} active</p><p className="text-meta text-muted-foreground">{row.netMovement > 0 ? "+" : ""}{row.netMovement} net · {row.hires} hires / {row.exits} exits</p></td><td className="px-4 py-3"><p className="tabular-nums">{row.attritionRate}%</p><p className="text-meta text-muted-foreground">{attritionDelta > 0 ? "+" : ""}{attritionDelta} points vs company</p></td><td className="px-4 py-3"><p>{row.exits ? `${row.hires} of ${row.exits} exits replaced` : "No exits in scope"}</p><p className="text-meta text-muted-foreground">{row.openRequisitions} open role{row.openRequisitions === 1 ? "" : "s"}</p></td><td className="px-4 py-3"><p>{row.mandatoryTrainingGaps} open</p><p className="text-meta text-muted-foreground">{row.overdueMandatoryTrainingGaps} overdue · {row.trainingCompletionRate}% complete</p></td><td className="px-4 py-3"><p>{row.pendingLeaveRequests} pending</p><p className="text-meta text-muted-foreground">{row.leaveDaysPerActiveEmployee} approved days per active employee</p></td><td className="px-4 py-3 text-right"><Button size="xs" variant="outline" onClick={() => onSelect(row.department)}>Filter report</Button></td></tr>
  })}</tbody></table><p className="border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground">Net movement is completed hires minus recorded exits. Hiring coverage compares completed hires with exits in the selected period; open roles are shown separately.</p></div>
}

function TenureAttrition({ data }: { data: WorkforceAnalytics }) {
  const rows = data.decisionSupport.tenureAttrition
  return <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 900, height: 288 }}>
    <BarChart data={rows} margin={{ top: 12, right: 18, bottom: 4, left: -10 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
      <XAxis dataKey="cohort" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
      <YAxis unit="%" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
      <Tooltip formatter={(value, name, item) => name === "Attrition rate" ? [`${value}% (${item.payload.exits} exits / ${item.payload.population})`, name] : [value, name]} />
      <ReferenceLine y={data.attrition.rate} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Company", position: "right", fill: "var(--muted-foreground)", fontSize: 10 }} />
      <Bar dataKey="attritionRate" name="Attrition rate" fill={chartSeries.negative} radius={[3, 3, 0, 0]} />
    </BarChart>
  </ResponsiveContainer></div>
}

function SourceEfficiency({ data }: { data: WorkforceAnalytics }) {
  const rows = [...data.hiring.sourceStats].sort((left, right) => right.hires - left.hires || left.averageDays - right.averageDays).slice(0, 8)
  if (!rows.length) return <div className="flex h-64 items-center justify-center text-body text-muted-foreground">No completed hires with source data in this scope.</div>
  return <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 900, height: 288 }}>
    <ComposedChart data={rows} margin={{ top: 12, right: 8, bottom: 20, left: -10 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
      <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={56} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
      <YAxis yAxisId="hires" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
      <YAxis yAxisId="days" orientation="right" unit="d" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
      <Tooltip />
      <Legend />
      <Bar yAxisId="hires" dataKey="hires" name="Completed hires" fill={chartSeries.positive} radius={[3, 3, 0, 0]} />
      <Line yAxisId="days" type="monotone" dataKey="averageDays" name="Average days to hire" stroke={chartSeries.primary} strokeWidth={2} dot={{ r: 3 }} />
    </ComposedChart>
  </ResponsiveContainer></div>
}

function ManagerConcentration({ data }: { data: WorkforceAnalytics }) {
  const rows = data.operatingSignals.managerExitConcentration.slice(0, 8)
  if (!rows.length) return <div className="flex h-64 items-center justify-center text-body text-muted-foreground">No manager cohorts with recorded exits in this scope.</div>
  return <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-body"><thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr><th className="px-4 py-2.5">Manager</th><th className="px-4 py-2.5">Department</th><th className="px-4 py-2.5">Active team</th><th className="px-4 py-2.5">Exits</th><th className="px-4 py-2.5">Voluntary</th><th className="px-4 py-2.5">Share of department exits</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.managerId ?? row.manager}-${row.department}`} className="border-t border-border/70"><td className="px-4 py-3 font-semibold">{row.manager}</td><td className="px-4 py-3">{row.department}</td><td className="px-4 py-3 tabular-nums">{row.activeTeamSize}</td><td className="px-4 py-3 tabular-nums">{row.exits}</td><td className="px-4 py-3 tabular-nums">{row.voluntaryExits}</td><td className="px-4 py-3 tabular-nums">{row.shareOfDepartmentExits}%</td></tr>)}</tbody></table><p className="border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground">Use this as a cohort review signal for workload and team conditions, not as a manager rating.</p></div>
}

function CostAssumptions({ data, onApply }: { data: WorkforceAnalytics; onApply: (values: CostInputs) => void }) {
  const assumptions = data.decisionSupport.workforceImpact.assumptions
  const [draft, setDraft] = useState(() => ({
    recruitingCostPerHire: String(assumptions.recruitingCostPerHire),
    vacancyProductivityPercent: String(assumptions.vacancyProductivityPercent),
    onboardingDays: String(assumptions.onboardingDays),
    onboardingProductivityPercent: String(assumptions.onboardingProductivityPercent),
    courseFeePerLearner: String(assumptions.courseFeePerLearner),
    courseHoursPerLearner: String(assumptions.courseHoursPerLearner),
  }))
  const field = (key: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [key]: value }))
  const parsed = {
    recruitingCostPerHire: Number(draft.recruitingCostPerHire),
    vacancyProductivityPercent: Number(draft.vacancyProductivityPercent),
    onboardingDays: Number(draft.onboardingDays),
    onboardingProductivityPercent: Number(draft.onboardingProductivityPercent),
    courseFeePerLearner: Number(draft.courseFeePerLearner),
    courseHoursPerLearner: Number(draft.courseHoursPerLearner),
  }
  const valid = Object.values(draft).every((value) => value.trim() !== "")
    && Object.values(parsed).every(Number.isFinite)
    && parsed.recruitingCostPerHire >= 0
    && parsed.vacancyProductivityPercent >= 0 && parsed.vacancyProductivityPercent <= 100
    && parsed.onboardingDays >= 0
    && parsed.onboardingProductivityPercent >= 0 && parsed.onboardingProductivityPercent <= 100
    && parsed.courseFeePerLearner >= 0
    && parsed.courseHoursPerLearner > 0

  return <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <CardHeader className="border-b border-border px-5 py-4"><CardTitle>Cost assumptions</CardTitle><CardDescription>Adjust the scenario inputs. Calculations refresh from the backend.</CardDescription></CardHeader>
    <CardContent className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Filter label="Recruiting cost"><input type="number" min="0" step="500" value={draft.recruitingCostPerHire} onChange={(event) => field("recruitingCostPerHire", event.target.value)} /></Filter>
        <Filter label="Vacancy impact"><input type="number" min="0" max="100" step="5" value={draft.vacancyProductivityPercent} onChange={(event) => field("vacancyProductivityPercent", event.target.value)} /></Filter>
        <Filter label="Ramp days"><input type="number" min="0" max="730" step="5" value={draft.onboardingDays} onChange={(event) => field("onboardingDays", event.target.value)} /></Filter>
        <Filter label="Ramp impact"><input type="number" min="0" max="100" step="5" value={draft.onboardingProductivityPercent} onChange={(event) => field("onboardingProductivityPercent", event.target.value)} /></Filter>
        <Filter label="Course fee"><input type="number" min="0" step="50" value={draft.courseFeePerLearner} onChange={(event) => field("courseFeePerLearner", event.target.value)} /></Filter>
        <Filter label="Course hours"><input type="number" min="0.5" max="500" step="0.5" value={draft.courseHoursPerLearner} onChange={(event) => field("courseHoursPerLearner", event.target.value)} /></Filter>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-meta text-muted-foreground">Vacancy and ramp impact are percentages of salary cost. Employee pay is available for {data.decisionSupport.workforceImpact.summary.payDataCoverage}% of active records.</p>
        <Button size="sm" disabled={!valid} onClick={() => onApply(parsed)}>Recalculate</Button>
      </div>
    </CardContent>
  </Card>
}

function CapabilityAssumptions({ data, onApply }: { data: WorkforceAnalytics; onApply: (values: Pick<CostInputs, "courseFeePerLearner" | "courseHoursPerLearner">) => void }) {
  const assumptions = data.decisionSupport.workforceImpact.assumptions
  const [fee, setFee] = useState(String(assumptions.courseFeePerLearner))
  const [fallbackHours, setFallbackHours] = useState(String(assumptions.courseHoursPerLearner))
  const parsedFee = Number(fee)
  const parsedHours = Number(fallbackHours)
  const valid = fee.trim() !== "" && fallbackHours.trim() !== ""
    && Number.isFinite(parsedFee) && parsedFee >= 0
    && Number.isFinite(parsedHours) && parsedHours > 0 && parsedHours <= 500

  return <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <CardHeader className="border-b border-border px-5 py-4"><CardTitle>Learning cost scenario</CardTitle><CardDescription>Estimate the remaining delivery cost for assignments already in the learning register.</CardDescription></CardHeader>
    <CardContent className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
        <Filter label="Course fee per assignment"><input type="number" min="0" step="50" value={fee} onChange={(event) => setFee(event.target.value)} /></Filter>
        <Filter label="Fallback hours"><input type="number" min="0.5" max="500" step="0.5" value={fallbackHours} onChange={(event) => setFallbackHours(event.target.value)} /></Filter>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-meta text-muted-foreground">Uses recorded assignment hours when available. Estimated cost equals course fees plus employee time from current pay records.</p>
        <Button size="sm" disabled={!valid} onClick={() => onApply({ courseFeePerLearner: parsedFee, courseHoursPerLearner: parsedHours })}>Recalculate</Button>
      </div>
    </CardContent>
  </Card>
}

function ReplacementCostChart({ data }: { data: WorkforceAnalytics }) {
  const rows = [...data.decisionSupport.workforceImpact.roles]
    .filter((row) => row.replacementCostPerExit > 0)
    .sort((left, right) => right.replacementCostPerExit - left.replacementCostPerExit)
    .slice(0, 8)
    .map((row) => ({ ...row, label: row.jobTitle.length > 28 ? `${row.jobTitle.slice(0, 27)}…` : row.jobTitle }))
  if (!rows.length) return <div className="flex h-64 items-center justify-center text-body text-muted-foreground">No role-level cost exposure is available in this scope.</div>
  return <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 288 }}>
    <BarChart data={rows} layout="vertical" margin={{ top: 6, right: 18, bottom: 2, left: 38 }}>
      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
      <XAxis type="number" tickFormatter={(value) => currency(Number(value))} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
      <YAxis type="category" dataKey="label" width={142} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
      <Tooltip formatter={(value) => [currency(Number(value)), "Replacement scenario"]} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.jobTitle} · ${payload[0].payload.department}` : ""} />
      <Bar dataKey="replacementCostPerExit" fill={chartSeries.primary} radius={[0, 3, 3, 0]} />
    </BarChart>
  </ResponsiveContainer></div>
}

function EmployeeImpactPicker({ value, filters, onSelect }: { value: EmployeeImpactSearchResult | null; filters: Filters; onSelect: (employee: EmployeeImpactSearchResult) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<EmployeeImpactSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(queryFor(filters))
      params.set("mode", "search")
      if (query.trim()) params.set("q", query.trim())
      setSearching(true)
      fetch(`/api/v1/insights/employee-impact?${params.toString()}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json() as { results?: EmployeeImpactSearchResult[]; error?: string }
          if (!response.ok) throw new Error(payload.error ?? "Employee search is unavailable.")
          setResults(payload.results ?? [])
        })
        .catch((error: unknown) => { if ((error as { name?: string })?.name !== "AbortError") setResults([]) })
        .finally(() => setSearching(false))
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [filters, open, query])

  return <div className="relative w-full max-w-md" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    <span className="mb-1 block text-label font-semibold text-muted-foreground">Employee</span>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex h-9 w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-left text-control">
      <span className={value ? "min-w-0 truncate" : "text-muted-foreground"}>{value ? `${value.name} · ${value.jobTitle}` : "Search active employees"}</span>
      <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
    </button>
    {open && <div className="absolute right-0 z-30 mt-1 w-full min-w-[340px] overflow-hidden rounded-md border border-border bg-popover shadow-lg">
      <div className="relative border-b border-border"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false) }} placeholder="Search name, ID, role, department, or location" aria-label="Search active employees" className="h-10 w-full bg-transparent pl-10 pr-9 text-control outline-none" />{searching && <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}</div>
      <div role="listbox" aria-label="Active employees" className="max-h-64 overflow-y-auto p-1.5">{results.length ? results.map((employee) => <button key={employee.employeeId} type="button" role="option" aria-selected={employee.employeeId === value?.employeeId} onClick={() => { onSelect(employee); setOpen(false); setQuery("") }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"><span className="min-w-0 flex-1"><span className="block truncate text-control font-semibold">{employee.name}</span><span className="block truncate text-meta text-muted-foreground">{employee.employeeId} · {employee.jobTitle} · {employee.department} · {employee.location}</span></span>{employee.employeeId === value?.employeeId && <Check className="size-4 shrink-0 text-primary" />}</button>) : <p className="px-3 py-6 text-center text-meta text-muted-foreground">{searching ? "Searching…" : "No active employees match this search."}</p>}</div>
    </div>}
  </div>
}

function EmployeeImpactPanel({ data, filters }: { data: WorkforceAnalytics; filters: Filters }) {
  const employees = data.decisionSupport.workforceImpact.employees
  const [employeeId, setEmployeeId] = useState(employees[0]?.employeeId ?? "")
  const [scenario, setScenario] = useState<EmployeeImpactScenario | null>(employees[0] ?? null)
  const [pendingEmployee, setPendingEmployee] = useState<EmployeeImpactSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const scenarioQuery = useMemo(() => queryFor(filters), [filters])

  useEffect(() => {
    if (!employeeId) return
    const controller = new AbortController()
    const params = new URLSearchParams(scenarioQuery)
    params.set("employeeId", employeeId)
    fetch(`/api/v1/insights/employee-impact?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { scenario?: EmployeeImpactScenario; error?: string }
        if (!response.ok || !payload.scenario) throw new Error(payload.error ?? "Employee impact data is unavailable.")
        setScenario(payload.scenario)
        setPendingEmployee(null)
        setError("")
      })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") { setScenario(null); setPendingEmployee(null); setError(reason instanceof Error ? reason.message : "Employee impact data is unavailable.") } })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [employeeId, scenarioQuery])

  const selected = scenario
  const selectedIdentity = pendingEmployee ?? selected
  return <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <CardHeader className="gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
      <div><CardTitle>Employee continuity scenario</CardTitle><CardDescription>Role coverage and replacement assumptions for any active employee.</CardDescription></div>
      <EmployeeImpactPicker value={selectedIdentity} filters={filters} onSelect={(employee) => { setLoading(true); setPendingEmployee(employee); setEmployeeId(employee.employeeId); setError("") }} />
    </CardHeader>
    <CardContent className="space-y-4 p-5">
      {loading && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse rounded-full bg-primary" /></div>}
      {error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-meta text-destructive">{error}</p>}
      {!selected && !loading && <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-body text-muted-foreground">Search for an active employee to calculate a continuity scenario.</div>}
      {selected && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div><p className="text-kpi-label text-muted-foreground">Role coverage</p><p className="mt-1 text-card-title font-semibold">{selected.continuityStatus}</p><p className="text-meta text-muted-foreground">{selected.activeRolePeers} peers · {selected.directReports} direct reports</p></div>
        <div><p className="text-kpi-label text-muted-foreground">Refill estimate</p><p className="mt-1 text-card-title font-semibold">{selected.refillDays} days</p><p className="text-meta text-muted-foreground">{refillBasisLabel(selected.refillBasis)}</p></div>
        <div><p className="text-kpi-label text-muted-foreground">Replacement scenario</p><p className="mt-1 text-card-title font-semibold">{currency(selected.replacementCost)}</p><p className="text-meta text-muted-foreground">{selected.payDataAvailable ? "Recruiting, vacancy, and ramp cost" : "Recruiting cost only; pay data is missing"}</p></div>
        <div><p className="text-kpi-label text-muted-foreground">Hiring coverage</p><p className="mt-1 text-card-title font-semibold">{selected.openMatchingRequisitions}</p><p className="text-meta text-muted-foreground">Open requisitions for this role</p></div>
      </div>
      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
        <div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Recruiting</p><p className="mt-1 text-subsection font-semibold tabular-nums">{currency(selected.directRecruitingCost)}</p></div>
        <div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Vacancy capacity</p><p className="mt-1 text-subsection font-semibold tabular-nums">{currency(selected.vacancyCost)}</p></div>
        <div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Onboarding ramp</p><p className="mt-1 text-subsection font-semibold tabular-nums">{currency(selected.onboardingCost)}</p></div>
      </div>
      <div className="grid gap-3 border-t border-border pt-4 lg:grid-cols-2">
        <div><p className="text-body font-semibold">Workforce evidence</p><p className="mt-0.5 text-meta text-muted-foreground">{selected.jobTitle} · {selected.department} · {selected.location}{selected.manager ? ` · Manager: ${selected.manager}` : ""}</p></div>
        <div><p className="text-body font-semibold">Model evidence</p><p className="mt-0.5 text-meta text-muted-foreground">{selected.riskScore === null ? "No model review record is linked to this employee." : `${selected.riskScore}% ${selected.riskLevel ?? ""} review signal${selected.topDriver ? ` · Leading contributor: ${selected.topDriver}` : ""}.`}</p></div>
      </div>
      <div className="grid gap-3 border-t border-border pt-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div><p className="text-body font-semibold">Learning evidence</p><p className="mt-0.5 text-meta text-muted-foreground">{selected.incompleteLearningAssignments ? `${selected.incompleteLearningAssignments} incomplete assignments are linked. Course cost scenario: ${currency(selected.proposedLearningInvestment)}.` : "No incomplete learning assignment is linked."}</p></div>
        <div className="flex flex-wrap gap-2"><Link className={actionLinkClass} href={`/onboarding?view=talent&department=${encodeURIComponent(selected.department)}&q=${encodeURIComponent(selected.jobTitle)}`}>Review hiring coverage</Link><Link className={actionLinkClass} href={`/courses?department=${encodeURIComponent(selected.department)}&q=${encodeURIComponent(selected.employeeId)}`}>Review learning</Link></div>
      </div>
      </>}
    </CardContent>
  </Card>
}

function RoleContinuityTable({ data }: { data: WorkforceAnalytics }) {
  const rows = data.decisionSupport.workforceImpact.roles.filter((row) => row.continuityStatus !== "Covered").slice(0, 12)
  return <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <CardHeader className="border-b border-border px-5 py-4"><CardTitle>Role continuity</CardTitle><CardDescription>Roles where observed movement, model-review concentration, or refill time warrants coverage planning.</CardDescription></CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-body"><thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Role", "Status", "Coverage", "Movement", "Refill", "Replacement scenario", "Open"].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={`${row.department}-${row.jobTitle}`} className="border-t border-border/70"><td className="px-4 py-3"><p className="font-semibold">{row.jobTitle}</p><p className="text-meta text-muted-foreground">{row.department}</p></td><td className="px-4 py-3"><Badge variant={row.continuityStatus === "Critical" ? "destructive" : "secondary"}>{row.continuityStatus}</Badge></td><td className="px-4 py-3"><p>{row.activeEmployees} active · {row.reviewProfiles} in review</p><p className="text-meta text-muted-foreground">{row.reviewShare}% review share</p></td><td className="px-4 py-3"><p>{row.recordedExits} exits · {row.completedHires} hires</p><p className="text-meta text-muted-foreground">{row.openRequisitions} open requisitions</p></td><td className="px-4 py-3"><p>{row.refillDays} days</p><p className="text-meta text-muted-foreground">{refillBasisLabel(row.refillBasis)}</p></td><td className="px-4 py-3"><p className="font-semibold tabular-nums">{currency(row.replacementCostPerExit)}</p><p className="text-meta text-muted-foreground">Role-average cost scenario</p></td><td className="px-4 py-3"><Link className={actionLinkClass} href={`/onboarding?view=talent&department=${encodeURIComponent(row.department)}&q=${encodeURIComponent(row.jobTitle)}`}>Talent</Link></td></tr>)}</tbody></table></div>{!rows.length && <p className="p-8 text-center text-body text-muted-foreground">No roles require a continuity review in this scope.</p>}</CardContent>
  </Card>
}

function LearningEconomics({ data }: { data: WorkforceAnalytics }) {
  const rows = data.decisionSupport.workforceImpact.capabilityPlans
  return <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <CardHeader className="border-b border-border px-5 py-4"><CardTitle>Learning follow-up</CardTitle><CardDescription>Completion, required work, remaining effort, and cost calculated from current assignments.</CardDescription></CardHeader>
    <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-body"><thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Department", "Completion", "Open assignments", "Required work", "Remaining effort", "Status", "Open"].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.department} className="border-t border-border/70"><td className="px-4 py-3"><p className="font-semibold">{row.department}</p><p className="text-meta text-muted-foreground">{row.assignedEmployees} of {row.activeEmployees} active employees assigned</p></td><td className="px-4 py-3"><p className="font-semibold tabular-nums">{row.completionRate}%</p><div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, row.completionRate)}%` }} /></div><p className="mt-1 text-meta text-muted-foreground">{row.completedAssignments} of {row.totalAssignments}</p></td><td className="px-4 py-3"><p>{row.incompleteAssignments} assignment{row.incompleteAssignments === 1 ? "" : "s"}</p><p className="text-meta text-muted-foreground">{row.incompleteEmployees} employee{row.incompleteEmployees === 1 ? "" : "s"}{row.leadingProgram ? ` · ${row.leadingProgram}` : ""}</p></td><td className="px-4 py-3"><p>{row.mandatoryGaps} required</p><p className={cn("text-meta", row.overdueMandatoryGaps ? "font-semibold text-destructive" : "text-muted-foreground")}>{row.overdueMandatoryGaps} overdue</p></td><td className="px-4 py-3"><p>{row.remainingHours} hours</p><p className="text-meta text-muted-foreground">{currency(row.estimatedRemainingCost)} estimated cost</p></td><td className="px-4 py-3"><Badge variant={row.status === "Overdue required" ? "destructive" : row.status === "Required work open" ? "secondary" : "outline"}>{row.status}</Badge></td><td className="px-4 py-3"><Link className={actionLinkClass} href={`/courses?department=${encodeURIComponent(row.department)}${row.overdueMandatoryGaps ? "&status=overdue" : ""}`}>Review assignments</Link></td></tr>)}</tbody></table></div>{!rows.length && <p className="p-8 text-center text-body text-muted-foreground">No learning assignments match this reporting scope.</p>}</CardContent>
  </Card>
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-label font-semibold text-muted-foreground">
      {label}
      <span className="mt-1.5 block [&_input]:h-9 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-border [&_input]:bg-background [&_input]:px-3 [&_input]:text-control [&_input]:font-normal [&_select]:h-9 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-background [&_select]:px-3 [&_select]:text-control [&_select]:font-normal">
        {children}
      </span>
    </label>
  )
}

export function InsightsWorkspace({ initialData }: { initialData: WorkforceAnalytics }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filters, setFilters] = useState<Filters>(() => initialFilters(searchParams))
  const [data, setData] = useState<WorkforceAnalytics | null>(initialData)
  const [loadedQuery, setLoadedQuery] = useState<string | null>(() => queryFor(initialFilters(searchParams)))
  const lastRequestKey = useRef(`${queryFor(initialFilters(searchParams))}:0`)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [error, setError] = useState("")
  const requestedView = searchParams.get("view")
  const analysisView: AnalysisView = requestedView === "impact" || requestedView === "talent" || requestedView === "capability" ? requestedView : "overview"
  const selectedWorkItemId = searchParams.get("item")
  const requestQuery = useMemo(() => queryFor(filters), [filters])
  const reportingHref = useMemo(() => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => { if (value !== "" && value !== undefined) params.set(key, String(value)) })
    if (analysisView !== "overview") params.set("view", analysisView)
    if (selectedWorkItemId) params.set("item", selectedWorkItemId)
    return `/insights?${params.toString()}`
  }, [analysisView, filters, selectedWorkItemId])
  const loading = requestQuery !== loadedQuery

  useEffect(() => {
    const current = `/insights${searchParams.size ? `?${searchParams.toString()}` : ""}`
    if (current !== reportingHref) router.replace(reportingHref, { scroll: false })
  }, [reportingHref, router, searchParams])

  function selectAnalysisView(view: AnalysisView) {
    const params = new URLSearchParams(searchParams.toString())
    if (view === "overview") params.delete("view")
    else params.set("view", view)
    router.replace(`/insights${params.size ? `?${params.toString()}` : ""}`, { scroll: false })
  }

  const actions = useMemo(() => {
    const available = data?.decisionSupport.actions ?? []
    const selected = selectedWorkItemId ? available.find((action) => action.workItem?.id === selectedWorkItemId) : undefined
    if (!selected) return available.slice(0, 6)
    return [selected, ...available.filter((action) => action.id !== selected.id).slice(0, 5)]
  }, [data, selectedWorkItemId])

  useEffect(() => {
    const requestKey = `${requestQuery}:${refreshVersion}`
    if (lastRequestKey.current === requestKey) return
    lastRequestKey.current = requestKey
    const controller = new AbortController()
    fetch(`/api/v1/workforce?${requestQuery}`, { cache: "no-store", signal: controller.signal })
      .then(async (workforceResponse) => {
        if (!workforceResponse.ok) throw new Error("Workforce insights could not be loaded.")
        return workforceResponse.json() as Promise<WorkforceAnalytics>
      })
      .then((workforce) => {
        setData(workforce)
        setLoadedQuery(requestQuery)
        setError("")
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") {
          setError(reason instanceof Error ? reason.message : "Workforce insights could not be loaded.")
          setLoadedQuery(requestQuery)
        }
      })
    return () => controller.abort()
  }, [requestQuery, refreshVersion])

  useEffect(() => {
    if (!selectedWorkItemId) return
    const selected = actions.find((action) => action.workItem?.id === selectedWorkItemId)
    if (!selected) return
    const frame = window.requestAnimationFrame(() => document.getElementById(`insight-${selected.id}`)?.scrollIntoView({ block: "center" }))
    return () => window.cancelAnimationFrame(frame)
  }, [actions, selectedWorkItemId])

  if (!data && loading) return <WorkspacePage><div className="h-28 animate-pulse rounded-md bg-muted" /><div className="h-96 animate-pulse rounded-md bg-muted" /></WorkspacePage>
  if (!data) return <WorkspacePage><Card><CardContent className="p-6 text-body text-destructive">{error || "Workforce insights could not be loaded."}</CardContent></Card></WorkspacePage>

  const flow = flowRows(data.hiring.trend, data.attrition.trend)
  const exitReasons = exitReasonRows(data.attrition.byExitReason)
  const company = data.decisionSupport.company
  const impact = data.decisionSupport.workforceImpact

  return (
    <WorkspacePage>
      <WorkspaceHeader
        title="Insights"
        description="Workforce movement, operating exceptions, and department measures."
        meta={<>{filters.from} to {filters.to}</>}
        actions={<>
          <a href={`/api/v1/reports?format=pdf&${requestQuery}`} className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-control hover:bg-muted">PDF summary</a>
          <a href={`/api/v1/reports?format=xlsx&${requestQuery}`} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-control text-primary-foreground hover:bg-primary/80">Export data</a>
        </>}
      />

      <Card className="gap-4 p-4 shadow-none">
        <div className="flex items-center justify-between"><p className="text-card-title font-semibold">Reporting scope</p><Button size="sm" variant="ghost" onClick={() => setFilters({ ...rollingYear(), department: "", location: "", period: "quarter" })}>Reset</Button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Filter label="From"><input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></Filter>
          <Filter label="To"><input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></Filter>
          <Filter label="Department"><select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select></Filter>
          <Filter label="Location"><select value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })}><option value="">All locations</option>{data.dimensions.locations.map((item) => <option key={item}>{item}</option>)}</select></Filter>
          <Filter label="Interval"><select value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value as Filters["period"] })}><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></Filter>
        </div>
        {loading && <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 animate-pulse rounded-full bg-primary" /></div>}
        <p className="text-meta text-muted-foreground">Headcount and open roles are current snapshots. Hires, exits, leave, learning, and promotions use persisted dates in this range. Cost values are scenarios.</p>
      </Card>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-meta text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">{error}</div>}

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardContent className="flex flex-wrap gap-1 border-b border-border p-2" role="tablist" aria-label="Insights view">
          {([['overview', 'Overview'], ['impact', 'Workforce impact'], ['talent', 'Talent supply'], ['capability', 'Capability']] as Array<[AnalysisView, string]>).map(([id, label]) => <Button key={id} size="sm" variant={analysisView === id ? "secondary" : "ghost"} role="tab" aria-selected={analysisView === id} onClick={() => selectAnalysisView(id)}>{label}</Button>)}
        </CardContent>
        <CardContent className="px-4 py-3"><p className="text-card-title font-semibold">{viewGuidance[analysisView].title}</p><p className="mt-0.5 text-meta text-muted-foreground">{viewGuidance[analysisView].description}</p></CardContent>
      </Card>

      {analysisView === "overview" && <>
        <MetricStrip metrics={[
          { label: "Active employees", value: compact(data.kpis.activeEmployees), detail: `${data.employeeAnalytics.onLeave} on leave` },
          { label: "Attrition rate", value: `${data.attrition.rate}%`, detail: `${data.attrition.totalExits} recorded exits` },
          { label: "Replacement rate", value: percent(company.replacementRate), detail: "Completed hires per 100 exits" },
          { label: "Open roles", value: compact(data.hiring.activeRequisitions), detail: `${company.vacancyRate}% vacancy rate` },
          { label: "Continuity reviews", value: impact.summary.rolesNeedingContinuityReview, detail: "Roles marked critical or watch" },
        ]} />
        <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle>Department comparison</CardTitle><CardDescription>Current workforce, movement, hiring coverage, required learning, and leave in one view.</CardDescription></CardHeader><CardContent className="p-0"><DepartmentPressure data={data} onSelect={(department) => setFilters({ ...filters, department })} /></CardContent></Card>
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <CardHeader className="gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div><CardTitle>Priority reviews</CardTitle><CardDescription>Generated from current operating records. Creating a review adds a durable item to the work queue.</CardDescription></div>
              <Link className={actionLinkClass} href="/inbox?view=my_work&type=insight&returnTo=%2Finsights">Open work queue</Link>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">{actions.map((action) => <div id={`insight-${action.id}`} key={action.id} className={cn("grid scroll-mt-24 gap-3 px-5 py-4 lg:grid-cols-[minmax(150px,0.65fr)_minmax(220px,1fr)_minmax(260px,1.2fr)_auto] lg:items-center", action.workItem?.id === selectedWorkItemId && "bg-accent/45 ring-1 ring-inset ring-primary/30")}><div><p className="text-card-title font-semibold">{action.department}</p><Badge className="mt-1" variant={action.severity === "high" ? "destructive" : "secondary"}>{action.severity === "high" ? "High priority" : "Review"}</Badge></div><div><p className="text-body font-semibold">{action.title}</p><p className="mt-0.5 text-meta text-muted-foreground">Trigger: {action.evidence}</p></div><div><p className="text-label font-semibold text-muted-foreground">Recommended check</p><p className="mt-0.5 text-body">{action.recommendedAction}</p></div><InsightActionButton action={action} filters={filters} onUpdated={() => setRefreshVersion((current) => current + 1)} /></div>)}{!actions.length && <p className="px-5 py-8 text-center text-body text-muted-foreground">No exceptions meet the review rules in this reporting scope.</p>}</CardContent>
        </Card>
        <Card className="shadow-none"><CardHeader><CardTitle>Exit reasons</CardTitle><CardDescription>Recorded outcomes in the reporting period. Use these categories to select a cohort for review, not to infer an individual cause.</CardDescription></CardHeader><CardContent className="max-w-3xl"><ExitReasonChart rows={exitReasons} /></CardContent></Card>
      </>}

      {analysisView === "impact" && <>
        <MetricStrip metrics={[
          { label: "Recorded exit cost", value: currency(impact.summary.estimatedCostOfRecordedExits), detail: "Scenario estimate for exits in scope" },
          { label: "Average replacement", value: currency(impact.summary.averageReplacementCost), detail: "Per costed exit" },
          { label: "Replacement coverage", value: percent(company.replacementRate), detail: "Completed hires per 100 exits" },
          { label: "Continuity reviews", value: impact.summary.rolesNeedingContinuityReview, detail: "Critical or watch roles" },
          { label: "Pay data coverage", value: `${impact.summary.payDataCoverage}%`, detail: "Active employee profiles" },
        ]} />
        <CostAssumptions key={Object.values(impact.assumptions).join("-")} data={data} onApply={(values) => setFilters((current) => ({ ...current, ...values }))} />
        <div className="grid items-start gap-4 xl:grid-cols-2"><Card className="shadow-none"><CardHeader><CardTitle>Replacement cost by role</CardTitle><CardDescription>Scenario cost calculated from average pay, refill history, and the assumptions above.</CardDescription></CardHeader><CardContent><ReplacementCostChart data={data} /></CardContent></Card><EmployeeImpactPanel data={data} filters={filters} /></div>
        <RoleContinuityTable data={data} />
      </>}

      {analysisView === "talent" && <>
        <MetricStrip metrics={[
          { label: "Completed hires", value: data.hiring.totalHired, detail: "Within reporting scope" },
          { label: "Average time to hire", value: `${data.hiring.averageTimeToHire} days`, detail: "Completed hires" },
          { label: "Open requisitions", value: data.hiring.activeRequisitions, detail: `${data.hiring.offers} at offer` },
          { label: "Recorded exits", value: data.attrition.totalExits, detail: `${data.attrition.voluntary} voluntary` },
          { label: "Replacement rate", value: percent(company.replacementRate), detail: "Completed hires per 100 exits" },
        ]} />
        <div className="grid gap-4 xl:grid-cols-2"><Card className="shadow-none"><CardHeader><CardTitle>Workforce flow</CardTitle><CardDescription>Completed hires and recorded exits by {data.filters.period}.</CardDescription></CardHeader><CardContent><FlowChart rows={flow} /></CardContent></Card><Card className="shadow-none"><CardHeader><CardTitle>Hiring source performance</CardTitle><CardDescription>Completed hire volume compared with time to hire.</CardDescription></CardHeader><CardContent><SourceEfficiency data={data} /></CardContent></Card></div>
        <div className="grid gap-4 xl:grid-cols-2"><Card className="shadow-none"><CardHeader><CardTitle>Tenure attrition</CardTitle><CardDescription>Observed exits normalized by tenure-cohort population.</CardDescription></CardHeader><CardContent><TenureAttrition data={data} /></CardContent></Card><Card className="shadow-none"><CardHeader><CardTitle>Manager cohorts</CardTitle><CardDescription>Teams with concentrated recorded exits for workload review.</CardDescription></CardHeader><CardContent className="p-0"><ManagerConcentration data={data} /></CardContent></Card></div>
      </>}

      {analysisView === "capability" && <>
        <MetricStrip metrics={[
          { label: "Learning completion", value: `${company.trainingCompletionRate}%`, detail: `${data.training.totalAssignments} assignments in scope` },
          { label: "Employees assigned", value: company.trainingAssignedEmployees, detail: "Unique employees in this scope" },
          { label: "Open assignments", value: company.incompleteTrainingAssignments, detail: `${company.incompleteTrainingEmployees} employees` },
          { label: "Required learning", value: company.mandatoryTrainingGaps, detail: `${company.overdueMandatoryTrainingGaps} overdue` },
          { label: "Remaining effort", value: `${company.incompleteTrainingHours}h`, detail: "Recorded assignment hours" },
        ]} />
        <CapabilityAssumptions key={`capability-${impact.assumptions.courseFeePerLearner}-${impact.assumptions.courseHoursPerLearner}`} data={data} onApply={(values) => setFilters((current) => ({ ...current, ...values }))} />
        <LearningEconomics data={data} />
      </>}
    </WorkspacePage>
  )
}
