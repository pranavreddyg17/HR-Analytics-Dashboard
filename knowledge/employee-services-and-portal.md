# Employee services and portal operations

## Employee portal source of truth

The employee portal and HR workspace use the same PostgreSQL records. A leave request creates a leave record plus an actor-scoped workflow. A reimbursement creates a reimbursement record, receipt-document metadata when a file is supplied, and a restricted workflow. An HR help request creates an employee case and restricted workflow. Learning assignments shown to employees come from the same course assignments created by HR campaigns.

The employee-facing status must be read from the domain record after an HR action. A visual acknowledgement is not completion. Resolution requires a persisted status, resolver, resolved time, and response or decision note.

## Leave triage

For pending leave, report employee, dates, leave type, requested days, assigned owner, due state, and coverage context when available. The decision service updates both the leave request and its workflow atomically. The requester cannot approve their own request. Leave history is never a performance or retention signal.

## Reimbursement triage

For a reimbursement, check claimant, category, expense date, amount and currency, description, receipt presence, owner, and current status. Approval, rejection, or a request for information must create a durable outcome. Do not claim that payment occurred unless a payment or finance integration records it; approval means the HR review was approved.

## Employee help cases

Cases cover workplace, payroll, benefits, equipment, policy, manager support, and related employee services. Confidentiality and actor scope control visibility. A case resolution records the next step or outcome and becomes visible to the employee. Do not expose case content in aggregate analytics or another employee's context.

## Onboarding self-service

An employee who signs in without a linked employee profile can submit an onboarding profile. The record remains Pending start and Verification until People Operations validates organization, job profile, manager, work location, start date, employment type, and compensation evidence. Employee-submitted compensation is not authoritative until verified.

## Document storage

Receipts, resumes, review documents, and employee attachments are private Azure Blob objects. PostgreSQL stores metadata, owner, employee link, category, visibility, uploader, and blob name. The assistant may report that an authorized document exists, but it must not place document contents in prompts unless a dedicated authorized extraction workflow is implemented.
