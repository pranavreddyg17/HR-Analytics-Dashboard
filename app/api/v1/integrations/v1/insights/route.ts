import { filtersFromSearchParams, getWorkforceDashboardAnalytics } from "@/lib/server/hr-analytics"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, IntegrationApiError, integrationResponse } from "@/lib/server/integration-api"

const views = ["overview", "workforce-impact", "talent-supply", "capability"] as const
type InsightView = typeof views[number]

function selectView(analytics: Awaited<ReturnType<typeof getWorkforceDashboardAnalytics>>, view: InsightView) {
  if (view === "overview") return {
    calculationBasis: analytics.calculationBasis,
    status: analytics.status,
    kpis: analytics.kpis,
    company: analytics.decisionSupport.company,
    departments: analytics.decisionSupport.departments,
    actions: analytics.decisionSupport.actions,
    executiveInsights: analytics.executiveInsights,
  }
  if (view === "workforce-impact") return {
    calculationBasis: analytics.calculationBasis,
    company: analytics.decisionSupport.company,
    workforceImpact: analytics.decisionSupport.workforceImpact,
    replacementCoverage: analytics.operatingSignals.replacementCoverage,
  }
  if (view === "talent-supply") return {
    calculationBasis: analytics.calculationBasis,
    hiring: analytics.hiring,
    attrition: analytics.attrition,
    tenureAttrition: analytics.decisionSupport.tenureAttrition,
    promotions: analytics.promotions,
  }
  return {
    calculationBasis: analytics.calculationBasis,
    training: analytics.training,
    promotions: analytics.promotions,
    departments: analytics.decisionSupport.departments,
    capabilityPlans: analytics.decisionSupport.workforceImpact.capabilityPlans,
  }
}

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "analytics:read")
    const url = new URL(request.url)
    const view = (url.searchParams.get("view") ?? "overview") as InsightView
    if (!views.includes(view)) throw new IntegrationApiError(`view must be one of: ${views.join(", ")}`, 422)
    const analytics = await getWorkforceDashboardAnalytics(filtersFromSearchParams(url.searchParams))
    const response = integrationResponse(principal, { view, ...selectView(analytics, view) })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(error, request, principal) }
}
