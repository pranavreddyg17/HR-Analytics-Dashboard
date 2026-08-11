# Actor scope and approval model

## HR workspace roles

Administrators can manage workspace access and act across HR operations. HR users can operate employee lifecycle workflows without administering platform access. Managers are limited to supported team or assignment scope. Viewers can read permitted analytics but cannot execute employee workflows. Employee accounts use the employee portal and cannot access HR-wide records.

Role permission never overrides confidentiality. Compensation, reimbursements, employee cases, review notes, and documents require the applicable service-level access check.

## Work ownership

A work item has one persisted owner, assignment scope, due state, priority, next action, and completion record. “Assigned to me” means the authenticated actor can act or is the stored owner. “Awaiting my decision” requires both a decision-capable workflow and actor authorization. Overdue is calculated from the stored due date only while the item remains open.

## Decisions and completion

Approving or declining leave updates the leave record and workflow together. Resolving an employee case records the resolution note and resolver. Reviewing onboarding verifies or rejects the submitted profile and updates the employee-facing state. Hiring actions update requisition or candidate activity. Learning completion updates the assignment and employee queue.

The assistant may summarize or prepare supported workflows. It may not infer approval from a message, click through a destructive action, or bypass the confirmation implemented by the domain service.

## Audit expectations

Every material operation records actor, target, prior state when relevant, new state, timestamp, and an operation-specific note. An AI run additionally records selected tools, inputs, duration, status, and provider. A generated answer is not an operation outcome unless the corresponding domain record changed successfully.
