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

function renderWorkQueue(plan: ToolPlan, data: Record<string, unknown>): string {
  const page = object(data.page)
  const summary = object(data.summary)
  const home = object(data.home)
  const rows = records(data.items).slice(0, plan.limit)
  const scopeLabels: Record<string, string> = {
    home: "Home priorities",
    people: "People operations linked to the directory",
    person: "Open work linked to this employee",
    inbox: "Inbox",
    hiring: "Talent acquisition",
    leaves: "Leave operations",
    courses: "Learning operations",
    insights: "Workforce exception actions",
    exits: "Employee offboarding",
  }
  const scope = String(page.scope ?? "inbox")
  const selection = String(page.queue ?? "priority")
  const heading = scopeLabels[scope] ?? "Current work queue"
  const summaryLines = [
    `- ${number(summary, "decisions")} actionable decision${number(summary, "decisions") === 1 ? "" : "s"}; ${number(summary, "overdue")} overdue item${number(summary, "overdue") === 1 ? "" : "s"}; ${number(summary, "assignedToMe")} assigned to you.`,
    `- ${number(summary, "managerQueue")} waiting on managers; ${number(summary, "employeeQueue")} waiting on employees.`,
  ]
  if (scope === "home" && Object.keys(home).length) {
    summaryLines.push(`- ${number(home, "activeEmployees")} active employees; ${number(home, "awayToday")} away today; ${number(home, "activeRequisitions")} active requisitions including ${number(home, "offers")} offers.`)
  }
  if (!rows.length) {
    return [
      sourceLine(data),
      `${heading} · ${selection.replaceAll("_", " ")}`,
      ...summaryLines,
      `No work items match the current page and filters.`,
    ].join("\n")
  }
  return [
    sourceLine(data),
    `${heading} · showing ${rows.length} of ${Number(data.matchCount ?? rows.length)} matching items`,
    ...summaryLines,
    "Next actions",
    ...rows.map((row, index) => {
      const due = row.slaStatus === "overdue" ? `overdue since ${String(row.dueDate ?? "an unrecorded date")}` : row.dueDate ? `due ${String(row.dueDate)}` : "no due date"
      const decision = row.requiresDecision ? row.actionable ? "decision available" : "decision pending outside your action scope" : "follow-up"
      const assessment = object(row.priorityAssessment)
      const factors = records(assessment.factors).slice(0, 2).map((factor) => String(factor.label)).join(", ")
      return `${index + 1}. ${String(row.title)} (${String(row.id)}) — ${String(row.domain)} · ${String(assessment.level || row.priority)} ${Number(assessment.score) || 0}/100${factors ? ` (${factors})` : ""} · ${due} · ${decision}. Owner: ${String(row.owner)}. Next: ${String(row.nextAction)} Reason: ${String(row.attentionReason)}`
    }),
    "Open the matching record from this page to complete the action; the assistant has not changed any workflow state.",
  ].join("\n")
}

function renderWorkforce(plan: ToolPlan, data: Record<string, unknown>): string {
  const signals = object(data.operatingSignals)
  if (plan.purpose === "directory_summary") {
    const quality = object(data.directoryQuality)
    return [
      sourceLine(data),
      "People directory",
      `- ${number(quality, "records")} total records; ${number(quality, "activeRecords")} active, on-leave, or pending-start records.`,
      `- ${number(quality, "missingWorkEmail")} active records missing work email; ${number(quality, "missingManager")} missing a manager assignment.`,
      `- ${number(quality, "missingLocation")} missing location; ${number(quality, "missingJobTitle")} missing job title; ${number(quality, "missingDepartment")} missing department.`,
      number(quality, "missingWorkEmail") + number(quality, "missingManager") + number(quality, "missingLocation") + number(quality, "missingJobTitle") + number(quality, "missingDepartment") > 0
        ? "Review incomplete required fields in the directory before relying on role, location, or manager reporting."
        : "The required directory fields in this check are complete.",
    ].join("\n")
  }
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

  if (plan.purpose === "attrition_record_retention_plan") {
    const rows = records(data.joinedEmployeeRecords).slice(0, plan.limit)
    if (!rows.length) return `${sourceLine(data)} The selected cohort is no longer available. Run the risk-record query again before preparing a retention plan.`
    const actionGroups = new Map<string, Array<{ name: string; employeeId: string; signal: string }>>()
    for (const row of rows) {
      const explanation = object(row.modelExplanation)
      const drivers = records(explanation.topDrivers)
      const action = String(explanation.recommendedReview ?? "Conduct a human-reviewed stay interview before taking action.")
      const items = actionGroups.get(action) ?? []
      items.push({
        name: String(row.name),
        employeeId: String(row.employeeId),
        signal: String(drivers[0]?.explanation ?? row.topDriver ?? "Model signal unavailable"),
      })
      actionGroups.set(action, items)
    }
    return [
      sourceLine(data),
      `Retention review plan · ${rows.length} synthetic model-scored profiles`,
      "Immediate priorities",
      ...[...actionGroups.entries()].flatMap(([action, items], index) => [
        `${index + 1}. ${action}`,
        `   Records: ${items.map((item) => `${item.name} (${item.employeeId})`).join(", ")}`,
        `   Leading signals: ${items.map((item) => `${item.employeeId} — ${item.signal}`).join("; ")}`,
      ]),
      "Review cycle",
      "1. Validate that the model inputs are current and assign an HR owner for each review.",
      "2. Hold a confidential stay interview focused on the underlying topic; do not present the score as a prediction.",
      "3. Record the employee's stated concern and choose an intervention only when current evidence supports it.",
      "4. Review the agreed action after 30 days and record whether the concern changed; rescore only with updated, governed inputs.",
      "This plan supports human review. It does not guarantee retention and must not trigger compensation, promotion or employment decisions automatically.",
    ].join("\n")
  }

  if (plan.purpose === "attrition_retention_strategy") {
    const retention = object(data.retentionIntelligence)
    const operational = object(data.operationalRetention)
    const employeeReviews = records(operational.records).slice(0, 5)
    const cohorts = records(retention.cohortAlerts).slice(0, 3)
    const priorities = records(retention.priorities).slice(0, 3)
    const continuity = records(retention.continuity).slice(0, 3)
    const impact = records(retention.impact360)
    return [
      sourceLine(data),
      "Retention operating plan",
      `Reporting control: model cohorts below ${Number(retention.minimumCohortSize)} people are suppressed.`,
      "Priority cohorts",
      ...(cohorts.length ? cohorts.map((row) => `- ${String(row.department)}: ${Number(row.recordedAttritionRate)}% recorded attrition; ${Number(row.aboveThreshold)} of ${Number(row.population)} profiles above the review threshold; ${String(row.replacementStatus).toLowerCase()} replacement coverage.`) : ["- No cohort meets the reporting threshold."]),
      "Actions",
      ...priorities.map((row, index) => `${index + 1}. ${String(row.cohort)} — ${String(row.action)} Owner: ${String(row.owner)}. Measure: ${String(row.measure)}.`),
      ...(employeeReviews.length ? [
        "Current employee review evidence",
        ...employeeReviews.map((row) => {
          const factors = records(row.factors)
          return `- ${String(row.name)} (${String(row.employeeId)}): ${String(row.reviewLevel)} review, ${Number(row.reviewScore)}/100 with ${Number(row.evidenceCoverage)}% evidence coverage. ${factors.slice(0, 2).map((factor) => String(factor.evidence)).join(" ")} Next check: ${String(row.recommendedReview)}`
        }),
      ] : []),
      ...(continuity.some((row) => Number(row.incompleteDevelopment) > 0) ? [
        "Skills and continuity",
        ...continuity.filter((row) => Number(row.incompleteDevelopment) > 0).map((row) => `- ${String(row.department)}: ${Number(row.incompleteDevelopment)} incomplete development assignments; exposed role ${String(row.leadingRole)}; ${Number(row.openRequisitions)} open roles. ${String(row.action)}`),
      ] : []),
      "360-degree checks",
      ...impact.map((row) => `- ${String(row.perspective)}: ${String(row.finding)} (${String(row.value)}). ${String(row.response)}`),
      "Use a 30/60/90-day follow-up and quarterly aggregate model review. Completion and employee feedback are measurable; retained employment is not proof that an intervention caused the outcome.",
    ].join("\n")
  }

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
  if (plan.purpose === "capability_recommendations") {
    const recommendations = records(data.capabilityRecommendations).slice(0, plan.limit)
    if (!recommendations.length) return `${sourceLine(data)} No mapped capability gaps are present. Review job-profile requirements and course-to-skill mappings before asking the assistant to recommend learning.`
    return [
      sourceLine(data),
      "Capability priorities",
      ...recommendations.map((row, index) => `${index + 1}. ${String(row.jobTitle)} · ${String(row.department)} — ${String(row.skillName)}. ${Number(row.employeesNeedingEvidence)} of ${Number(row.activeEmployees)} active employees have no completed mapped course; ${Number(row.openRequisitions)} matching roles are open. Recommended course: ${String(row.courseTitle)}. Priority: ${String(row.priority)}.`),
      "These recommendations use approved internal role requirements and completed learning evidence. They are not external labor-market forecasts. Review relevance with employees before creating a cohort assignment.",
    ].join("\n")
  }
  if (plan.purpose === "retention_mobility_context") {
    const rows = records(data.selectedEmployeePromotionContext).slice(0, plan.limit)
    if (!rows.length) return "Promotion context is unavailable for the selected cohort."
    return [
      "Promotion context for the selected cohort",
      ...rows.map((row) => Number(row.promotionCount) > 0
        ? `- ${String(row.employeeId)}: ${Number(row.promotionCount)} recorded promotion${Number(row.promotionCount) === 1 ? "" : "s"}; latest ${String(row.lastPromotionDate)}.`
        : `- ${String(row.employeeId)}: no recorded promotion.`),
      "Use this only to prepare a career conversation. Promotion history does not establish readiness or entitlement to promotion.",
    ].join("\n")
  }
  if (plan.purpose === "retention_learning_context") {
    const rows = records(data.selectedEmployeeLearningContext).slice(0, plan.limit)
    if (!rows.length) return "No current learning assignments were found for the selected cohort."
    return [
      "Learning context for the selected cohort",
      ...rows.map((row) => `- ${String(row.employeeId)}: ${String(row.program)} — ${String(row.status)}${row.dueDate ? `, due ${String(row.dueDate)}` : ""}.`),
      "Use development records to discuss access and employee goals. Do not assign training solely because of a model score.",
    ].join("\n")
  }
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
  const matchCount = Number(data.matchCount ?? rows.length)
  if (plan.purpose === "employee_count") return `${sourceLine(data)} ${matchCount.toLocaleString()} active employee record${matchCount === 1 ? "" : "s"} match the requested criteria.`
  if (!rows.length) return `${sourceLine(data)} No employee records match the requested criteria.`
  return [sourceLine(data), `${matchCount} employee records match; showing ${rows.length}.`, ...rows.map((row) => `- ${String(row.name)} (${String(row.employeeId)}) — ${String(row.jobTitle)}, ${String(row.department)}, ${String(row.location)}; ${String(row.employmentStatus)}.`), "Only minimum profile fields are shown."].join("\n")
}

function renderOnboardingReadiness(plan: ToolPlan, data: Record<string, unknown>): string {
  const summary = object(data.summary)
  const joiners = records(data.joiners).slice(0, plan.limit)
  const handoff = object(data.recruitingHandoff)
  const offers = records(handoff.offerCandidates).slice(0, Math.min(5, plan.limit))
  return [
    sourceLine(data),
    "Onboarding readiness",
    `- ${number(summary, "preboarding")} people are pending a start; ${number(summary, "awaitingVerification")} await verification and ${number(summary, "missingManager")} are missing a manager.`,
    `- ${number(summary, "openRequisitions")} active requisitions and ${number(summary, "candidatesAtOffer")} offer-stage candidates are in the recruiting handoff.`,
    ...joiners.map((row) => `- ${String(row.name)} (${String(row.employeeId)}) — starts ${String(row.startDate)}; ${String(row.verificationStatus)}. Next: ${String(row.nextAction)}`),
    ...offers.map((row) => `- Offer follow-up: ${String(row.name)} · ${String(row.role)}. ${String(row.nextStep)}${row.dueDate ? ` by ${String(row.dueDate)}` : ""}.`),
  ].join("\n")
}

function renderCapabilityPlan(plan: ToolPlan, data: Record<string, unknown>): string {
  const summary = object(data.summary)
  const recommendations = records(data.recommendations).slice(0, plan.limit)
  if (!recommendations.length) return `${sourceLine(data)} No governed capability recommendation matches this scope. Check job-profile requirements and course mappings before assigning learning.`
  return [
    sourceLine(data),
    `Capability plan · ${number(summary, "eligibleEmployees")} eligible employees`,
    ...recommendations.map((row, index) => `${index + 1}. ${String(row.jobTitle)} · ${String(row.department)} — ${String(row.skillName)}. ${Number(row.employeesNeedingEvidence)} of ${Number(row.activeEmployees)} employees need mapped evidence; ${Number(row.openRequisitions)} matching roles are open. Course: ${String(row.courseTitle)} (${String(row.priority)}).`),
    "Preview the exact cohort and confirm relevance, access, and employee development goals before assignment.",
  ].join("\n")
}

function renderExitAssetOperations(plan: ToolPlan, data: Record<string, unknown>): string {
  const domain = String(data.domain ?? "")
  const summary = object(data.summary)
  if (domain === "assets") {
    const rows = records(data.assets).slice(0, plan.limit)
    return [
      "Asset operations",
      `- ${number(summary, "total")} assets: ${number(summary, "assigned")} assigned, ${number(summary, "available")} available, and ${number(summary, "broken") + number(summary, "lost")} broken or lost.`,
      `- ${number(summary, "replacementDue")} are due for replacement and ${number(summary, "warrantyExpiring")} have a warranty expiring within 90 days.`,
      ...(rows.length ? rows.map((row) => `- ${String(row.assetTag)} · ${String(row.type)} · ${String(row.status)} · ${String(row.lifecycle)}${row.assignedEmployee ? ` · assigned to ${String(row.assignedEmployee)} (${String(row.assignedEmployeeId)})` : ""}.`) : ["- No assets match the current search and filters."]),
    ].join("\n")
  }
  if (domain === "exits") {
    const rows = records(data.exits).slice(0, plan.limit)
    return [
      "Confirmed exit operations",
      `- ${number(summary, "leaving30Days")} exits are scheduled in 30 days; ${number(summary, "leaving60Days")} in 60 days; ${number(summary, "leaving90Days")} in 90 days.`,
      `- ${number(summary, "incompleteOffboarding")} workflows are incomplete, including ${number(summary, "outstandingAssets")} asset returns and ${number(summary, "pendingAccessRemoval")} access-removal tasks.`,
      ...(rows.length ? rows.map((row) => `- ${String(row.employee)} (${String(row.employeeId)}) · ${String(row.expectedExitDate)} · ${String(row.progress)}% complete · ${Number(row.outstandingHrTasks) + Number(row.outstandingItTasks)} tasks open.`) : ["- No confirmed exit workflows match the current search and filters."]),
      "These are confirmed exit workflows, not attrition-model predictions.",
    ].join("\n")
  }
  const rows = records(data.statuses)
  return ["Workforce status", ...rows.map((row) => `- ${String(row.label)}: ${Number(row.value).toLocaleString()}`)].join("\n")
}

export function renderHrEvidence(plan: ToolPlan, data: Record<string, unknown>): string {
  if (plan.name === "review_work_queue") return renderWorkQueue(plan, data)
  if (plan.name === "workforce_overview") return renderWorkforce(plan, data)
  if (plan.name === "analyze_attrition_signals") return renderAttrition(plan, data)
  if (plan.name === "compare_departments") return renderDepartmentComparison(data)
  if (plan.name === "review_people_operations") return renderPeopleOperations(plan, data)
  if (plan.name === "review_onboarding_readiness") return renderOnboardingReadiness(plan, data)
  if (plan.name === "review_capability_plan") return renderCapabilityPlan(plan, data)
  if (plan.name === "review_exit_and_asset_operations") return renderExitAssetOperations(plan, data)
  if (plan.name === "find_employee_records") return renderEmployeeLookup(plan, data)
  return `${sourceLine(data)} The requested analysis completed.`
}
