# Workspace operating context

## Home and Inbox

Home is a prioritized view of persisted workflow requests. Inbox is the complete actor-scoped queue. Decisions are actionable approval records; exceptions are overdue or priority open records. The work-priority policy assigns P1 through P4 from recorded due state, time in status, workflow blocking, controlled business impact, affected population, and domain context. It never uses protected characteristics or requester seniority, and location alone never changes priority. Each score returns its contributing factors and orders review only; it never approves or rejects work. A useful summary reports the priority score, leading factors, owner, due state, and next action from the current workflow row.

## People directory

People is the employee system of record. Directory summaries should describe active records, filters, data completeness, or employee-linked service work. A page label such as “People” is navigation context, not a request to search for employees whose titles contain “People.” Employee-level facts require the employee directory tool; pending onboarding, reimbursement, and employee-service records require the work-queue tool.

## Onboarding and talent acquisition

Onboarding is the employee-lifecycle workspace. Accepted hires are persisted as pending-start employees, and submitted employment profiles are verified through actor-scoped workflow records. Talent acquisition is a stage inside the workspace and retains linked requisition, candidate, interview, offer, and hiring records. Moving a candidate to Hired creates the pending-start employee, fills the requisition, and closes competing active candidates in one transaction.

## Leave operations

Leave decisions come from pending persisted requests. Summaries should identify actionable decisions, overdue requests, manager ownership, and upcoming coverage. Leave is a capacity signal and never a performance signal.

## Learning operations

Learning work comes from persisted course assignments. Exception summaries should identify incomplete mandatory work, overdue assignments, the responsible employee or owner, and the next action. Course completion alone is not a performance or retention conclusion.

Capability recommendations are calculated from approved job-profile requirements, active employees in the role, current matching requisitions, completed course-to-skill evidence, and the active course catalog. They describe internal workforce demand, not external market demand. A recommendation may prepare a role cohort and course assignment, but it must be reviewed before the existing learning campaign service creates assignments.

The workflow agent uses Azure OpenAI only to classify a request into an allowed workflow. It then resolves people, courses, job profiles, departments, locations, retention cohorts, and duplicate records from PostgreSQL. Calendar invitations, cohort learning assignments, position requisitions, and governed retention reviews require a visible preview and explicit confirmation before the audited domain service runs.

## Insights and retention

Insight actions are durable workflow records created from calculated exceptions. The assistant should distinguish the calculation from the assigned follow-up. Retention has three separate evidence layers: recorded exits, current operational review signals, and the historical IBM model benchmark. Operational review signals use available pay-position, role-tenure, completed performance-review, staffing, active-project, and manager-check-in records. They produce a review-priority score, not a resignation probability. Leave usage, protected characteristics, education, prior-employer count, and the historical probability are excluded from the operational score.

## Retrieval boundary

Azure AI Search contains stable operating definitions and governance guidance. PostgreSQL and MCP tools remain the source of truth for current employees, counts, decisions, workflow status, and dates. Never answer a current operational question from indexed guidance alone.
