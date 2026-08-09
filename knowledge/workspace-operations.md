# Workspace operating context

## Home and Inbox

Home is a prioritized view of persisted workflow requests. Inbox is the complete actor-scoped queue. Decisions are actionable approval records; exceptions are overdue or high-priority open records. A useful summary reports the owner, due state, and next action from the current workflow row. It must not substitute workforce totals or an employee-directory search for this queue.

## People directory

People is the employee system of record. Directory summaries should describe active records, filters, data completeness, or employee-linked service work. A page label such as “People” is navigation context, not a request to search for employees whose titles contain “People.” Employee-level facts require the employee directory tool; pending onboarding, reimbursement, and employee-service records require the work-queue tool.

## Onboarding and talent acquisition

Onboarding is the employee-lifecycle workspace. New joiners are persisted preboarding employees, and submitted employment profiles are verified through actor-scoped workflow records. Talent acquisition is a stage inside the workspace and retains separate requisition, candidate, interview, offer, and hiring records. A decision or exception summary should identify new-joiner verification work as well as recruiting approvals and overdue follow-ups. Aggregate source performance is appropriate only when the user asks about recruiting volume, speed, or sources.

## Leave operations

Leave decisions come from pending persisted requests. Summaries should identify actionable decisions, overdue requests, manager ownership, and upcoming coverage. Leave is a capacity signal and never a performance signal.

## Learning operations

Learning work comes from persisted course assignments. Exception summaries should identify incomplete mandatory work, overdue assignments, the responsible employee or owner, and the next action. Course completion alone is not a performance or retention conclusion.

Capability recommendations are calculated from approved job-profile requirements, active employees in the role, current matching requisitions, completed course-to-skill evidence, and the active course catalog. They describe internal workforce demand, not external market demand. A recommendation may prepare a role cohort and course assignment, but it must be reviewed before the existing learning campaign service creates assignments.

The workflow agent uses Azure OpenAI only to classify a request into an allowed workflow. It then resolves people, courses, job profiles, departments, locations, retention cohorts, and duplicate records from PostgreSQL. Calendar invitations, cohort learning assignments, position requisitions, and governed retention reviews require a visible preview and explicit confirmation before the audited domain service runs.

## Insights and retention

Insight actions are durable workflow records created from calculated exceptions. The assistant should distinguish the calculation from the assigned follow-up. Attrition review uses observed exits and governed model signals; neither can make an employment decision.

## Retrieval boundary

Azure AI Search contains stable operating definitions and governance guidance. PostgreSQL and MCP tools remain the source of truth for current employees, counts, decisions, workflow status, and dates. Never answer a current operational question from indexed guidance alone.
