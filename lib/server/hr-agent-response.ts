import type { ToolPlan } from "@/lib/server/hr-agent-intent"

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : []
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function number(data: Record<string, unknown>, key: string): number {
  return typeof data[key] === "number" ? data[key] : 0
}

function mode(data: Record<string, unknown>): string {
  return typeof data.dataMode === "string" ? data.dataMode : "mixed"
}

function sourceLine(data: Record<string, unknown>): string {
  return `Current source: ${mode(data)}.`
}

function renderWorkforce(plan: ToolPlan, data: Record<string, unknown>): string {
  const signals = object(data.operatingSignals)
  if (plan.purpose === "manager_concentration") {
    const rows = records(signals.managerExitConcentration).slice(0, plan.limit)
    if (!rows.length) return `${sourceLine(data)} No manager-level exits are recorded for ${String(signals.windowLabel ?? "the current window").toLowerCase()}.`
    return [
      sourceLine(data),
      `Manager exit concentration · ${String(signals.windowLabel ?? "current window")}`,
      ...rows.map((row, index) => `${index + 1}. ${String(row.manager)} — ${Number(row.exits)} exits (${Number(row.voluntaryExits)} voluntary), ${Number(row.activeTeamSize)} active team members; ${Number(row.shareOfDepartmentExits)}% of ${String(row.department)} exits.`),
      "Use this to prioritize a team-level review. It is an exit-clustering measure, not a manager performance score.",
    ].join("\n")
  }

  if (plan.purpose === "replacement_coverage") {
    const allRows = records(signals.replacementCoverage)
    const gaps = allRows.filter((row) => row.status === "Gap")
    const rows = (gaps.length ? gaps : allRows.filter((row) => row.status === "Watch")).slice(0, plan.limit)
    if (!rows.length) return `${sourceLine(data)} No replacement coverage gaps or watch conditions are recorded for ${String(signals.windowLabel ?? "the current window").toLowerCase()}.`
    return [
      sourceLine(data),
      `${gaps.length ? "Replacement coverage gaps" : "Replacement coverage watch list"} · ${String(signals.windowLabel ?? "current window")}`,
      ...rows.map((row) => `- ${String(row.department)}: ${Number(row.exits)} exits, ${Number(row.hires)} hires, ${Number(row.openRequisitions)} open roles; net movement ${Number(row.netMovement) > 0 ? "+" : ""}${Number(row.netMovement)}; ${Number(row.averageTimeToHire) || "no"} average days to hire.`),
      "A gap means exits exceed completed hires plus the open pipeline. It does not estimate replacement cost.",
    ].join("\n")
  }

  const kpis = object(data.kpis)
  const open = object(data.openWork)
  const workflows = object(data.workflowQueue)
  return [
    sourceLine(data),
    "Workforce summary",
    `- ${number(kpis, "activeEmployees")} active employees; ${number(kpis, "hires")} completed hires; ${number(kpis, "attritionRate")}% recorded attrition.`,
    `- ${number(open, "pendingLeaveRequests")} pending leave requests and ${number(open, "activeHiringRequisitions")} active requisitions.`,
    `- ${number(open, "mandatoryTrainingGaps")} mandatory training gaps and ${number(open, "mobilityReviews")} mobility-review records.`,
    `- ${number(workflows, "openTotal")} persisted workflow requests remain open.`,
    "Review the largest open operational queue first.",
  ].join("\n")
}

function renderAttrition(plan: ToolPlan, data: Record<string, unknown>): string {
  const observed = object(data.observedAttrition)
  const model = object(data.historicalModelReview)
  const distribution = object(model.riskDistribution)

  if (plan.purpose === "attrition_record_explanations") {
    const rows = records(data.joinedEmployeeRecords).slice(0, plan.limit)
    if (!rows.length) return `${sourceLine(data)} No model-scored employee records match the prior selection.`
    const primaryDrivers = rows.map((row) => {
      const explanation = object(row.modelExplanation)
      return records(explanation.topDrivers)[0]
    }).filter(Boolean)
    const driverCounts = new Map<string, number>()
    for (const driver of primaryDrivers) {
      const label = String(driver.label ?? "Other model signal")
      driverCounts.set(label, (driverCounts.get(label) ?? 0) + 1)
    }
    const cohortPatterns = [...driverCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    return [
      sourceLine(data),
      `Why the model flagged these ${rows.length} synthetic profiles`,
      "Cohort pattern",
      ...cohortPatterns.map(([label, count]) => `- ${label}: primary positive contributor for ${count} of ${rows.length} profiles.`),
      "Record-level explanation",
      ...rows.flatMap((row, index) => {
        const explanation = object(row.modelExplanation)
        const drivers = records(explanation.topDrivers).slice(0, 3)
        const recommendedReview = String(explanation.recommendedReview ?? "Conduct a human-reviewed stay interview before taking action.")
        return [
          `${index + 1}. ${String(row.name)} (${String(row.employeeId)}) — ${Number(row.riskScore).toFixed(1)}% ${String(row.riskLevel)} model risk.`,
          `   Model contributors: ${drivers.map((driver) => String(driver.explanation ?? driver.label)).join(" ")}`,
          `   HR review: ${recommendedReview}`,
        ]
      }),
      "These are local model contributions, not proven reasons for an employee to leave. Confirm them through current, consented HR evidence and a human conversation before any action.",
    ].join("\n")
  }

  if (plan.purpose === "attrition_records") {
    const rows = records(data.joinedEmployeeRecords)
    const scope = String(data.recordScope ?? "all")
    const heading = scope === "high_risk" ? "Active synthetic profiles with the highest model risk" : scope === "exited" ? "Synthetic employee profiles with recorded exits" : "Matching synthetic employee profiles"
    if (!rows.length) return `${sourceLine(data)} No employee records match this request.`
    return [
      sourceLine(data),
      `${heading} · showing ${rows.length} of ${Number(data.matchCount ?? rows.length)}`,
      ...rows.map((row, index) => {
        const status = row.exitDate ? `recorded exit ${String(row.exitDate)} · ${String(row.exitType ?? "type unavailable")} · ${String(row.exitReason ?? "reason unavailable")}` : String(row.employmentStatus)
        return `${index + 1}. ${String(row.name)} (${String(row.employeeId)}) — ${String(row.jobTitle)}, ${String(row.department)}; ${Number(row.riskScore).toFixed(1)}% ${String(row.riskLevel)} model risk; ${status}.`
      }),
      "These are labelled synthetic demonstration profiles. The score is a review signal, not a forecast or employment decision.",
    ].join("\n")
  }

  if (plan.purpose === "attrition_drivers") {
    const exitReasons = records(observed.byExitReason).slice(0, 5)
    const drivers = records(model.topRiskDrivers).slice(0, 5)
    const departments = records(model.riskByDepartment).slice(0, 3)
    return [
      sourceLine(data),
      "Observed exit reasons",
      ...(exitReasons.length ? exitReasons.map((row) => `- ${String(row.label)}: ${Number(row.value)} exits`) : ["- No exit reasons are recorded in this view."]),
      "Model-associated signals among active high-risk synthetic profiles",
      ...(drivers.length ? drivers.map((row) => `- ${String(row.label)}: ${Number(row.value)} profiles`) : ["- No high-risk driver cohort is available."]),
      ...(departments.length ? ["Department context", ...departments.map((row) => `- ${String(row.department)}: ${Number(row.highRiskCount)} high-risk profiles; ${Number(row.averageRisk).toFixed(1)}% average model risk across ${Number(row.recordCount)} active profiles.`)] : []),
      "Interpretation: exit reasons are recorded outcomes; model drivers are associations in historical demonstration data. Neither proves why an individual will leave.",
    ].join("\n")
  }

  const observedDepartments = records(observed.byDepartment)
  const riskDepartments = records(model.riskByDepartment)
  return [
    sourceLine(data),
    "Attrition summary",
    `- ${number(observed, "exits")} recorded exits: ${number(observed, "voluntary")} voluntary and ${number(observed, "involuntary")} involuntary; ${number(observed, "rate")}% recorded attrition.`,
    observedDepartments[0] ? `- ${String(observedDepartments[0].label)} has the most recorded exits (${Number(observedDepartments[0].value)}).` : "",
    riskDepartments[0] ? `- ${String(riskDepartments[0].department)} has the highest average demonstration-model risk (${Number(riskDepartments[0].averageRisk).toFixed(1)}%).` : "",
    `- Model distribution: ${number(distribution, "high")} high, ${number(distribution, "medium")} medium and ${number(distribution, "low")} low across ${number(model, "totalScoredRecords")} synthetic validation profiles.`,
    "Observed exits and model risk are different measures; neither establishes cause.",
  ].filter(Boolean).join("\n")
}

function renderDepartmentComparison(data: Record<string, unknown>): string {
  const rows = records(data.departments)
  const definition = String(data.definition ?? "Selected measure")
  if (!rows.length) return `${sourceLine(data)} No department records match this view.`
  return [
    sourceLine(data),
    definition,
    ...rows.map((row, index) => `${index + 1}. ${String(row.department)} — ${Number(row.value).toLocaleString()}`),
    "This is a descriptive comparison and does not establish cause.",
  ].join("\n")
}

function renderPeopleOperations(plan: ToolPlan, data: Record<string, unknown>): string {
  const domain = String(data.domain ?? "")
  const summary = object(data.summary)
  if (domain === "hiring") {
    const sources = records(data.sourcePerformance).slice(0, plan.limit)
    return [sourceLine(data), `Hiring: ${number(summary, "completedHires")} completed hires, ${number(summary, "activeRequisitions")} active requisitions, ${number(summary, "offers")} offers and ${number(summary, "averageTimeToHireDays")} average days to hire.`, ...sources.map((row) => `- ${String(row.label)}: ${Number(row.hires)} hires, ${Number(row.averageDays)} average days.`), "Recruiting volume and speed do not measure quality of hire."].join("\n")
  }
  if (domain === "leave") {
    const types = records(data.byType).slice(0, plan.limit)
    return [sourceLine(data), `Leave: ${number(summary, "pending")} pending, ${number(summary, "approved")} approved and ${number(summary, "rejected")} rejected requests; ${number(summary, "approvedDays")} approved days.`, ...types.map((row) => `- ${String(row.label)}: ${Number(row.value)} approved days`), "Use leave data for capacity planning, never as a performance signal."].join("\n")
  }
  if (domain === "training") {
    const gaps = records(data.incompleteMandatoryAssignments).slice(0, plan.limit)
    return [sourceLine(data), `Training: ${number(summary, "completionRate")}% complete; ${number(summary, "mandatoryGaps")} mandatory assignments require follow-up.`, ...gaps.map((row) => `- ${String(row.program)} — ${String(row.employeeId)}${row.dueDate ? `, due ${String(row.dueDate)}` : ""}`)].join("\n")
  }
  const mobility = records(data.mobilityReview).slice(0, plan.limit)
  return [
    sourceLine(data),
    `Mobility review: ${number(summary, "mobilityReviewCount")} active employees meet the three-year tenure and no-recorded-promotion definition.`,
    ...mobility.map((row) => `- ${String(row.name)} (${String(row.employeeId)}) — ${String(row.jobTitle)}, ${String(row.department)}, ${Number(row.tenureYears)} years tenure.`),
    "This is a career-review cohort, not a recommendation to promote. Confirm role level, performance evidence, lateral moves, employee preference and data completeness.",
  ].join("\n")
}

function renderEmployeeLookup(plan: ToolPlan, data: Record<string, unknown>): string {
  const rows = records(data.employees).slice(0, plan.limit)
  if (!rows.length) return `${sourceLine(data)} No employee records match the requested criteria.`
  return [sourceLine(data), `${Number(data.matchCount ?? rows.length)} employee records match; showing ${rows.length}.`, ...rows.map((row) => `- ${String(row.name)} (${String(row.employeeId)}) — ${String(row.jobTitle)}, ${String(row.department)}, ${String(row.location)}; ${String(row.employmentStatus)}.`), "Only minimum profile fields are shown."].join("\n")
}

export function renderHrEvidence(plan: ToolPlan, data: Record<string, unknown>): string {
  if (plan.name === "workforce_overview") return renderWorkforce(plan, data)
  if (plan.name === "analyze_attrition_signals") return renderAttrition(plan, data)
  if (plan.name === "compare_departments") return renderDepartmentComparison(data)
  if (plan.name === "review_people_operations") return renderPeopleOperations(plan, data)
  if (plan.name === "find_employee_records") return renderEmployeeLookup(plan, data)
  return `${sourceLine(data)} The requested analysis completed.`
}
