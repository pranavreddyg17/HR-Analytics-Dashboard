# Workspace operating context

## Home and Inbox

Home is a prioritized view of persisted workflow requests. Inbox is the complete actor-scoped queue. Decisions are actionable approval records; exceptions are overdue or high-priority open records. A useful summary reports the owner, due state, and next action from the current workflow row. It must not substitute workforce totals or an employee-directory search for this queue.

## People directory

People is the employee system of record. Directory summaries should describe active records, filters, data completeness, or employee-linked service work. A page label such as “People” is navigation context, not a request to search for employees whose titles contain “People.” Employee-level facts require the employee directory tool; pending onboarding, reimbursement, and employee-service records require the work-queue tool.

## Hiring operations

Hiring combines headcount approvals, active requisitions, candidates, interviews, and offers. A decision or exception summary should use persisted hiring workflow records and identify requisitions awaiting approval, overdue follow-ups, accountable owners, and the next recorded action. Aggregate source performance is appropriate only when the user asks about recruiting volume, speed, or sources.

## Leave operations

Leave decisions come from pending persisted requests. Summaries should identify actionable decisions, overdue requests, manager ownership, and upcoming coverage. Leave is a capacity signal and never a performance signal.

## Learning operations

Learning work comes from persisted course assignments. Exception summaries should identify incomplete mandatory work, overdue assignments, the responsible employee or owner, and the next action. Course completion alone is not a performance or retention conclusion.

## Insights and retention

Insight actions are durable workflow records created from calculated exceptions. The assistant should distinguish the calculation from the assigned follow-up. Attrition review uses observed exits and governed model signals; neither can make an employment decision.

## Retrieval boundary

Azure AI Search contains stable operating definitions and governance guidance. PostgreSQL and MCP tools remain the source of truth for current employees, counts, decisions, workflow status, and dates. Never answer a current operational question from indexed guidance alone.
