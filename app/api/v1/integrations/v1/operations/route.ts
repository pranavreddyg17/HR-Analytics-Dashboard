import { getHomeSnapshot } from "@/lib/server/home"
import { getInboxOperations } from "@/lib/server/inbox"
import { listHiringOperations } from "@/lib/server/hiring"
import { listLeaveOperations } from "@/lib/server/leave"
import { listLearningOperations } from "@/lib/server/learning"
import { auditedIntegrationFailure, auditIntegrationRequest, authorizeIntegrationRequest, integrationResponse } from "@/lib/server/integration-api"

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "operations:read")
    const [home, queue, onboarding, leave, learning] = await Promise.all([
      getHomeSnapshot(principal.actor),
      getInboxOperations(principal.actor),
      listHiringOperations(principal.actor),
      listLeaveOperations(principal.actor),
      listLearningOperations(principal.actor),
    ])
    const response = integrationResponse(principal, {
      home,
      workQueue: { summary: queue.summary, items: queue.items.slice(0, 100) },
      onboarding: { summary: onboarding.summary, requisitions: onboarding.requisitions.slice(0, 100), candidates: onboarding.candidates.slice(0, 100) },
      leave: { summary: leave.summary, requests: leave.requests.slice(0, 100) },
      learning: { summary: learning.summary, assignments: learning.assignments.slice(0, 100) },
    })
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) { return auditedIntegrationFailure(error, request, principal) }
}
