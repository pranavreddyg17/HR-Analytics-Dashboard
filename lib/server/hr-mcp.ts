import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"

const filtersShape = {
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date in YYYY-MM-DD format"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date in YYYY-MM-DD format"),
  department: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  period: z.enum(["month", "quarter", "year"]).optional(),
}

type FilterArgs = {
  from?: string
  to?: string
  department?: string
  jobTitle?: string
  location?: string
  period?: "month" | "quarter" | "year"
}

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] }
}

export const mcpToolCatalog = [
  { name: "executive_summary", description: "Company-wide HR KPIs and evidence-backed executive insights" },
  { name: "analyze_hiring", description: "Hiring volume, time-to-hire, sources, departments, roles, and trends" },
  { name: "analyze_attrition", description: "Exit rates, types, departments, tenure, trends, and high-risk review candidates" },
  { name: "analyze_leave", description: "Approved and pending leave, days, types, departments, and trends" },
  { name: "analyze_training", description: "Completion, hours, scores, mandatory gaps, programmes, and trends" },
  { name: "analyze_promotions", description: "Promotion rate, time-to-promotion, departments, trends, and stalled progression" },
  { name: "employee_drilldown", description: "Employee-level operational records across HR domains" },
  { name: "data_quality", description: "Import status, data mode, row counts, and detected coverage gaps" },
] as const

export function createHrMcpServer(): McpServer {
  const server = new McpServer({ name: "LaidbackHR.AI Workforce Intelligence", version: "2.0.0" }, { capabilities: { tools: {}, resources: {} } })

  server.registerTool("executive_summary", {
    title: "Executive HR summary",
    description: mcpToolCatalog[0].description,
    inputSchema: filtersShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (filters: FilterArgs) => {
    const analytics = await getWorkforceAnalytics(filters)
    return result({ generatedAt: analytics.generatedAt, kpis: analytics.kpis, insights: analytics.executiveInsights, dataStatus: analytics.status })
  })

  server.registerTool("analyze_hiring", {
    title: "Analyze hiring",
    description: mcpToolCatalog[1].description,
    inputSchema: filtersShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (filters: FilterArgs) => {
    const analytics = await getWorkforceAnalytics(filters)
    return result({ filters: analytics.filters, ...analytics.hiring })
  })

  server.registerTool("analyze_attrition", {
    title: "Analyze attrition",
    description: mcpToolCatalog[2].description,
    inputSchema: filtersShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (filters: FilterArgs) => {
    const analytics = await getWorkforceAnalytics(filters)
    return result({ filters: analytics.filters, ...analytics.attrition })
  })

  server.registerTool("analyze_leave", {
    title: "Analyze leave",
    description: mcpToolCatalog[3].description,
    inputSchema: filtersShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (filters: FilterArgs) => {
    const analytics = await getWorkforceAnalytics(filters)
    return result({ filters: analytics.filters, ...analytics.leave })
  })

  server.registerTool("analyze_training", {
    title: "Analyze training",
    description: mcpToolCatalog[4].description,
    inputSchema: filtersShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (filters: FilterArgs) => {
    const analytics = await getWorkforceAnalytics(filters)
    return result({ filters: analytics.filters, ...analytics.training })
  })

  server.registerTool("analyze_promotions", {
    title: "Analyze promotions",
    description: mcpToolCatalog[5].description,
    inputSchema: filtersShape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (filters: FilterArgs) => {
    const analytics = await getWorkforceAnalytics(filters)
    return result({ filters: analytics.filters, ...analytics.promotions })
  })

  server.registerTool("employee_drilldown", {
    title: "Employee drill-down",
    description: mcpToolCatalog[6].description,
    inputSchema: { employeeId: z.string().min(1), ...filtersShape },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ employeeId, ...filters }: FilterArgs & { employeeId: string }) => {
    const analytics = await getWorkforceAnalytics(filters)
    const employee = analytics.employees.find((record) => record.employee_id.toLowerCase() === employeeId.toLowerCase())
    return result({
      employee: employee ?? null,
      attrition: analytics.attrition.rows.filter((record) => record.employee_id.toLowerCase() === employeeId.toLowerCase()),
      leave: analytics.leave.rows.filter((record) => record.employee_id.toLowerCase() === employeeId.toLowerCase()),
      training: analytics.training.rows.filter((record) => record.employee_id.toLowerCase() === employeeId.toLowerCase()),
      promotions: analytics.promotions.rows.filter((record) => record.employee_id.toLowerCase() === employeeId.toLowerCase()),
      disclaimer: "Use employee-level information only for legitimate HR review and never as the sole basis for an employment decision.",
    })
  })

  server.registerTool("data_quality", {
    title: "Check HR data quality",
    description: mcpToolCatalog[7].description,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    const analytics = await getWorkforceAnalytics()
    const gaps = analytics.status.filter((item) => item.mode === "demo" || item.mode === "empty").map((item) => `${item.domain}: ${item.mode}`)
    return result({ status: analytics.status, gaps, readyForOperationalDecisions: gaps.length === 0, note: gaps.length ? "Import source HR data for each listed domain before treating the results as operational." : "All domains contain imported data." })
  })

  server.registerResource("hr-data-contract", "laidbackhr://data-contract", {
    title: "LaidbackHR.AI HR data contract",
    description: "Domain coverage and AI governance contract",
    mimeType: "application/json",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ domains: ["employees", "hiring", "attrition", "leave", "training", "promotions"], riskGovernance: "Human review required; no automated employment decisions.", toolCount: mcpToolCatalog.length }) }] }))

  return server
}
