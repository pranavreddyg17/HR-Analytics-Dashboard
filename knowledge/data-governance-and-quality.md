# HR data governance and quality guide

## Source-of-truth boundaries

The employee directory is the parent record for employee-linked leave, learning, promotion, compensation, project, review, meeting, case, and reimbursement data. Job profiles normalize department, title, and level. Workflow requests store ownership and completion state but do not replace the underlying domain record.

Imported identifiers must remain stable. Employee-linked imports reject unknown employee IDs. Upserts preserve relationships and update the canonical record. A full refresh archives or replaces only the intended imported scope; it must not silently delete manually managed operational records.

## Required data-quality checks

Check uniqueness of employee ID and work email, valid manager references, reporting cycles, valid dates, supported statuses, non-negative numeric fields, and date ordering. Hiring date cannot precede application date. Leave end date cannot precede start date. Completion and promotion records require a known employee.

Report missing manager, work email, location, job profile, event date, exit reason, and compensation coverage separately. A calculation should name its coverage when missing data can change interpretation.

## Role-based access and privacy

Administrators and HR can manage workspace records according to policy. Managers see their permitted teams and cannot approve their own leave. Employees see their own service, learning, and onboarding records. Viewers receive read-only aggregate or minimum-profile access.

Compensation, employee cases, reimbursement evidence, review notes, meeting notes, and identity documents are restricted. MCP tools return the minimum fields required for the question. Do not place secrets, document contents, or unrestricted personal data in vector search.

## AI and model governance

Azure AI Search contains stable guidance, not live employee facts. Chat prompts retrieve guidance and call authenticated MCP tools for current facts. Tool calls, provider, duration, and run status are audited. Workflow execution requires confirmation and produces a durable domain record.

Attrition model output is decision support only. Keep the historical validation population clearly identified. Do not infer protected traits, causes, resignation timing, or guaranteed outcomes. Monitor performance, threshold behavior, data drift, cohort suppression, and fairness with qualified reviewers.

## Retention and small-cohort controls

Suppress aggregate model cohorts below the configured minimum population. Do not use a small group to infer an individual's status. A high-risk label must not automatically change compensation, promotion, performance management, assignment, scheduling, or employment status.

Retention actions require current evidence, a confidential conversation, employee preference where relevant, a named owner, a due date, and a follow-up measure. Record uncertainty and separate association from cause.

## Export, audit, and deletion

Exports honor the requesting user's role and selected reporting filters. Exported measures use the same backend definitions as the dashboard. Sensitive raw fields require explicit authorization. Audit records retain who changed a record, what changed, when it changed, and the linked workflow or import job.

Archive operational employee records instead of hard-deleting them when history must remain. Conversation deletion removes the user's messages and conversation record. Infrastructure secrets remain in Key Vault and must never be committed, logged, or copied into retrieval content.
