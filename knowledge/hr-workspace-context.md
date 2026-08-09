# HR workspace context

## Data source modes

Every analytics response must identify its source mode. `demo` means the domain contains presentation data. `imported/operational` means the domain contains records imported or created through an authenticated workflow. `mixed` means the answer combines demo and operational domains or rows. Demo data can illustrate a workflow but must not be represented as company evidence.

## Workforce and headcount

Active headcount includes employee records with an Active employment status. On-leave and preboarding records are reported separately. Department, location, job title, employment type, tenure, and manager span are descriptive dimensions. Counts describe the current database view and do not establish employee performance.

## Onboarding and talent acquisition

Preboarding employees and submitted onboarding profiles are persisted separately from recruiting records. Talent acquisition covers headcount approval, candidates, interviews, offers, and the handoff that creates a preboarding employee. Completed hires use records with a Hired recruitment status. Average time to hire is calculated only from completed hires with a recorded duration. Source performance combines completed-hire volume and average hiring speed; source volume alone is not a quality-of-hire measure.

## Attrition and model risk

Observed attrition is calculated from recorded exit events. Voluntary and involuntary exits must remain separate. The 1,470 IBM model rows are joined by stable ID to clearly labelled synthetic demo employees so that employee, hiring, exit, leave, training, promotion, and model records can be analyzed together. These profiles are not real people, and imported operational employees do not receive IBM model scores. Department differences are associations and do not prove cause. Employee-level action always requires human review and corroborating operational context.

The deployed compact gradient-boosting model can produce local positive contributors for a scored synthetic profile from the ten stored model inputs. Explanations use reference-profile sensitivity: one field is replaced with the validation reference value and the score change is measured. A contributor explains how an input moved that model's score; it is not a causal finding or evidence of the employee's intent. The assistant may pair the leading contributor with a proportionate human-review step, such as a stay interview, role-and-location-adjusted compensation review, workload review, mobility conversation, or flexible-work discussion. It must not estimate intervention impact, replacement cost, retention ROI, or resignation timing without separate validated data and methods.

A retention review converts a selected model cohort into a human-owned plan. It groups employees by the leading review action, checks recorded promotion history in a second read-only evidence pass, and defines a 30-day validate–discuss–act–review cycle. The promotion check is contextual evidence only; it does not determine promotion readiness. The loop is bounded to two tool iterations and cannot execute an employment action.

## Leave

Leave totals and trends are calculated from persisted leave requests. Pending requests are operational work. Approved leave is a capacity and coverage signal, not a performance or commitment signal. Never use leave history as an adverse employment signal.

## Learning and compliance

Training completion is based on persisted assignments. Mandatory gaps are incomplete assignments whose persisted course record is marked mandatory; course-title keywords are not used as a proxy. An incomplete assignment is a follow-up item, not evidence of poor performance without additional context.

Capability recommendations are an internal planning calculation. They join job-profile skill requirements, role headcount, open matching requisitions, course-to-skill mappings, and completed assignments. They do not claim to represent the external labor market unless a governed external skills feed is added. Cohort execution must use preview, explicit confirmation, duplicate suppression, a durable learning campaign, employee Inbox assignments, and completion evidence.

## Promotions and mobility

Promotion rate compares recorded promotions with active headcount. Employees with at least three years of tenure and no recorded promotion are a review cohort, not a conclusion that progression is unfair or stalled. Check career ladders, lateral moves, data completeness, and employee preference before action.

## Operating signals

Manager exit concentration counts recorded exits under the same manager during the selected date range, or the rolling 12 months when no range is selected. It is a prompt to inspect team conditions and exit reasons, not a manager performance score. Replacement coverage compares exits with completed hires and current open requisitions by department. A gap means exits exceed completed hires plus the open pipeline; it is an operational staffing condition, not a prediction or replacement-cost estimate.

## Workflow actions

LaidbackHR.AI may plan a calendar event using active operational employee records with work email addresses, prepare a capability-based learning campaign from approved role and course mappings, submit a position requisition, or create a governed department retention review. Azure OpenAI performs constrained intent classification; PostgreSQL and domain services determine affected records and enforce permissions, duplicate checks, confirmation, and audit history. Every workflow shows the affected cohort or business record and evidence before execution. Synthetic IBM-linked demo profiles cannot receive external invitations. The assistant never approves leave, changes compensation, or makes employment decisions on its own.
