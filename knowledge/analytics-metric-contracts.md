# Workforce analytics metric contracts

## Reporting time model

Headcount, employees on leave today, open requisitions, and open workflow counts are current-state snapshots. Hires, exits, approved leave, completed learning, promotions, and time-to-hire are event measures constrained by the selected date range. A current snapshot must not be described as activity during the reporting range.

When a filter is applied, every numerator and denominator must use the same department and location scope. Date filters apply to event dates, not to the employee hire date unless the question explicitly asks for a hire cohort. If a measure mixes a current snapshot with dated events, name both bases in the response.

## Active headcount and workforce composition

Active headcount counts non-archived employees whose status is Active or On leave. Pending-start employees are reported separately and do not enter active-headcount denominators. Terminated and archived records are excluded. Workforce composition groups the same active population by department, role, location, employment type, or manager.

Use active headcount for capacity and representation questions. Use the full directory count only for data administration. A directory total can be larger than active headcount because it can contain pending-start, terminated, and archived records.

## Hiring and onboarding measures

Completed hires count requisitions or hiring records with status Hired and a hiring date in the reporting window. Open requisitions are the current count of Requested, Open, or Offer records. Average time to hire is the mean calendar days between application date and hiring date for completed hires with valid dates.

Replacement rate is completed hires divided by recorded exits in the same event window. It is a staffing-flow indicator, not a quality-of-hire or retention measure. Candidate pipeline counts current candidate stages. New-joiner readiness comes from pending-start employee records, submitted onboarding verification, start date, and manager assignment.

## Attrition measures

Recorded attrition rate is exits in the reporting window divided by active employees plus those exits. Voluntary and involuntary percentages use recorded exit type. Exit-reason shares use exits with a stored reason; missing reason codes must be identified as a data-quality gap.

Observed attrition, model risk, and resignation timing are different concepts. A model probability is a review signal from stored model inputs. It does not prove intent, establish cause, or predict a resignation date. Department comparisons require a rate as well as the raw exit count because departments differ in size.

## Leave measures

Approved leave days sum persisted leave days for approved requests whose start date is in scope. Pending requests are a current operational queue. Away today includes approved leave where today falls between start and end dates. Upcoming leave contains approved or pending future requests.

Leave is a coverage-planning measure, not an employee-performance signal. High leave use must not be interpreted as poor performance. Coverage analysis should use overlapping dates, role coverage, and manager ownership.

## Learning and capability measures

Learning completion rate is completed assignments divided by assignments in the reporting scope. A completed assignment uses its completion date; an open assignment uses its assigned or updated date. Mandatory gaps count incomplete assignments whose persisted course record is mandatory. Course title keywords are not a reliable mandatory flag.

Capability recommendations join approved job-profile requirements, current role populations, course-to-skill mappings, completed learning evidence, and matching open requisitions. They are internal workforce-planning signals. They are not external labor-market forecasts unless a governed market-skills feed is connected and timestamped.

## Mobility and promotion measures

Promotion rate is recorded promotions in the reporting window divided by active headcount in the same workforce scope. Average time to promotion uses the stored months since previous promotion. A mobility-review cohort contains active employees with at least three years of tenure and no recorded promotion.

The mobility cohort is a data-review list, not a determination that an employee should be promoted. Review role level, lateral moves, performance evidence, employee preference, career ladders, and missing promotion history before action.

## Workforce continuity and replacement scenarios

Net movement is completed hires minus exits in the reporting window. Replacement coverage compares exits with completed hires and current open requisitions. A gap identifies possible staffing pressure; it does not prove service impact.

Replacement-cost outputs are scenarios, not accounting actuals. They use recorded compensation coverage plus explicit recruiting, vacancy-productivity, and onboarding-ramp assumptions. Review-weighted exposure multiplies a scenario cost by a model-review probability and must not be presented as an expected loss or guaranteed saving.

## Action queue and service levels

The action queue is built from persisted workflow requests. An actionable decision is open, assigned within the actor's role scope, and has a supported decision operation. Overdue means the stored due date is before today and the item is not completed. Owners, due dates, status, next action, and completion evidence come from the workflow row.

Calculated analytics exceptions become operational only after a durable work item is created. Opening a page is not completion. A completed action needs a stored resolver, completion time, and completion note or linked domain-state change.
