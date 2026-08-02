import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import writeXlsxFile, { type SheetData } from "write-excel-file/node"

import type { HrDomain, WorkforceAnalytics } from "@/lib/hr-types"

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return ""
  const headers = Object.keys(rows[0]).filter((header) => header !== "updated_at")
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

function rowsToSheetData(rows: Array<Record<string, unknown>>): SheetData {
  if (!rows.length) return [["No records"]]
  const headers = Object.keys(rows[0]).filter((header) => header !== "updated_at")
  return [
    headers.map((header) => ({ value: header, fontWeight: "bold" as const })),
    ...rows.map((row) => headers.map((header) => {
      const value = row[header]
      if (value === null || value === undefined) return null
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value
      return JSON.stringify(value)
    })),
  ]
}

export async function createWorkbook(analytics: WorkforceAnalytics): Promise<Uint8Array> {
  const summary: SheetData = [
    ["LaidbackHR.AI workforce report", analytics.generatedAt],
    [{ value: "Metric", fontWeight: "bold" }, { value: "Value", fontWeight: "bold" }],
    ["Employees", analytics.kpis.totalEmployees],
    ["Active employees", analytics.kpis.activeEmployees],
    ["Hires", analytics.kpis.hires],
    ["Average time to hire (days)", analytics.kpis.averageTimeToHire],
    ["Attrition rate (%)", analytics.kpis.attritionRate],
    ["Approved leave days", analytics.kpis.leaveDays],
    ["Training completion (%)", analytics.kpis.trainingCompletionRate],
    ["Promotions", analytics.kpis.promotions],
    [],
    ["Executive insights"],
    ...analytics.executiveInsights.map((insight) => [insight]),
  ]
  const sheets = [
    { data: summary, sheet: "Executive summary", stickyRowsCount: 2 },
    ...Object.entries(analyticsRows(analytics)).map(([domain, rows]) => ({
      data: rowsToSheetData(rows),
      sheet: domain.slice(0, 31),
      stickyRowsCount: 1,
    })),
  ]
  const buffer = await writeXlsxFile(sheets, { fontFamily: "Segoe UI", fontSize: 10 }).toBuffer()
  return new Uint8Array(buffer)
}

function wrap(text: string, width = 92): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width) {
      lines.push(line)
      line = word
    } else line = `${line} ${word}`.trim()
  }
  if (line) lines.push(line)
  return lines
}

export async function createExecutivePdf(analytics: WorkforceAnalytics): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([612, 792])
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const teal = rgb(0.15, 0.72, 0.68)
  const muted = rgb(0.35, 0.39, 0.43)
  let y = 746
  page.drawText("LaidbackHR.AI", { x: 48, y, size: 20, font: bold, color: teal })
  y -= 24
  page.drawText("Executive workforce intelligence report", { x: 48, y, size: 15, font: bold })
  y -= 17
  page.drawText(`Generated ${new Date(analytics.generatedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC`, { x: 48, y, size: 8, font: regular, color: muted })
  y -= 32

  const metrics = [
    ["Employees", analytics.kpis.totalEmployees],
    ["Hires", analytics.kpis.hires],
    ["Attrition", `${analytics.kpis.attritionRate}%`],
    ["Leave days", analytics.kpis.leaveDays],
    ["Training complete", `${analytics.kpis.trainingCompletionRate}%`],
    ["Promotions", analytics.kpis.promotions],
  ]
  metrics.forEach(([label, value], index) => {
    const column = index % 3
    const row = Math.floor(index / 3)
    const x = 48 + column * 174
    const metricY = y - row * 54
    page.drawRectangle({ x, y: metricY - 30, width: 156, height: 43, color: rgb(0.94, 0.96, 0.97) })
    page.drawText(String(value), { x: x + 10, y: metricY - 6, size: 16, font: bold })
    page.drawText(String(label), { x: x + 10, y: metricY - 21, size: 8, font: regular, color: muted })
  })
  y -= 126
  page.drawText("Executive insights", { x: 48, y, size: 13, font: bold })
  y -= 22
  for (const insight of analytics.executiveInsights) {
    const lines = wrap(insight)
    page.drawCircle({ x: 53, y: y + 3, size: 2.2, color: teal })
    for (const line of lines) {
      page.drawText(line, { x: 64, y, size: 9.5, font: regular })
      y -= 14
    }
    y -= 8
  }
  y -= 8
  page.drawText("Data status", { x: 48, y, size: 13, font: bold })
  y -= 20
  for (const item of analytics.status) {
    page.drawText(`${item.domain}: ${item.count} rows · ${item.mode.toUpperCase()}`, { x: 48, y, size: 9, font: regular, color: item.mode === "demo" ? rgb(0.72, 0.43, 0.08) : muted })
    y -= 14
  }
  y -= 10
  const disclaimer = "Attrition-risk estimates and AI explanations are decision-support outputs. They require human review and must not be the sole basis for employment decisions."
  for (const line of wrap(disclaimer, 100)) {
    page.drawText(line, { x: 48, y, size: 8, font: regular, color: muted })
    y -= 11
  }
  return document.save()
}

export function getAnalyticsDomainRows(analytics: WorkforceAnalytics, domain: HrDomain): Array<Record<string, unknown>> {
  return analyticsRows(analytics)[domain]
}
