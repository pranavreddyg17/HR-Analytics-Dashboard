# HR workspace context

## Data source modes

Every analytics response must identify its source mode. `demo` means the domain contains presentation data. `imported/operational` means the domain contains records imported or created through an authenticated workflow. `mixed` means the answer combines demo and operational domains or rows. Demo data can illustrate a workflow but must not be represented as company evidence.

## Workforce and headcount

Active headcount includes employee records with an Active employment status. On-leave and preboarding records are reported separately. Department, location, job title, employment type, tenure, and manager span are descriptive dimensions. Counts describe the current database view and do not establish employee performance.

## Hiring

Completed hires use records with a Hired recruitment status. Average time to hire is calculated only from completed hires with a recorded duration. Source performance combines completed-hire volume and average hiring speed; source volume alone is not a quality-of-hire measure.

## Attrition and model risk

Observed attrition is calculated from recorded exit events. Voluntary and involuntary exits must remain separate. The 1,470 IBM model rows are joined by stable ID to clearly labelled synthetic demo employees so that employee, hiring, exit, leave, training, promotion, and model records can be analyzed together. These profiles are not real people, and imported operational employees do not receive IBM model scores. Department differences are associations and do not prove cause. Employee-level action always requires human review and corroborating operational context.

The deployed regularized logistic-regression model can produce local positive contributors for a scored synthetic profile from the ten stored model inputs. A contributor explains how an input moved that model's score; it is not a causal finding or evidence of the employee's intent. The assistant may pair the leading contributor with a proportionate human-review step, such as a stay interview, role-and-location-adjusted compensation review, workload review, mobility conversation, or flexible-work discussion. It must not estimate intervention impact, replacement cost, or resignation timing without separate validated data and methods.

## Leave

Leave totals and trends are calculated from persisted leave requests. Pending requests are operational work. Approved leave is a capacity and coverage signal, not a performance or commitment signal. Never use leave history as an adverse employment signal.

## Learning and compliance

Training completion is based on persisted assignments. Mandatory gaps include incomplete security, privacy, safety, compliance, or phishing programmes. An incomplete assignment is a follow-up item; it is not evidence of poor performance without additional context.

## Promotions and mobility

Promotion rate compares recorded promotions with active headcount. Employees with at least three years of tenure and no recorded promotion are a review cohort, not a conclusion that progression is unfair or stalled. Check career ladders, lateral moves, data completeness, and employee preference before action.

## Operating signals

Manager exit concentration counts recorded exits under the same manager during the selected date range, or the rolling 12 months when no range is selected. It is a prompt to inspect team conditions and exit reasons, not a manager performance score. Replacement coverage compares exits with completed hires and current open requisitions by department. A gap means exits exceed completed hires plus the open pipeline; it is an operational staffing condition, not a prediction or replacement-cost estimate.

## Workflow actions

LaidbackHR.AI may plan a calendar event using active operational employee records with work email addresses. The plan resolves named employees or supported cohorts from persisted employee and promotion records, then shows the participants, timing, agenda, and evidence before execution. Only after the signed-in HR user explicitly confirms may the app create the event in that user's Google Calendar and send attendee invitations. Synthetic IBM-linked demo profiles cannot be used as recipients. The assistant never approves leave or makes employment decisions on its own.
