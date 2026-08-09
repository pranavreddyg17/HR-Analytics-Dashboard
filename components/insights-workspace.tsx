"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts"

import { MetricStrip, WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import { InsightActionButton } from "@/components/insight-action-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { BreakdownPoint, TimePoint, WorkforceAnalytics } from "@/lib/hr-types"
import { cn } from "@/lib/utils"

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

const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
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
          <Bar dataKey="hires" name="Completed hires" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="exits" name="Recorded exits" fill="var(--destructive)" radius={[3, 3, 0, 0]} />
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
              {rows.map((row, index) => <Cell key={row.label} fill={chartColors[index % chartColors.length]} />)}
            </Pie>
            <Tooltip formatter={(value) => [`${value} exits`, "Recorded"]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.label} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-meta">
            <span className="size-2.5 rounded-sm" style={{ background: chartColors[index % chartColors.length] }} />
            <span className="truncate text-muted-foreground">{row.label}</span>
            <span className="tabular-nums">{row.value} · {Math.round((row.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DepartmentPressure({ data }: { data: WorkforceAnalytics }) {
  const rows = data.decisionSupport.departments.map((row) => ({ department: row.department, attrition: row.attritionRate, vacancy: row.vacancyRate, active: row.activeEmployees, coverage: row.coverageStatus }))
  if (!rows.length) return <div className="flex h-64 items-center justify-center text-body text-muted-foreground">No department measures in this scope.</div>
  return <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 900, height: 288 }}>
    <ScatterChart margin={{ top: 12, right: 18, bottom: 20, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis type="number" dataKey="attrition" name="Attrition rate" unit="%" domain={[0, "dataMax + 2"]} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} label={{ value: "Attrition rate", position: "insideBottom", offset: -12, fill: "var(--muted-foreground)", fontSize: 11 }} />
      <YAxis type="number" dataKey="vacancy" name="Vacancy rate" unit="%" domain={[0, "dataMax + 2"]} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} label={{ value: "Vacancy rate", angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 11 }} />
      <ZAxis type="number" dataKey="active" range={[80, 480]} name="Active employees" />
      <ReferenceLine x={data.attrition.rate} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
      <ReferenceLine y={data.decisionSupport.company.vacancyRate} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
      <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
        const row = payload?.[0]?.payload as typeof rows[number] | undefined
        return active && row ? <div className="rounded-md border border-border bg-popover px-3 py-2 text-meta shadow-sm"><p className="font-semibold">{row.department}</p><p className="mt-1 text-muted-foreground">{row.attrition}% attrition · {row.vacancy}% vacancy</p><p className="text-muted-foreground">{row.active} active · {row.coverage} coverage</p></div> : null
      }} />
      <Scatter data={rows} fill="var(--chart-1)" />
    </ScatterChart>
  </ResponsiveContainer></div>
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
      <Bar dataKey="attritionRate" name="Attrition rate" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
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
      <Bar yAxisId="hires" dataKey="hires" name="Completed hires" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
      <Line yAxisId="days" type="monotone" dataKey="averageDays" name="Average days to hire" stroke="var(--chart-5)" strokeWidth={2} dot={{ r: 3 }} />
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

function RoleExposureChart({ data }: { data: WorkforceAnalytics }) {
  const rows = data.decisionSupport.workforceImpact.roles
    .filter((row) => row.reviewWeightedExposure > 0)
    .slice(0, 8)
    .map((row) => ({ ...row, label: row.jobTitle.length > 28 ? `${row.jobTitle.slice(0, 27)}…` : row.jobTitle }))
  if (!rows.length) return <div className="flex h-64 items-center justify-center text-body text-muted-foreground">No role-level cost exposure is available in this scope.</div>
  return <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 288 }}>
    <BarChart data={rows} layout="vertical" margin={{ top: 6, right: 18, bottom: 2, left: 38 }}>
      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
      <XAxis type="number" tickFormatter={(value) => currency(Number(value))} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
      <YAxis type="category" dataKey="label" width={142} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
      <Tooltip formatter={(value) => [currency(Number(value)), "Risk-weighted exposure"]} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.jobTitle} · ${payload[0].payload.department}` : ""} />
      <Bar dataKey="reviewWeightedExposure" fill="var(--chart-1)" radius={[0, 3, 3, 0]} />
    </BarChart>
  </ResponsiveContainer></div>
}

function EmployeeImpactPanel({ data }: { data: WorkforceAnalytics }) {
  const employees = data.decisionSupport.workforceImpact.employees
  const [employeeId, setEmployeeId] = useState(employees[0]?.employeeId ?? "")
  const selected = employees.find((employee) => employee.employeeId === employeeId) ?? employees[0]
  if (!selected) return <Card className="shadow-none"><CardHeader><CardTitle>Employee impact scenario</CardTitle><CardDescription>No active model-review employees match this scope.</CardDescription></CardHeader></Card>
  const courseHref = `/courses?department=${encodeURIComponent(selected.department)}&q=${encodeURIComponent(selected.employeeId)}`
  const hiringHref = `/onboarding?view=talent&department=${encodeURIComponent(selected.department)}&q=${encodeURIComponent(selected.jobTitle)}`
  return <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <CardHeader className="gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
      <div><CardTitle>Employee impact scenario</CardTitle><CardDescription>Continuity and replacement economics for one review profile.</CardDescription></div>
      <label className="w-full max-w-sm text-label font-semibold text-muted-foreground">Employee<select value={selected.employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-1 block h-9 w-full rounded-md border border-border bg-background px-3 text-control font-normal text-foreground">{employees.map((employee) => <option key={employee.employeeId} value={employee.employeeId}>{employee.name} · {employee.jobTitle}</option>)}</select></label>
    </CardHeader>
    <CardContent className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div><p className="text-kpi-label text-muted-foreground">Continuity</p><p className="mt-1 text-card-title font-semibold">{selected.continuityStatus}</p><p className="text-meta text-muted-foreground">{selected.activeRolePeers} active peers · {selected.directReports} direct reports</p></div>
        <div><p className="text-kpi-label text-muted-foreground">Refill estimate</p><p className="mt-1 text-card-title font-semibold">{selected.refillDays} days</p><p className="text-meta text-muted-foreground">Based on {selected.refillBasis} hiring history</p></div>
        <div><p className="text-kpi-label text-muted-foreground">Replacement scenario</p><p className="mt-1 text-card-title font-semibold">{currency(selected.replacementCost)}</p><p className="text-meta text-muted-foreground">Recruiting, vacancy, and ramp cost</p></div>
        <div><p className="text-kpi-label text-muted-foreground">Review-weighted exposure</p><p className="mt-1 text-card-title font-semibold">{currency(selected.reviewWeightedExposure)}</p><p className="text-meta text-muted-foreground">{selected.riskScore}% model review score</p></div>
      </div>
      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
        <div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Recruiting</p><p className="mt-1 text-subsection font-semibold tabular-nums">{currency(selected.directRecruitingCost)}</p></div>
        <div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Vacancy capacity</p><p className="mt-1 text-subsection font-semibold tabular-nums">{currency(selected.vacancyCost)}</p></div>
        <div className="rounded-md border border-border p-3"><p className="text-label font-semibold">Onboarding ramp</p><p className="mt-1 text-subsection font-semibold tabular-nums">{currency(selected.onboardingCost)}</p></div>
      </div>
      <div className="grid gap-3 border-t border-border pt-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div><p className="text-body font-semibold">Learning check</p><p className="mt-0.5 text-meta text-muted-foreground">{selected.incompleteLearningAssignments ? `${selected.incompleteLearningAssignments} incomplete assignments are already linked. A ${currency(selected.proposedLearningInvestment)} course scenario breaks even at ${selected.learningBreakEvenPercent}% of the replacement estimate.` : "No incomplete learning assignment is linked. Confirm a skill gap before treating training as an intervention."}</p></div>
        <div className="flex flex-wrap gap-2"><Link className={actionLinkClass} href={hiringHref}>Review hiring coverage</Link><Link className={actionLinkClass} href={courseHref}>Review learning</Link></div>
      </div>
    </CardContent>
  </Card>
}

function RoleContinuityTable({ data }: { data: WorkforceAnalytics }) {
  const rows = data.decisionSupport.workforceImpact.roles.filter((row) => row.continuityStatus !== "Covered").slice(0, 12)
  return <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <CardHeader className="border-b border-border px-5 py-4"><CardTitle>Role continuity</CardTitle><CardDescription>Roles where observed movement, model-review concentration, or refill time warrants coverage planning.</CardDescription></CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-body"><thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Role", "Status", "Coverage", "Movement", "Refill", "Replacement scenario", "Open"].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={`${row.department}-${row.jobTitle}`} className="border-t border-border/70"><td className="px-4 py-3"><p className="font-semibold">{row.jobTitle}</p><p className="text-meta text-muted-foreground">{row.department}</p></td><td className="px-4 py-3"><Badge variant={row.continuityStatus === "Critical" ? "destructive" : "secondary"}>{row.continuityStatus}</Badge></td><td className="px-4 py-3"><p>{row.activeEmployees} active · {row.reviewProfiles} in review</p><p className="text-meta text-muted-foreground">{row.reviewShare}% review share</p></td><td className="px-4 py-3"><p>{row.recordedExits} exits · {row.completedHires} hires</p><p className="text-meta text-muted-foreground">{row.openRequisitions} open requisitions</p></td><td className="px-4 py-3"><p>{row.refillDays} days</p><p className="text-meta text-muted-foreground">{row.refillBasis} history</p></td><td className="px-4 py-3"><p className="font-semibold tabular-nums">{currency(row.replacementCostPerExit)}</p><p className="text-meta text-muted-foreground">{currency(row.reviewWeightedExposure)} weighted exposure</p></td><td className="px-4 py-3"><Link className={actionLinkClass} href={`/onboarding?view=talent&department=${encodeURIComponent(row.department)}&q=${encodeURIComponent(row.jobTitle)}`}>Talent</Link></td></tr>)}</tbody></table></div>{!rows.length && <p className="p-8 text-center text-body text-muted-foreground">No roles require a continuity review in this scope.</p>}</CardContent>
  </Card>
}

function LearningEconomics({ data }: { data: WorkforceAnalytics }) {
  const rows = data.decisionSupport.workforceImpact.learningCases
  return <Card className="gap-0 overflow-hidden py-0 shadow-none">
    <CardHeader className="border-b border-border px-5 py-4"><CardTitle>Learning investment screen</CardTitle><CardDescription>Tests the cost of a course against replacement exposure only where an incomplete assignment already exists.</CardDescription></CardHeader>
    <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left text-body"><thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Department", "Linked evidence", "Course scenario", "Break-even", "Decision", "Open"].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.department} className="border-t border-border/70"><td className="px-4 py-3 font-semibold">{row.department}</td><td className="px-4 py-3"><p>{row.employeesWithLearningGap} of {row.employeesInReview} employees</p><p className="text-meta text-muted-foreground">{row.incompleteAssignments} assignments · {row.assignedHours} hours{row.leadingProgram ? ` · ${row.leadingProgram}` : ""}</p></td><td className="px-4 py-3"><p className="font-semibold tabular-nums">{currency(row.proposedLearningInvestment)}</p><p className="text-meta text-muted-foreground">{currency(row.reviewWeightedExposure)} linked exposure</p></td><td className="px-4 py-3 tabular-nums">{row.breakEvenPercent === null ? "Not available" : `${row.breakEvenPercent}%`}</td><td className="px-4 py-3"><Badge variant={row.decision === "Assess skill fit" ? "secondary" : "outline"}>{row.decision}</Badge></td><td className="px-4 py-3"><Link className={actionLinkClass} href={`/courses?department=${encodeURIComponent(row.department)}`}>Assignments</Link></td></tr>)}</tbody></table></div></CardContent>
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

  const actions = useMemo(() => data?.decisionSupport.actions.slice(0, 6) ?? [], [data])

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
  const departments = data.decisionSupport.departments
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
        <CardContent className="flex flex-wrap gap-1 p-2" role="tablist" aria-label="Insights view">
          {([['overview', 'Overview'], ['impact', 'Workforce impact'], ['talent', 'Talent supply'], ['capability', 'Capability']] as Array<[AnalysisView, string]>).map(([id, label]) => <Button key={id} size="sm" variant={analysisView === id ? "secondary" : "ghost"} role="tab" aria-selected={analysisView === id} onClick={() => selectAnalysisView(id)}>{label}</Button>)}
        </CardContent>
      </Card>

      {analysisView === "overview" && <>
        <MetricStrip metrics={[
          { label: "Active employees", value: compact(data.kpis.activeEmployees), detail: `${data.employeeAnalytics.onLeave} on leave` },
          { label: "Attrition rate", value: `${data.attrition.rate}%`, detail: `${data.attrition.totalExits} recorded exits` },
          { label: "Replacement rate", value: percent(company.replacementRate), detail: "Completed hires per 100 exits" },
          { label: "Open roles", value: compact(data.hiring.activeRequisitions), detail: `${company.vacancyRate}% vacancy rate` },
          { label: "Continuity reviews", value: impact.summary.rolesNeedingContinuityReview, detail: "Roles marked critical or watch" },
        ]} />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]"><Card className="shadow-none"><CardHeader><CardTitle>Department pressure</CardTitle><CardDescription>Attrition and vacancy pressure, sized by active headcount.</CardDescription></CardHeader><CardContent><DepartmentPressure data={data} /></CardContent></Card><Card className="shadow-none"><CardHeader><CardTitle>Exit reasons</CardTitle><CardDescription>Recorded reasons for exits in this scope.</CardDescription></CardHeader><CardContent><ExitReasonChart rows={exitReasons} /></CardContent></Card></div>
        <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle>Action queue</CardTitle><CardDescription>Calculated exceptions with a durable owner and completion record.</CardDescription></CardHeader><CardContent className="divide-y divide-border p-0">{actions.map((action) => <div id={`insight-${action.id}`} key={action.id} className={cn("grid scroll-mt-24 gap-3 px-5 py-3 lg:grid-cols-[minmax(150px,0.7fr)_minmax(240px,1fr)_minmax(280px,1.35fr)_auto] lg:items-center", action.workItem?.id === selectedWorkItemId && "bg-accent/45 ring-1 ring-inset ring-primary/30")}><div><p className="text-card-title font-semibold">{action.department}</p><Badge className="mt-1" variant={action.severity === "high" ? "destructive" : "secondary"}>{action.severity === "high" ? "High" : "Review"}</Badge></div><div><p className="text-body font-semibold">{action.title}</p><p className="mt-0.5 text-meta text-muted-foreground">{action.evidence}</p></div><p className="text-body text-muted-foreground">{action.recommendedAction}</p><InsightActionButton action={action} filters={filters} onUpdated={() => setRefreshVersion((current) => current + 1)} /></div>)}{!actions.length && <p className="px-5 py-8 text-center text-body text-muted-foreground">No calculated exceptions in this reporting scope.</p>}</CardContent></Card>
        <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle>Department scorecard</CardTitle><CardDescription>Normalized movement, coverage, learning, mobility, and leave measures.</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-body"><thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Department", "Active", "Movement", "Replacement coverage", "Learning", "Mobility review", "Leave planning"].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead><tbody>{departments.map((row) => <tr key={row.department} className="border-t border-border/70 hover:bg-muted/20"><td className="px-4 py-3"><button type="button" onClick={() => setFilters({ ...filters, department: row.department })} className="font-semibold hover:text-primary hover:underline">{row.department}</button></td><td className="px-4 py-3 tabular-nums">{row.activeEmployees}</td><td className="px-4 py-3"><p className="font-semibold tabular-nums">{row.netMovement > 0 ? "+" : ""}{row.netMovement}</p><p className="text-meta text-muted-foreground">{row.hires} hires · {row.exits} exits</p></td><td className="px-4 py-3"><div className="flex items-center gap-2"><Badge variant={row.coverageStatus === "Gap" ? "destructive" : row.coverageStatus === "Watch" ? "secondary" : "outline"}>{row.coverageStatus}</Badge><span className="tabular-nums">{percent(row.replacementRate)}</span></div><p className="mt-1 text-meta text-muted-foreground">{row.openRequisitions} open · {row.vacancyRate}% vacancy</p></td><td className="px-4 py-3"><p className="tabular-nums">{row.trainingCompletionRate}% complete</p><p className="text-meta text-muted-foreground">{row.mandatoryTrainingGaps} mandatory gaps</p></td><td className="px-4 py-3"><p className="tabular-nums">{row.mobilityReviewCount} employees</p><p className="text-meta text-muted-foreground">{row.mobilityReviewShare}% of active</p></td><td className="px-4 py-3"><p className="tabular-nums">{row.leaveDaysPerActiveEmployee} days / active</p><p className="text-meta text-muted-foreground">{row.pendingLeaveRequests} pending</p></td></tr>)}</tbody></table></div>{!departments.length && <p className="p-10 text-center text-body text-muted-foreground">No departments match the selected reporting scope.</p>}</CardContent></Card>
      </>}

      {analysisView === "impact" && <>
        <MetricStrip metrics={[
          { label: "Recorded exit cost", value: currency(impact.summary.estimatedCostOfRecordedExits), detail: "Scenario estimate for exits in scope" },
          { label: "Average replacement", value: currency(impact.summary.averageReplacementCost), detail: "Per costed exit" },
          { label: "Review-weighted exposure", value: currency(impact.summary.reviewWeightedExposure), detail: "Active model-review cohort" },
          { label: "Continuity reviews", value: impact.summary.rolesNeedingContinuityReview, detail: "Critical or watch roles" },
          { label: "Pay data coverage", value: `${impact.summary.payDataCoverage}%`, detail: "Active employee profiles" },
        ]} />
        <CostAssumptions key={Object.values(impact.assumptions).join("-")} data={data} onApply={(values) => setFilters((current) => ({ ...current, ...values }))} />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><Card className="shadow-none"><CardHeader><CardTitle>Role exposure</CardTitle><CardDescription>Replacement scenario weighted by model-review probability.</CardDescription></CardHeader><CardContent><RoleExposureChart data={data} /></CardContent></Card><EmployeeImpactPanel data={data} /></div>
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
          { label: "Mandatory gaps", value: company.mandatoryTrainingGaps, detail: "Incomplete required learning" },
          { label: "Mobility review", value: data.promotions.withoutPromotionOver36Months, detail: "Tenure and no promotion record" },
          { label: "Recorded promotions", value: data.promotions.total, detail: `${data.promotions.rate}% of active employees` },
          { label: "Course scenario", value: currency(impact.assumptions.courseFeePerLearner), detail: `${impact.assumptions.courseHoursPerLearner} employee hours` },
        ]} />
        <CostAssumptions key={`capability-${Object.values(impact.assumptions).join("-")}`} data={data} onApply={(values) => setFilters((current) => ({ ...current, ...values }))} />
        <LearningEconomics data={data} />
        <Card className="gap-0 overflow-hidden py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle>Capability coverage</CardTitle><CardDescription>Department learning completion and internal-mobility coverage.</CardDescription></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-body"><thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Department", "Active", "Learning", "Mandatory gaps", "Mobility review", "Promotions"].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead><tbody>{departments.map((row) => <tr key={row.department} className="border-t border-border/70"><td className="px-4 py-3 font-semibold">{row.department}</td><td className="px-4 py-3">{row.activeEmployees}</td><td className="px-4 py-3">{row.trainingCompletionRate}% · {row.trainingAssignments} assignments</td><td className="px-4 py-3">{row.mandatoryTrainingGaps}</td><td className="px-4 py-3">{row.mobilityReviewCount} · {row.mobilityReviewShare}%</td><td className="px-4 py-3">{row.promotions} · {row.promotionRate}%</td></tr>)}</tbody></table></div></CardContent></Card>
      </>}
    </WorkspacePage>
  )
}
