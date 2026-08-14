import {
  auditedIntegrationFailure,
  auditIntegrationRequest,
  authorizeIntegrationRequest,
  integrationResponse,
} from "@/lib/server/integration-api"

const catalog = {
  workflowTypes: [
    { type: "learning_assignment", purpose: "Assign an existing course to a validated department, role, level, manager team, or job profile cohort.", execution: "Creates persisted employee assignments after confirmation." },
    { type: "hiring_requisition", purpose: "Prepare a position request from persisted departments and locations.", execution: "Creates a requisition awaiting the normal HR decision workflow." },
    { type: "retention_review", purpose: "Prepare a governed department retention review from current cohort evidence.", execution: "Creates or returns the durable review; it never changes employment status." },
    { type: "calendar_invite", purpose: "Prepare a named-employee or bounded-cohort meeting.", execution: "Requires an interactive user with a delegated Google Calendar or Microsoft Teams grant." },
    { type: "employee_email", purpose: "Prepare a reviewed employee communication draft.", execution: "External service clients cannot send the message automatically." },
  ],
  controls: {
    planDoesNotPersist: true,
    createProducesDraft: true,
    executeRequiresConfirmation: true,
    executeRequiresIdempotencyKey: true,
    automatedEmploymentDecisions: false,
    directApprovalActions: false,
    serviceCalendarExecution: false,
  },
}

export async function GET(request: Request) {
  let principal
  try {
    principal = await authorizeIntegrationRequest(request, "workflows:read")
    const response = integrationResponse(principal, catalog)
    await auditIntegrationRequest(principal, request, response.status)
    return response
  } catch (error) {
    return auditedIntegrationFailure(error, request, principal)
  }
}
