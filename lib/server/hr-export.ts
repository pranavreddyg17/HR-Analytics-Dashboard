import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib"
import writeXlsxFile, { type Cell, type Sheet, type SheetData } from "write-excel-file/node"

import { importFields, type BreakdownPoint, type HrDomain, type WorkforceAnalytics } from "@/lib/hr-types"

const INK = "#1F1F1F"
const MUTED = "#5F5F5F"
const BORDER = "#D9D9D9"
const HEADER = "#F2F2F2"
const ALERT = "#8A1C1C"
const FONT = "Segoe UI"
const INTERNAL_COLUMNS = new Set(["updated_at", "created_at", "archived_at", "version", "data_source"])

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function rowsToCsv(rows: Array<Record<string, unknown>>, fallbackHeaders: string[] = []): string {
  const headers = rows.length
    ? Object.keys(rows[0]).filter((header) => !INTERNAL_COLUMNS.has(header))
    : fallbackHeaders.filter((header) => !INTERNAL_COLUMNS.has(header))
  if (!headers.length) return ""
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n")
}

function analyticsRows(analytics: WorkforceAnalytics): Record<HrDomain, Array<Record<string, unknown>>> {
  return {
    employees: analytics.employees as unknown as Array<Record<string, unknown>>,
    hiring: analytics.hiring.rows as unknown as Array<Record<string, unknown>>,
    attrition: analytics.attrition.rows as unknown as Array<Record<string, unknown>>,
    leave: analytics.leave.rows as unknown as Array<Record<string, unknown>>,
    training: analytics.training.rows as unknown as Array<Record<string, unknown>>,
    promotions: analytics.promotions.rows as unknown as Array<Record<string, unknown>>,
  }
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()).replace(/\bId\b/g, "ID").replace(/\bHr\b/g, "HR")
}

function styleCell(value: string | number | boolean | Date, overrides: Record<string, unknown> = {}): Cell {
  return { value, fontFamily: FONT, fontSize: 10, textColor: INK, alignVertical: "center", ...overrides } as Cell
}

function titleRow(title: string, columns: number): SheetData[number] {
  return [styleCell(title, { columnSpan: columns, fontSize: 16, fontWeight: "bold", height: 30, bottomBorderColor: INK, bottomBorderStyle: "medium" }), ...Array(columns - 1).fill(null)]
}

function sectionRow(title: string, columns: number): SheetData[number] {
  return [styleCell(title, { columnSpan: columns, fontSize: 11, fontWeight: "bold", backgroundColor: HEADER, height: 24, bottomBorderColor: BORDER, bottomBorderStyle: "thin" }), ...Array(columns - 1).fill(null)]
}

function headerRow(headers: string[]): SheetData[number] {
  return headers.map((header) => styleCell(header, { fontWeight: "bold", backgroundColor: HEADER, wrap: true, height: 28, bottomBorderColor: BORDER, bottomBorderStyle: "thin" }))
}

function textCell(value: unknown, overrides: Record<string, unknown> = {}): Cell | null {
  if (value === null || value === undefined || value === "") return null
  return styleCell(String(value), { wrap: true, ...overrides })
}

function numberCell(value: number | null | undefined, format = "#,##0.0", overrides: Record<string, unknown> = {}): Cell | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  return styleCell(value, { type: Number, format, align: "right", ...overrides })
}

function percentCell(value: number | null | undefined, overrides: Record<string, unknown> = {}): Cell | null {
  return value === null || value === undefined ? null : numberCell(value / 100, "0.0%", overrides)
}

function formulaCell(value: string, format = "#,##0.0", overrides: Record<string, unknown> = {}): Cell {
  return styleCell(value, { type: "Formula", format, align: "right", ...overrides })
}

function maybeDate(value: unknown, key: string): Cell | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return numberCell(value, Number.isInteger(value) ? "#,##0" : "#,##0.0")
  if (typeof value === "boolean") return styleCell(value, { type: Boolean })
  if (typeof value === "string" && (key.endsWith("_date") || key.endsWith("_at")) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return styleCell(new Date(`${value.slice(0, 10)}T00:00:00Z`), { type: Date, format: "yyyy-mm-dd", align: "right" })
  }
  if (typeof value === "string" || value instanceof Date) return styleCell(value, { type: value instanceof Date ? Date : String, format: key.endsWith("_id") || key === "id" ? "@" : undefined })
  return textCell(JSON.stringify(value))
}

function rawSheet(rows: Array<Record<string, unknown>>, sheet: string): Sheet<Buffer> {
  if (!rows.length) return { data: [[styleCell("No records")]], sheet, showGridLines: false }
  const headers = Object.keys(rows[0]).filter((header) => !INTERNAL_COLUMNS.has(header))
  const data: SheetData = [
    headerRow(headers.map(humanize)),
    ...rows.map((row) => headers.map((header) => maybeDate(row[header], header))),
  ]
  const columns = headers.map((header) => {
    const longest = Math.max(humanize(header).length, ...rows.slice(0, 100).map((row) => String(row[header] ?? "").length))
    return { width: Math.min(36, Math.max(11, longest + 2)) }
  })
  return { data, sheet, columns, stickyRowsCount: 1, showGridLines: false, zoomScale: 0.9, orientation: columns.length > 9 ? "landscape" : undefined }
}

function flowRows(analytics: WorkforceAnalytics): Array<{ period: string; hires: number; exits: number }> {
  const periods = [...new Set([...analytics.hiring.trend, ...analytics.attrition.trend].map((row) => row.period))].sort()
  const hires = new Map(analytics.hiring.trend.map((row) => [row.period, row.value]))
  const exits = new Map(analytics.attrition.trend.map((row) => [row.period, row.value]))
  return periods.map((period) => ({ period, hires: hires.get(period) ?? 0, exits: exits.get(period) ?? 0 }))
}

function reportingScope(analytics: WorkforceAnalytics): string {
  const range = analytics.filters.from || analytics.filters.to ? `${analytics.filters.from ?? "Start"} to ${analytics.filters.to ?? "Today"}` : "All recorded dates"
  const scope = [analytics.filters.department, analytics.filters.location].filter(Boolean).join(" / ") || "All departments and locations"
  return `${range} | ${scope} | ${humanize(analytics.filters.period)}`
}

function workflowStatus(action: WorkforceAnalytics["decisionSupport"]["actions"][number]): string {
  if (!action.workItem) return "Not started"
  return action.workItem.status === "in_progress" ? "In progress" : action.workItem.status === "completed" ? "Completed" : "Pending"
}

function summarySheet(analytics: WorkforceAnalytics): Sheet<Buffer> {
  const company = analytics.decisionSupport.company
  const impact = analytics.decisionSupport.workforceImpact
  const measures: Array<[string, string | number, string]> = [
    ["Active employees", analytics.kpis.activeEmployees, `${analytics.employeeAnalytics.onLeave} currently on leave`],
    ["Workforce flow", `${analytics.kpis.hires} hires / ${analytics.attrition.totalExits} exits`, `Net movement ${analytics.kpis.hires - analytics.attrition.totalExits >= 0 ? "+" : ""}${analytics.kpis.hires - analytics.attrition.totalExits}`],
    ["Attrition rate", `${analytics.attrition.rate}%`, `${company.voluntaryExitShare}% voluntary exits`],
    ["Open requisitions", analytics.hiring.activeRequisitions, `${analytics.hiring.offers} at offer; ${analytics.hiring.averageTimeToHire} average days to hire`],
    ["Learning completion", `${company.trainingCompletionRate}%`, `${company.mandatoryTrainingGaps} mandatory gaps`],
    ["Mobility review", analytics.promotions.withoutPromotionOver36Months, `${analytics.promotions.total} recorded promotions`],
    ["Recorded exit cost", `$${impact.summary.estimatedCostOfRecordedExits.toLocaleString("en-US")}`, "Scenario estimate using the stated cost assumptions"],
    ["Replacement coverage", company.replacementRate === null ? "Not applicable" : `${company.replacementRate}%`, `${impact.summary.rolesNeedingContinuityReview} roles require continuity review`],
  ]
  const rows: SheetData = [
    titleRow("LaidbackHR.AI workforce decision report", 8),
    [styleCell("Reporting scope", { fontWeight: "bold" }), styleCell(reportingScope(analytics), { columnSpan: 5, textColor: MUTED }), null, null, null, null, styleCell("Generated", { fontWeight: "bold" }), styleCell(new Date(analytics.generatedAt), { type: Date, format: "yyyy-mm-dd hh:mm" })],
    Array(8).fill(null),
    sectionRow("Executive measures", 8),
    headerRow(["Measure", "Value", "Decision context", "", "", "", "", ""]),
    ...measures.map(([metric, value, context]) => [textCell(metric, { fontWeight: "bold" }), typeof value === "number" ? numberCell(value, "#,##0") : textCell(value), styleCell(context, { columnSpan: 6, textColor: MUTED, wrap: true }), null, null, null, null, null]),
    Array(8).fill(null),
    sectionRow("Priority decisions", 8),
    headerRow(["Priority", "Department", "Issue", "Evidence", "Recommended action", "Workflow", "Owner", "Due"]),
    ...analytics.decisionSupport.actions.slice(0, 12).map((action) => [
      textCell(action.severity === "high" ? "High" : "Review", { fontWeight: "bold", textColor: action.severity === "high" ? ALERT : INK }),
      textCell(action.department),
      textCell(action.title, { fontWeight: "bold" }),
      textCell(action.evidence, { textColor: MUTED }),
      textCell(action.recommendedAction),
      textCell(workflowStatus(action)),
      textCell(action.workItem?.ownerEmail ?? "Unassigned"),
      action.workItem?.dueAt ? maybeDate(action.workItem.dueAt, "due_at") : null,
    ]),
  ]
  if (!analytics.decisionSupport.actions.length) rows.push([styleCell("No calculated exceptions in this reporting scope.", { columnSpan: 8, textColor: MUTED }), null, null, null, null, null, null, null])
  rows.push(Array(8).fill(null), sectionRow("Definitions", 8), [styleCell("Attrition rate = recorded exits / (active employees + exits). Replacement rate = completed hires / exits. Vacancy rate = open requisitions / active employees.", { columnSpan: 8, textColor: MUTED, fontSize: 9, wrap: true, height: 28 }), null, null, null, null, null, null, null])
  return { data: rows, sheet: "Executive summary", columns: [{ width: 20 }, { width: 20 }, { width: 27 }, { width: 34 }, { width: 48 }, { width: 16 }, { width: 28 }, { width: 15 }], stickyRowsCount: 2, showGridLines: false, zoomScale: 0.85, orientation: "landscape" }
}

function workforceImpactSheet(analytics: WorkforceAnalytics): Sheet<Buffer> {
  const impact = analytics.decisionSupport.workforceImpact
  const data: SheetData = [
    titleRow("Workforce impact and replacement cost", 17),
    sectionRow("Scenario assumptions", 17),
    headerRow(["Currency", "Recruiting cost", "Vacancy impact", "Ramp days", "Ramp impact", "Course fee", "Course hours", "Pay coverage", "", "", "", "", "", "", "", "", ""]),
    [textCell(impact.assumptions.currency), numberCell(impact.assumptions.recruitingCostPerHire, "$#,##0"), percentCell(impact.assumptions.vacancyProductivityPercent), numberCell(impact.assumptions.onboardingDays, "#,##0"), percentCell(impact.assumptions.onboardingProductivityPercent), numberCell(impact.assumptions.courseFeePerLearner, "$#,##0"), numberCell(impact.assumptions.courseHoursPerLearner, "0.0"), percentCell(impact.summary.payDataCoverage), ...Array(9).fill(null)],
    Array(17).fill(null),
    sectionRow("Role continuity", 17),
    headerRow(["Department", "Role", "Status", "Active", "Exits", "Hires", "Open roles", "Review profiles", "Review share", "Mean model risk", "Refill days", "Refill basis", "Recruiting", "Vacancy", "Ramp", "Replacement / exit", "Pay coverage"]),
  ]
  impact.roles.forEach((row) => data.push([
    textCell(row.department), textCell(row.jobTitle, { fontWeight: "bold" }), textCell(row.continuityStatus, { fontWeight: "bold", textColor: row.continuityStatus === "Critical" ? ALERT : INK }), numberCell(row.activeEmployees, "#,##0"), numberCell(row.recordedExits, "#,##0"), numberCell(row.completedHires, "#,##0"), numberCell(row.openRequisitions, "#,##0"), numberCell(row.reviewProfiles, "#,##0"), percentCell(row.reviewShare), percentCell(row.meanModelRisk), numberCell(row.refillDays, "#,##0"), textCell(row.refillBasis), numberCell(row.directRecruitingCost, "$#,##0"), numberCell(row.vacancyCost, "$#,##0"), numberCell(row.onboardingCost, "$#,##0"), numberCell(row.replacementCostPerExit, "$#,##0"), percentCell(row.payDataCoverage),
  ]))
  return { data, sheet: "Workforce impact", columns: [{ width: 28 }, { width: 34 }, { width: 14 }, ...Array(8).fill({ width: 15 }), { width: 18 }, ...Array(5).fill({ width: 20 })], stickyRowsCount: 7, stickyColumnsCount: 2, showGridLines: false, zoomScale: 0.75, orientation: "landscape" }
}

function learningEconomicsSheet(analytics: WorkforceAnalytics): Sheet<Buffer> {
  const rows = analytics.decisionSupport.workforceImpact.capabilityPlans
  const data: SheetData = [headerRow(["Department", "Active employees", "Employees assigned", "Assignments", "Completed", "Completion rate", "Employees incomplete", "Open assignments", "Required gaps", "Required overdue", "Remaining hours", "Estimated remaining cost", "Leading programme", "Status"])]
  rows.forEach((row) => data.push([textCell(row.department, { fontWeight: "bold" }), numberCell(row.activeEmployees, "#,##0"), numberCell(row.assignedEmployees, "#,##0"), numberCell(row.totalAssignments, "#,##0"), numberCell(row.completedAssignments, "#,##0"), percentCell(row.completionRate), numberCell(row.incompleteEmployees, "#,##0"), numberCell(row.incompleteAssignments, "#,##0"), numberCell(row.mandatoryGaps, "#,##0"), numberCell(row.overdueMandatoryGaps, "#,##0"), numberCell(row.remainingHours, "0.0"), numberCell(row.estimatedRemainingCost, "$#,##0"), textCell(row.leadingProgram), textCell(row.status, { fontWeight: "bold", textColor: row.overdueMandatoryGaps ? ALERT : INK })]))
  return { data, sheet: "Learning follow-up", columns: [{ width: 30 }, ...Array(11).fill({ width: 18 }), { width: 34 }, { width: 22 }], stickyRowsCount: 1, showGridLines: false, zoomScale: 0.75, orientation: "landscape" }
}

function departmentSheet(analytics: WorkforceAnalytics): Sheet<Buffer> {
  const rows = analytics.decisionSupport.departments
  const data: SheetData = [headerRow(["Department", "Active", "Hires", "Exits", "Attrition rate", "Net movement", "Replacement rate", "Open roles", "Vacancy rate", "Coverage", "Learning complete", "Mandatory gaps", "Promotions", "Promotion rate", "Mobility review", "Mobility share", "Approved leave days", "Leave days / active", "Pending leave"])]
  rows.forEach((row, index) => {
    const excelRow = index + 2
    data.push([
      textCell(row.department, { fontWeight: "bold" }), numberCell(row.activeEmployees, "#,##0"), numberCell(row.hires, "#,##0"), numberCell(row.exits, "#,##0"),
      formulaCell(`=IF((B${excelRow}+D${excelRow})=0,0,D${excelRow}/(B${excelRow}+D${excelRow}))`, "0.0%"),
      formulaCell(`=C${excelRow}-D${excelRow}`, "+#,##0;-#,##0;0"),
      formulaCell(`=IF(D${excelRow}=0,\"\",C${excelRow}/D${excelRow})`, "0.0%"),
      numberCell(row.openRequisitions, "#,##0"), formulaCell(`=IF(B${excelRow}=0,0,H${excelRow}/B${excelRow})`, "0.0%"), textCell(row.coverageStatus, { fontWeight: "bold", textColor: row.coverageStatus === "Gap" ? ALERT : INK }),
      percentCell(row.trainingCompletionRate), numberCell(row.mandatoryTrainingGaps, "#,##0"), numberCell(row.promotions, "#,##0"), formulaCell(`=IF(B${excelRow}=0,0,M${excelRow}/B${excelRow})`, "0.0%"),
      numberCell(row.mobilityReviewCount, "#,##0"), formulaCell(`=IF(B${excelRow}=0,0,O${excelRow}/B${excelRow})`, "0.0%"), numberCell(row.approvedLeaveDays, "#,##0.0"), formulaCell(`=IF(B${excelRow}=0,0,Q${excelRow}/B${excelRow})`, "0.0"), numberCell(row.pendingLeaveRequests, "#,##0"),
    ])
  })
  return { data, sheet: "Department scorecard", columns: [{ width: 28 }, ...Array(18).fill({ width: 15 })], stickyRowsCount: 1, stickyColumnsCount: 1, showGridLines: false, zoomScale: 0.8, orientation: "landscape" }
}

function movementSheet(analytics: WorkforceAnalytics): Sheet<Buffer> {
  const rows = flowRows(analytics)
  const data: SheetData = [headerRow(["Period", "Completed hires", "Recorded exits", "Net movement"])]
  rows.forEach((row, index) => data.push([textCell(row.period), numberCell(row.hires, "#,##0"), numberCell(row.exits, "#,##0"), formulaCell(`=B${index + 2}-C${index + 2}`, "+#,##0;-#,##0;0")]))
  return { data, sheet: "Workforce flow", columns: [{ width: 18 }, { width: 20 }, { width: 20 }, { width: 18 }], stickyRowsCount: 1, showGridLines: false, zoomScale: 1 }
}

function retentionSheet(analytics: WorkforceAnalytics): Sheet<Buffer> {
  const exitRows = analytics.attrition.byExitReason
  const tenureRows = analytics.decisionSupport.tenureAttrition
  const managers = analytics.operatingSignals.managerExitConcentration
  const columnCount = 7
  const data: SheetData = [titleRow("Retention diagnostics", columnCount), sectionRow("Recorded exit reasons", columnCount), headerRow(["Exit reason", "Exits", "Share of exits", "", "", "", ""])]
  exitRows.forEach((row, index) => data.push([textCell(row.label), numberCell(row.value, "#,##0"), formulaCell(`=IF(SUM($B$4:$B$${exitRows.length + 3})=0,0,B${index + 4}/SUM($B$4:$B$${exitRows.length + 3}))`, "0.0%"), null, null, null, null]))
  data.push(Array(columnCount).fill(null), sectionRow("Attrition by tenure", columnCount), headerRow(["Tenure cohort", "Active employees", "Exits", "Population", "Attrition rate", "Share of exits", ""]));
  const tenureStart = data.length + 1
  tenureRows.forEach((row, index) => {
    const excelRow = tenureStart + index
    data.push([textCell(row.cohort), numberCell(row.activeEmployees, "#,##0"), numberCell(row.exits, "#,##0"), formulaCell(`=B${excelRow}+C${excelRow}`, "#,##0"), formulaCell(`=IF(D${excelRow}=0,0,C${excelRow}/D${excelRow})`, "0.0%"), percentCell(row.shareOfExits), null])
  })
  data.push(Array(columnCount).fill(null), sectionRow("Manager exit concentration", columnCount), headerRow(["Manager", "Department", "Active team", "Exits", "Voluntary exits", "Share of department exits", "Review use"]));
  managers.forEach((row) => data.push([textCell(row.manager, { fontWeight: "bold" }), textCell(row.department), numberCell(row.activeTeamSize, "#,##0"), numberCell(row.exits, "#,##0"), numberCell(row.voluntaryExits, "#,##0"), percentCell(row.shareOfDepartmentExits), textCell("Cohort signal only - review workload and team conditions", { textColor: MUTED })]))
  return { data, sheet: "Retention diagnostics", columns: [{ width: 28 }, { width: 25 }, { width: 15 }, { width: 15 }, { width: 18 }, { width: 24 }, { width: 46 }], stickyRowsCount: 1, showGridLines: false, zoomScale: 0.9, orientation: "landscape" }
}

function hiringSheet(analytics: WorkforceAnalytics): Sheet<Buffer> {
  const sources = [...analytics.hiring.sourceStats].sort((left, right) => right.hires - left.hires || left.averageDays - right.averageDays)
  const data: SheetData = [titleRow("Hiring effectiveness", 5), sectionRow("Recruiting source performance", 5), headerRow(["Source", "Completed hires", "Share of hires", "Average days to hire", "Decision use"])]
  const end = sources.length + 3
  sources.forEach((row, index) => data.push([textCell(row.label, { fontWeight: "bold" }), numberCell(row.hires, "#,##0"), formulaCell(`=IF(SUM($B$4:$B$${end})=0,0,B${index + 4}/SUM($B$4:$B$${end}))`, "0.0%"), numberCell(row.averageDays, "0.0"), textCell("Compare volume and speed; validate quality of hire separately", { textColor: MUTED })]))
  data.push(Array(5).fill(null), sectionRow("Open requisitions by department", 5), headerRow(["Department", "Open requisitions", "", "", ""]));
  analytics.hiring.pipelineByDepartment.forEach((row) => data.push([textCell(row.label), numberCell(row.value, "#,##0"), null, null, null]))
  return { data, sheet: "Hiring effectiveness", columns: [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 23 }, { width: 52 }], stickyRowsCount: 1, showGridLines: false, zoomScale: 0.95 }
}

function learningMobilitySheet(analytics: WorkforceAnalytics): Sheet<Buffer> {
  const data: SheetData = [headerRow(["Department", "Active employees", "Learning assignments", "Learning completion", "Mandatory gaps", "Promotions", "Promotion rate", "Mobility review", "Mobility share"])]
  analytics.decisionSupport.departments.forEach((row, index) => {
    const excelRow = index + 2
    data.push([textCell(row.department, { fontWeight: "bold" }), numberCell(row.activeEmployees, "#,##0"), numberCell(row.trainingAssignments, "#,##0"), percentCell(row.trainingCompletionRate), numberCell(row.mandatoryTrainingGaps, "#,##0"), numberCell(row.promotions, "#,##0"), formulaCell(`=IF(B${excelRow}=0,0,F${excelRow}/B${excelRow})`, "0.0%"), numberCell(row.mobilityReviewCount, "#,##0"), formulaCell(`=IF(B${excelRow}=0,0,H${excelRow}/B${excelRow})`, "0.0%")])
  })
  return { data, sheet: "Learning and mobility", columns: [{ width: 30 }, { width: 18 }, { width: 21 }, { width: 20 }, { width: 18 }, { width: 15 }, { width: 18 }, { width: 18 }, { width: 18 }], stickyRowsCount: 1, showGridLines: false, zoomScale: 0.9, orientation: "landscape" }
}

function modelReviewSheet(analytics: WorkforceAnalytics): Sheet<Buffer> {
  const headers = ["Employee ID", "Name", "Department", "Job title", "Location", "Employment status", "Risk score", "Risk level", "Leading model contributor", "Job satisfaction", "Environment satisfaction", "Work-life balance", "Years at company", "Observed exit"]
  const data: SheetData = [headerRow(headers), ...analytics.attrition.employeeRecords.map((row) => [
    textCell(row.employeeId), textCell(row.name), textCell(row.department), textCell(row.jobTitle), textCell(row.location), textCell(row.employmentStatus),
    percentCell(row.riskScore), textCell(row.riskLevel), textCell(row.topDriver), numberCell(row.jobSatisfaction, "0"), numberCell(row.environmentSatisfaction, "0"), numberCell(row.workLifeBalance, "0"), numberCell(row.yearsAtCompany, "0.0"), textCell(row.observedAttrition),
  ])]
  return { data, sheet: "Attrition model review", columns: [{ width: 22 }, { width: 24 }, { width: 28 }, { width: 32 }, { width: 20 }, { width: 20 }, { width: 15 }, { width: 14 }, { width: 30 }, { width: 18 }, { width: 23 }, { width: 18 }, { width: 18 }, { width: 16 }], stickyRowsCount: 1, stickyColumnsCount: 2, showGridLines: false, zoomScale: 0.8, orientation: "landscape" }
}

export async function createWorkbook(analytics: WorkforceAnalytics): Promise<Uint8Array> {
  const raw = analyticsRows(analytics)
  const sheets: Sheet<Buffer>[] = [
    summarySheet(analytics),
    departmentSheet(analytics),
    movementSheet(analytics),
    retentionSheet(analytics),
    workforceImpactSheet(analytics),
    hiringSheet(analytics),
    learningMobilitySheet(analytics),
    learningEconomicsSheet(analytics),
    modelReviewSheet(analytics),
    rawSheet(raw.employees, "Employees register"),
    rawSheet(raw.hiring, "Hiring register"),
    rawSheet(raw.attrition, "Exit register"),
    rawSheet(raw.leave, "Leave register"),
    rawSheet(raw.training, "Learning register"),
    rawSheet(raw.promotions, "Promotion register"),
  ]
  const buffer = await writeXlsxFile(sheets, { fontFamily: FONT, fontSize: 10 }).toBuffer()
  return new Uint8Array(buffer)
}

function cleanPdfText(value: unknown): string {
  return String(value ?? "").replace(/[\u2010-\u2015]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7E]/g, " ")
}

function pdfPercent(value: number | null): string {
  return value === null ? "N/A" : `${value.toFixed(1).replace(/\.0$/, "")}%`
}

function pdfMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`
}

function breakdownTotal(rows: BreakdownPoint[]): number {
  return rows.reduce((sum, row) => sum + row.value, 0)
}

export async function createExecutivePdf(analytics: WorkforceAnalytics): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.setTitle("LaidbackHR.AI workforce decision brief")
  document.setAuthor("LaidbackHR.AI")
  document.setSubject("Executive workforce decision support")
  document.setCreator("LaidbackHR.AI reporting service")
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.12, 0.12, 0.12)
  const muted = rgb(0.37, 0.37, 0.37)
  const border = rgb(0.82, 0.82, 0.82)
  const header = rgb(0.95, 0.95, 0.95)
  const pageSizes = { portrait: [612, 792] as [number, number], landscape: [792, 612] as [number, number] }
  const margin = 36
  let page!: PDFPage
  let pageWidth = 0
  let pageHeight = 0
  let y = 0
  let orientation: keyof typeof pageSizes = "portrait"

  const wrap = (value: unknown, font: PDFFont, size: number, maxWidth: number): string[] => {
    const words = cleanPdfText(value).split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let line = ""
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) { lines.push(line); line = word } else line = candidate
    }
    if (line) lines.push(line)
    return lines.length ? lines : [""]
  }

  const addPage = (nextOrientation: keyof typeof pageSizes = orientation) => {
    orientation = nextOrientation
    page = document.addPage(pageSizes[orientation])
    pageWidth = page.getWidth()
    pageHeight = page.getHeight()
    page.drawText("LaidbackHR.AI | Workforce decision brief", { x: margin, y: pageHeight - 24, size: 8, font: bold, color: muted })
    page.drawText(cleanPdfText(reportingScope(analytics)), { x: margin, y: pageHeight - 36, size: 7, font: regular, color: muted })
    page.drawLine({ start: { x: margin, y: pageHeight - 42 }, end: { x: pageWidth - margin, y: pageHeight - 42 }, thickness: 0.6, color: border })
    y = pageHeight - 58
  }

  const ensureSpace = (height: number) => {
    if (y - height < 38) addPage(orientation)
  }

  const heading = (title: string) => {
    ensureSpace(28)
    page.drawText(cleanPdfText(title), { x: margin, y, size: 11, font: bold, color: ink })
    page.drawLine({ start: { x: margin, y: y - 5 }, end: { x: pageWidth - margin, y: y - 5 }, thickness: 0.8, color: ink })
    y -= 20
  }

  const paragraph = (value: string, size = 8, color = muted) => {
    const lines = wrap(value, regular, size, pageWidth - margin * 2)
    ensureSpace(lines.length * (size + 3) + 4)
    for (const line of lines) { page.drawText(line, { x: margin, y, size, font: regular, color }); y -= size + 3 }
    y -= 4
  }

  const table = (headers: string[], rows: string[][], widths: number[], fontSize = 7.2) => {
    const rowPadding = 4
    const drawHeader = () => {
      const height = 18
      page.drawRectangle({ x: margin, y: y - height + 4, width: widths.reduce((sum, width) => sum + width, 0), height, color: header })
      let x = margin
      headers.forEach((value, index) => { page.drawText(cleanPdfText(value), { x: x + rowPadding, y: y - 7, size: 6.8, font: bold, color: ink }); x += widths[index] })
      y -= height
    }
    ensureSpace(30)
    drawHeader()
    for (const row of rows) {
      const cellLines = row.map((value, index) => wrap(value, regular, fontSize, widths[index] - rowPadding * 2))
      const height = Math.max(16, Math.max(...cellLines.map((lines) => lines.length)) * (fontSize + 2) + 7)
      if (y - height < 38) { addPage(orientation); drawHeader() }
      let x = margin
      cellLines.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => page.drawText(line, { x: x + rowPadding, y: y - 8 - lineIndex * (fontSize + 2), size: fontSize, font: regular, color: ink }))
        x += widths[index]
      })
      page.drawLine({ start: { x: margin, y: y - height + 4 }, end: { x: margin + widths.reduce((sum, width) => sum + width, 0), y: y - height + 4 }, thickness: 0.35, color: border })
      y -= height
    }
    y -= 10
  }

  addPage("portrait")
  page.drawText("Workforce decision brief", { x: margin, y, size: 20, font: bold, color: ink })
  y -= 18
  page.drawText(`Generated ${new Date(analytics.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`, { x: margin, y, size: 8, font: regular, color: muted })
  y -= 24

  heading("Executive measures")
  const company = analytics.decisionSupport.company
  const impact = analytics.decisionSupport.workforceImpact
  table(["Measure", "Value", "Decision context"], [
    ["Active employees", analytics.kpis.activeEmployees.toLocaleString(), `${analytics.employeeAnalytics.onLeave} currently on leave`],
    ["Workforce flow", `${analytics.kpis.hires} hires / ${analytics.attrition.totalExits} exits`, `Net movement ${analytics.kpis.hires - analytics.attrition.totalExits >= 0 ? "+" : ""}${analytics.kpis.hires - analytics.attrition.totalExits}`],
    ["Attrition", pdfPercent(analytics.attrition.rate), `${pdfPercent(company.voluntaryExitShare)} of exits voluntary`],
    ["Hiring", `${analytics.hiring.activeRequisitions} open roles`, `${analytics.hiring.offers} at offer; ${analytics.hiring.averageTimeToHire} average days to hire`],
    ["Learning", `${pdfPercent(company.trainingCompletionRate)} complete`, `${company.mandatoryTrainingGaps} mandatory gaps`],
    ["Mobility", `${analytics.promotions.withoutPromotionOver36Months} reviews`, `${analytics.promotions.total} recorded promotions`],
    ["Recorded exit cost", pdfMoney(impact.summary.estimatedCostOfRecordedExits), "Scenario estimate for exits in scope"],
    ["Replacement coverage", pdfPercent(company.replacementRate), `${impact.summary.rolesNeedingContinuityReview} roles require continuity review`],
  ], [128, 104, 308], 8)

  heading("Priority decisions")
  table(["Priority", "Department", "Finding", "Evidence", "Recommended action"], analytics.decisionSupport.actions.slice(0, 8).map((action) => [action.severity === "high" ? "High" : "Review", action.department, action.title, action.evidence, action.recommendedAction]), [48, 82, 98, 135, 177], 6.9)

  addPage("landscape")
  heading("Department scorecard")
  table(["Department", "Active", "Hires", "Exits", "Attr.", "Net", "Repl.", "Open", "Vacancy", "Coverage", "Learning", "Mand. gaps", "Mobility"], analytics.decisionSupport.departments.map((row) => [
    row.department, String(row.activeEmployees), String(row.hires), String(row.exits), pdfPercent(row.attritionRate), `${row.netMovement > 0 ? "+" : ""}${row.netMovement}`, pdfPercent(row.replacementRate), String(row.openRequisitions), pdfPercent(row.vacancyRate), row.coverageStatus, pdfPercent(row.trainingCompletionRate), String(row.mandatoryTrainingGaps), String(row.mobilityReviewCount),
  ]), [120, 44, 38, 38, 48, 42, 55, 42, 50, 62, 58, 55, 68], 6.6)
  paragraph("Use rate-normalized measures for comparison. Leave use is excluded from performance interpretation. Replacement and vacancy measures are capacity-planning indicators.", 7.2)

  heading("Workforce flow")
  table(["Period", "Completed hires", "Recorded exits", "Net movement"], flowRows(analytics).slice(-8).map((row) => [row.period, String(row.hires), String(row.exits), `${row.hires - row.exits > 0 ? "+" : ""}${row.hires - row.exits}`]), [180, 150, 150, 150], 7.5)

  addPage("portrait")
  heading("Retention diagnostics")
  const exitTotal = breakdownTotal(analytics.attrition.byExitReason)
  table(["Exit reason", "Exits", "Share"], analytics.attrition.byExitReason.slice(0, 8).map((row) => [row.label, String(row.value), exitTotal ? pdfPercent(row.value / exitTotal * 100) : "0%"]), [320, 90, 130], 7.5)
  table(["Tenure cohort", "Active", "Exits", "Attrition rate", "Share of exits"], analytics.decisionSupport.tenureAttrition.map((row) => [row.cohort, String(row.activeEmployees), String(row.exits), pdfPercent(row.attritionRate), pdfPercent(row.shareOfExits)]), [160, 80, 70, 110, 120], 7.5)

  heading("Hiring source effectiveness")
  const sourceTotal = analytics.hiring.sourceStats.reduce((sum, row) => sum + row.hires, 0)
  table(["Source", "Hires", "Share", "Avg. days to hire"], [...analytics.hiring.sourceStats].sort((left, right) => right.hires - left.hires).map((row) => [row.label, String(row.hires), sourceTotal ? pdfPercent(row.hires / sourceTotal * 100) : "0%", row.averageDays.toFixed(1)]), [260, 70, 90, 120], 7.5)

  heading("Manager exit concentration")
  table(["Manager", "Department", "Active team", "Exits", "Share of department exits"], analytics.operatingSignals.managerExitConcentration.slice(0, 8).map((row) => [row.manager, row.department, String(row.activeTeamSize), String(row.exits), pdfPercent(row.shareOfDepartmentExits)]), [170, 140, 75, 55, 100], 7)
  paragraph("Manager concentration is a cohort signal for reviewing workload, role clarity, and team conditions. It is not a manager performance rating. Attrition model outputs are review signals and are not automatic employment decisions.", 7.2)

  addPage("landscape")
  heading("Workforce impact and replacement cost")
  table(["Role", "Department", "Status", "Active", "Exits", "Hires", "Open", "Refill", "Cost / exit", "Pay coverage"], impact.roles.slice(0, 12).map((row) => [row.jobTitle, row.department, row.continuityStatus, String(row.activeEmployees), String(row.recordedExits), String(row.completedHires), String(row.openRequisitions), `${row.refillDays} days`, pdfMoney(row.replacementCostPerExit), pdfPercent(row.payDataCoverage)]), [115, 112, 48, 38, 36, 36, 36, 55, 72, 78], 6.6)

  heading("Learning follow-up")
  table(["Department", "Completion", "Open assignments", "Required", "Overdue", "Remaining hours", "Estimated cost", "Status"], impact.capabilityPlans.map((row) => [row.department, pdfPercent(row.completionRate), String(row.incompleteAssignments), String(row.mandatoryGaps), String(row.overdueMandatoryGaps), row.remainingHours.toFixed(1), pdfMoney(row.estimatedRemainingCost), row.status]), [120, 70, 78, 58, 58, 78, 88, 110], 7)
  paragraph(`Learning estimate: ${pdfMoney(impact.assumptions.courseFeePerLearner)} per open assignment plus employee time using recorded hours, or ${impact.assumptions.courseHoursPerLearner} fallback hours when hours are missing. Pay coverage: ${pdfPercent(impact.summary.payDataCoverage)}.`, 7.2)

  const pages = document.getPages()
  pages.forEach((reportPage, index) => {
    reportPage.drawLine({ start: { x: margin, y: 27 }, end: { x: reportPage.getWidth() - margin, y: 27 }, thickness: 0.4, color: border })
    reportPage.drawText(`Page ${index + 1} of ${pages.length}`, { x: reportPage.getWidth() - margin - 50, y: 15, size: 7, font: regular, color: muted })
  })
  return document.save()
}

function getAnalyticsDomainRows(analytics: WorkforceAnalytics, domain: HrDomain): Array<Record<string, unknown>> {
  return analyticsRows(analytics)[domain]
}

export function analyticsDomainToCsv(analytics: WorkforceAnalytics, domain: HrDomain): string {
  return rowsToCsv(getAnalyticsDomainRows(analytics, domain), importFields[domain])
}
