# Employee lifecycle operating playbooks

## New-joiner onboarding

Onboarding starts after an employee profile is created with Preboarding status. The minimum readiness record includes legal or preferred name, work email, department, job profile, location, employment type, start date, and reporting manager. Employee-submitted organization and compensation details remain pending until People Operations verifies them.

The readiness sequence is: verify submitted details, resolve missing manager or job profile, confirm start date, activate the employee, and record the verification event. Rejection requires a clear correction reason. Approval updates the employee status, onboarding state, compensation record, workflow status, and audit activity in one domain operation.

## Talent acquisition handoff

A position request requires a role, department, location, employment type, business justification, requester, owner, and due date. Requested requisitions require an HR decision. Approved requisitions move to Open. Candidate records belong to a requisition and progress through Applied, Screening, Interview, Offer, Hired, Rejected, or Withdrawn with a stored next step.

Before opening duplicate headcount, check active requisitions for the same role, department, and location. Candidate stage changes must create activity history. An offer follow-up is not complete until the response and next step are recorded. A hired candidate should reconcile with the new-joiner onboarding register.

## Leave request and decision

A leave request requires an employee, leave type, start date, end date, calculated leave days, and optional note. It creates a leave record and a workflow assigned to the manager or People Operations. The requester cannot approve their own leave. Managers can decide only for direct reports; HR and administrators can act within their workspace scope.

Approval or rejection updates both the leave record and workflow, records the resolver and note, and changes employee-facing status. Coverage review should consider overlapping approved leave and role coverage. Do not use leave history as a performance or attrition treatment.

## Learning assignment and completion

Learning can be assigned to an employee, department, job title, job level, manager team, or normalized job profile. A cohort assignment first resolves the eligible employee IDs, suppresses duplicate open assignments, creates a campaign, creates individual assignments and Inbox work, and records the assignee, due date, hours, and rationale.

Completion requires the persisted assignment status, completion date, and optional assessment score or note. Mandatory work is identified by the course record. A capability recommendation should be reviewed for relevance and access before assignment; a risk score alone must never trigger training.

## Career mobility and promotion review

Mobility review begins with an evidence cohort, not a promotion decision. Review current role, job level, tenure, recorded promotions, performance-cycle evidence, employee preference, available internal roles, development commitments, and manager input. A lateral move or expanded role can be relevant even when no promotion is recorded.

Create an accountable follow-up only after the employee's goals are known. Record the owner, agreed action, due date, and check-in. Promotion decisions remain governed compensation and talent decisions outside automated analytics.

## Retention review

Retention work uses privacy-thresholded cohorts before individual review. Start with observed exits, exit reasons, workforce continuity, manager support, mobility, learning access, workload evidence, and model-review concentration. Separate recorded outcomes from model associations.

The operating sequence is detect, validate, act, follow up, and learn. Validate through current records and a confidential human conversation. Select one evidence-matched action with an owner and success measure. Follow up at 30, 60, and 90 days. Evaluate aggregate reach, completion, feedback, fairness, and model drift each quarter.

## Employee services and reimbursements

An employee service request or reimbursement must create a restricted workflow linked to the employee. Required fields include request type, description or expense evidence, owner, status, submitted time, and resolution. Sensitive case and compensation information is visible only to authorized roles.

Resolution requires a durable status change and response. Uploads belong in private employee-document storage and are referenced by metadata; files must not be placed in public application assets or embedded in chat context.

## One-to-one and review follow-up

A one-to-one record stores the participants, scheduled or held time, status, employee notes, manager notes, and agreed follow-up. An AI-generated summary is a draft until a human approves it. Follow-up email or calendar preparation requires explicit review and confirmation.

Performance review analytics should use completed review-cycle evidence and distinguish missing submissions from low ratings. Employee and manager ratings are separate perspectives. The assistant must not infer performance from leave, learning completion, or attrition risk.
