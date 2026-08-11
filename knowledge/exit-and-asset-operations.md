# Employee exit and asset operations

## Confirmed exits versus predicted attrition

A confirmed employee exit is a durable EmployeeExit workflow with an exit type, expected last working date, checklist, owners, and completion state. A person in Notice Period or Scheduled Exit has a known operational departure. Attrition risk is a separate statistical review signal and must never be presented as a confirmed exit. Use exit records for offboarding, access, payroll, equipment, and continuity planning; use model records only for governed retention review.

## Exit workflow controls

Scheduling an exit updates the employee workforce status, creates one owned checklist, adds an offboarding item to the work queue, and adds a return task for every currently assigned asset. The standard checklist covers manager notification, knowledge transfer, exit interview, access removal, final payroll, and asset returns. A workflow can close only after every task is complete and no active asset assignment remains. Completion records the actual exit date, changes the employee to Resigned or Terminated, archives the active directory profile, and creates the recorded attrition event once.

## Exit dashboard definitions

Leaving in 30, 60, or 90 days counts open confirmed exit workflows whose expected exit date falls inside that forward window. Incomplete offboarding counts open workflows with at least one incomplete task. Outstanding assets counts open asset-return tasks. Pending access removal counts incomplete access-revocation tasks. Progress is completed checklist tasks divided by all checklist tasks. These measures come from current PostgreSQL workflow records and are not model estimates.

## Asset custody and inventory

An asset is a durable inventory record. AssetAssignment stores custody history and allows only one open assignment per asset. Assigning equipment changes inventory status to Assigned and records employee activity. Returning equipment closes the assignment, records return condition, updates inventory status, and completes any linked offboarding task. Employee profiles and the employee portal show current assignments from the same records.

## Asset lifecycle rules

Healthy means no configured lifecycle exception applies. Replacement Soon means the warranty date, explicit replacement date, or configured equipment age falls within the warning window. Degraded and Broken come from recorded condition. Lost and Retired are inventory statuses. Lifecycle rules prioritize review; they do not automatically order or replace equipment. Administrators should confirm budget, repairability, role need, and custody before action.

## Operational questions

For “who is leaving,” “offboarding progress,” or “access still open,” use the exit and asset operations tool. For “who may leave” or “highest attrition risk,” use attrition model analysis. For equipment questions, report custody, condition, warranty, and replacement exceptions without exposing serial numbers unless the user is working in the restricted inventory record.
