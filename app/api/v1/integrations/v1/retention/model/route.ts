import { getModelMetadata, getPredictionSchema } from "@/lib/server/runtime"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "retention:read")
    const response = integrationResponse(principal, {
      metadata: getModelMetadata(),
      inputSchema: getPredictionSchema(),
      intendedUse: "Explainable workforce review scenarios and historical model validation",
      prohibitedUses: ["Automated employment decisions", "Predicting resignation timing", "Inferring protected characteristics"],
    })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(error, request, principal) }
}
