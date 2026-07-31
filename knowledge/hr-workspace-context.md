# HR workspace context

## Data source modes

Every analytics response must identify its source mode. `demo` means the domain contains presentation data. `imported/operational` means the domain contains records imported or created through an authenticated workflow. `mixed` means the answer combines demo and operational domains or rows. Demo data can illustrate a workflow but must not be represented as company evidence.

## Workforce and headcount

Active headcount includes employee records with an Active employment status. On-leave and preboarding records are reported separately. Department, location, job title, employment type, tenure, and manager span are descriptive dimensions. Counts describe the current database view and do not establish employee performance.

## Hiring

Completed hires use records with a Hired recruitment status. Average time to hire is calculated only from completed hires with a recorded duration. Source performance combines completed-hire volume and average hiring speed; source volume alone is not a quality-of-hire measure.

## Attrition and model risk

Observed attrition is calculated from recorded exit events. Voluntary and involuntary exits must remain separate. Historical model scores are validation signals from anonymized training records, not forecasts about live employees. Department differences are associations and do not prove cause. Employee-level action always requires human review and corroborating operational context.

## Leave

Leave totals and trends are calculated from persisted leave requests. Pending requests are operational work. Approved leave is a capacity and coverage signal, not a performance or commitment signal. Never use leave history as an adverse employment signal.

## Learning and compliance

Training completion is based on persisted assignments. Mandatory gaps include incomplete security, privacy, safety, compliance, or phishing programmes. An incomplete assignment is a follow-up item; it is not evidence of poor performance without additional context.

## Promotions and mobility

Promotion rate compares recorded promotions with active headcount. Employees with at least three years of tenure and no recorded promotion are a review cohort, not a conclusion that progression is unfair or stalled. Check career ladders, lateral moves, data completeness, and employee preference before action.

## Workflow actions

LaidbackHR.AI may prepare a calendar event or an employee email draft using operational employee records with work email addresses. The signed-in HR user must review and confirm the action in Google Calendar or Gmail. The assistant never sends messages, schedules meetings, approves leave, or makes employment decisions on its own.
