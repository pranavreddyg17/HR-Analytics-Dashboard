import assert from "node:assert/strict"

import { createAiWorkflowDraft, executeAiWorkflow, planAiWorkflow } from "@/lib/server/ai-workflows"
import { downloadEmployeeDocument, uploadEmployeeDocument } from "@/lib/server/employee-documents"
import { manageEmployee } from "@/lib/server/employee-management"
import { createEmployeeCase, createExpenseClaim, getEmployeePortal, submitSelfReview } from "@/lib/server/employee-portal"
import { getEmployeeImpactScenario, searchEmployeeImpactPeople } from "@/lib/server/employee-impact"
import { getEmployeeOnboardingState, submitEmployeeOnboarding } from "@/lib/server/employee-onboarding"
import { createHiringCandidate, updateHiringCandidate } from "@/lib/server/hiring"
import { runHrAgent } from "@/lib/server/hr-agent"
import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { getInboxOperations } from "@/lib/server/inbox"
import { assignLearningCourse, completeLearningAssignment, createLearningCourse, listLearningOperations } from "@/lib/server/learning"
import { createPerson, getPerson } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"
import { actOnWorkflow, createWorkflow } from "@/lib/server/workflows"
import { assignAsset, cancelEmployeeExit, completeEmployeeExit, createAsset, createEmployeeExit, getAsset, listAssets, listEmployeeExits, updateOffboardingTask } from "@/lib/server/exit-assets"

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for operational integration tests.")

const hr: RequestActor = { email: "hr.integration@example.com", displayName: "HR Integration", role: "hr" }
const admin: RequestActor = { email: "admin.integration@example.com", displayName: "Admin Integration", role: "admin" }
const manager: RequestActor = { email: "manager.integration@example.com", displayName: "Morgan Manager", role: "manager" }
const employee: RequestActor = { email: "employee.integration@example.com", displayName: "Elliot Employee", role: "employee" }
const newHire: RequestActor = { email: "newhire.integration@example.com", displayName: "Nora Newhire", role: "employee" }

function inboxItem(operations: Awaited<ReturnType<typeof getInboxOperations>>, id: string) {
  const item = operations.items.find((row) => row.id === id)
  assert.ok(item, `Expected ${id} in the work queue.`)
  return item
}

async function main() {
const db = await ensureHrDatabase()
await db.batch([
  db.prepare("INSERT INTO app_users(email, display_name, role, status, invited_by, onboarding_status) VALUES (?, ?, 'admin', 'active', 'integration-test', 'not_required') ON CONFLICT(email) DO NOTHING").bind(admin.email, admin.displayName),
  db.prepare("INSERT INTO app_users(email, display_name, role, status, invited_by, onboarding_status) VALUES (?, ?, 'hr', 'active', 'integration-test', 'not_required') ON CONFLICT(email) DO NOTHING").bind(hr.email, hr.displayName),
  db.prepare("INSERT INTO app_users(email, display_name, role, status, invited_by, onboarding_status) VALUES (?, ?, 'manager', 'active', 'integration-test', 'not_required') ON CONFLICT(email) DO NOTHING").bind(manager.email, manager.displayName),
  db.prepare("INSERT INTO app_users(email, display_name, role, status, invited_by, onboarding_status) VALUES (?, ?, 'employee', 'active', 'integration-test', 'not_required') ON CONFLICT(email) DO NOTHING").bind(employee.email, employee.displayName),
  db.prepare("INSERT INTO app_users(email, display_name, role, status, invited_by, onboarding_status) VALUES (?, ?, 'employee', 'active', 'employee-self-service', 'required') ON CONFLICT(email) DO NOTHING").bind(newHire.email, newHire.displayName),
])

const managerRecord = await createPerson({
  employee_id: "INT-MANAGER",
  first_name: "Morgan",
  last_name: "Manager",
  work_email: manager.email,
  department: "Engineering",
  job_title: "Engineering Manager",
  location: "Remote",
  hire_date: "2022-01-10",
  employment_type: "Full-time",
  employment_status: "Active",
}, hr)
const employeeRecord = await createPerson({
  employee_id: "INT-EMPLOYEE",
  first_name: "Elliot",
  last_name: "Employee",
  work_email: employee.email,
  department: "Engineering",
  job_title: "Software Engineer II",
  location: "Remote",
  manager_id: managerRecord.employee_id,
  hire_date: "2024-03-04",
  employment_type: "Full-time",
  employment_status: "Active",
}, hr)
const adminRecord = await createPerson({
  employee_id: "INT-ADMIN",
  first_name: "Admin",
  last_name: "Integration",
  work_email: admin.email,
  department: "People Operations",
  job_title: "HR Administrator",
  location: "Remote",
  hire_date: "2021-01-04",
  employment_type: "Full-time",
  employment_status: "Active",
}, hr)
await db.batch([
  db.prepare("UPDATE app_users SET employee_id=?, onboarding_status='complete' WHERE email=?").bind(adminRecord.employee_id, admin.email),
  db.prepare("UPDATE app_users SET employee_id=?, onboarding_status='complete' WHERE email=?").bind(managerRecord.employee_id, manager.email),
  db.prepare("UPDATE app_users SET employee_id=?, onboarding_status='complete' WHERE email=?").bind(employeeRecord.employee_id, employee.email),
  db.prepare("INSERT INTO employee_compensation(id, employee_id, annual_salary, currency, pay_frequency, effective_from, created_by_email) VALUES ('INT-COMP-EMPLOYEE', ?, 120000, 'USD', 'annual', '2026-01-01', ?) ON CONFLICT(id) DO UPDATE SET annual_salary=excluded.annual_salary").bind(employeeRecord.employee_id, hr.email),
])

const impactSearch = await searchEmployeeImpactPeople("Elliot", { department: "Engineering" })
assert.ok(impactSearch.some((row) => row.employeeId === employeeRecord.employee_id))
const employeeImpact = await getEmployeeImpactScenario(employeeRecord.employee_id, { department: "Engineering", recruitingCostPerHire: 8000 })
assert.ok(employeeImpact)
assert.equal(employeeImpact.employeeId, employeeRecord.employee_id)
assert.equal(employeeImpact.payDataAvailable, true)
assert.equal(employeeImpact.directRecruitingCost, 8000)
assert.ok(employeeImpact.replacementCost > employeeImpact.directRecruitingCost)
assert.equal(await getEmployeeImpactScenario(employeeRecord.employee_id, { department: "Sales" }), null)

const leave = await createWorkflow({ type: "leave", leaveType: "Annual", startDate: "2027-02-08", endDate: "2027-02-09", note: "Integration coverage handoff is documented." }, employee)
let managerInbox = await getInboxOperations(manager)
let hrInbox = await getInboxOperations(hr)
assert.deepEqual(inboxItem(managerInbox, leave.id).actions, ["reject", "approve"])
assert.equal(inboxItem(managerInbox, leave.id).assignedTo, "manager")
assert.equal(inboxItem(hrInbox, leave.id).requiresDecision, true)

const inboxAnswer = await runHrAgent({
  message: "Summarize decisions and exceptions in this queue",
  actor: manager,
  pageContext: { key: "inbox", route: "/inbox", label: "Inbox", filters: { type: "leave", item: leave.id } },
})
assert.equal(inboxAnswer.tools[0]?.tool, "review_work_queue")
assert.match(inboxAnswer.answer, /Annual leave request/i)
assert.match(inboxAnswer.answer, new RegExp(leave.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))

await actOnWorkflow({ id: leave.id, type: "leave", action: "approve", note: "Coverage confirmed by the manager." }, manager)
let portal = await getEmployeePortal(employee)
assert.equal(portal.leave.find((row) => row.id === leave.id)?.approval_status, "Approved")
assert.equal(portal.leave.find((row) => row.id === leave.id)?.decision_note, "Coverage confirmed by the manager.")
managerInbox = await getInboxOperations(manager)
assert.equal(inboxItem(managerInbox, leave.id).isCompleted, true)
assert.deepEqual(inboxItem(managerInbox, leave.id).actions, [])

const expense = await createExpenseClaim({ category: "training", expenseDate: "2026-08-01", amount: 180, currency: "USD", description: "Cloud certification examination fee." }, employee)
hrInbox = await getInboxOperations(hr)
assert.deepEqual(inboxItem(hrInbox, expense.id).actions, ["reject", "approve"])
assert.match(inboxItem(hrInbox, expense.id).requestContext.map((row) => row.value).join(" "), /Cloud certification examination fee/i)
await assert.rejects(() => actOnWorkflow({ id: expense.id, type: "reimbursement", action: "approve", note: "Self approval must fail." }, employee), /Only HR|own reimbursement/i)
await actOnWorkflow({ id: expense.id, type: "reimbursement", action: "approve", note: "Receipt and policy eligibility verified." }, hr)
portal = await getEmployeePortal(employee)
assert.equal(portal.claims.find((row) => row.id === expense.id)?.status, "approved")
assert.equal(portal.claims.find((row) => row.id === expense.id)?.decision_note, "Receipt and policy eligibility verified.")
hrInbox = await getInboxOperations(hr)
assert.equal(inboxItem(hrInbox, expense.id).isCompleted, true)

const employeeCase = await createEmployeeCase({ category: "equipment", subject: "Development laptop replacement", description: "The assigned laptop is failing hardware diagnostics and needs replacement.", confidentiality: "manager" }, employee)
managerInbox = await getInboxOperations(manager)
assert.deepEqual(inboxItem(managerInbox, employeeCase.id).actions, ["complete"])
assert.equal(inboxItem(managerInbox, employeeCase.id).assignedTo, "manager")
await assert.rejects(() => actOnWorkflow({ id: employeeCase.id, type: "case", action: "complete", note: "short" }, manager), /clear resolution/i)
portal = await getEmployeePortal(employee)
assert.equal(portal.cases.find((row) => row.id === employeeCase.id)?.status, "open")
await actOnWorkflow({ id: employeeCase.id, type: "case", action: "complete", note: "Replacement approved and the service desk ticket was created." }, manager)
portal = await getEmployeePortal(employee)
assert.equal(portal.cases.find((row) => row.id === employeeCase.id)?.status, "resolved")
assert.match(String(portal.cases.find((row) => row.id === employeeCase.id)?.resolution_note), /service desk/i)
managerInbox = await getInboxOperations(manager)
assert.equal(inboxItem(managerInbox, employeeCase.id).isCompleted, true)

const adminCase = await createEmployeeCase({ category: "equipment", subject: "Administrator equipment request", description: "A replacement laptop is required for normal workspace administration.", confidentiality: "hr" }, admin)
let adminInbox = await getInboxOperations(admin)
assert.deepEqual(inboxItem(adminInbox, adminCase.id).actions, ["complete"])
await actOnWorkflow({ id: adminCase.id, type: "case", action: "complete", note: "Replacement approved and assigned to the service desk." }, admin)
portal = await getEmployeePortal(admin)
assert.equal(portal.cases.find((row) => row.id === adminCase.id)?.status, "resolved")
adminInbox = await getInboxOperations(admin)
assert.equal(inboxItem(adminInbox, adminCase.id).isCompleted, true)

const course = await createLearningCourse({ code: "INT-AZ-101", title: "Integration cloud reliability", defaultHours: 3, isMandatory: false, skillIds: [] }, hr)
const campaign = await assignLearningCourse({ targetType: "job_title", targetValue: "Software Engineer II", courseId: course.id, dueDate: "2027-03-01", hours: 3, note: "Role capability evidence." }, hr)
assert.equal(campaign.assigned, 1)
let learning = await listLearningOperations(employee)
const assignment = learning.assignments.find((row) => row.courseId === course.id)
assert.ok(assignment)
let employeeInbox = await getInboxOperations(employee)
assert.deepEqual(inboxItem(employeeInbox, assignment.id).actions, ["complete"])
await completeLearningAssignment(assignment.id, { assessmentScore: 92, note: "Completion verified in employee self-service." }, employee)
learning = await listLearningOperations(hr)
assert.equal(learning.assignments.find((row) => row.id === assignment.id)?.status, "Completed")
employeeInbox = await getInboxOperations(employee)
assert.equal(inboxItem(employeeInbox, assignment.id).isCompleted, true)

const aiLearningDraft = await createAiWorkflowDraft({
  type: "learning_assignment",
  targetType: "job_title",
  targetValue: "Software Engineer II",
  courseId: course.id,
  dueDate: "2027-03-15",
  hours: 3,
  note: "Agent-prepared role capability assignment.",
}, hr)
const aiLearningResult = await executeAiWorkflow(aiLearningDraft.draft.id, hr, new Request("http://localhost/api/v1/ai/workflows/execute"))
assert.equal(aiLearningResult.status, "completed")
learning = await listLearningOperations(employee)
assert.ok(learning.assignments.some((row) => row.courseId === course.id && row.status !== "Completed"))

const review = await manageEmployee(employeeRecord.employee_id, { action: "create_review", cycleName: "Integration performance review", startsOn: "2027-01-01", endsOn: "2027-06-30" }, hr)
const managerReview = await manageEmployee(managerRecord.employee_id, { action: "create_review", cycleName: "Integration performance review", startsOn: "2027-01-01", endsOn: "2027-06-30" }, hr)
assert.equal(managerReview.cycleId, review.cycleId)
await assert.rejects(
  () => manageEmployee(employeeRecord.employee_id, { action: "create_review", cycleName: "Integration performance review", startsOn: "2027-01-01", endsOn: "2027-06-30" }, hr),
  /already assigned/i,
)
portal = await getEmployeePortal(employee)
assert.equal(portal.reviews.find((row) => row.id === review.id)?.status, "self_review")
await submitSelfReview({ reviewId: review.id, selfReview: "I delivered the integration outcomes, documented operational handoffs, and identified the next reliability improvements for the team.", employeeRating: 4 }, employee)
let managerProfile = await getPerson(employeeRecord.employee_id, manager)
assert.equal(managerProfile.permissions.canManageReviews, true)
assert.match(String(managerProfile.reviews.find((row) => row.id === review.id)?.self_review), /integration outcomes/i)
await manageEmployee(employeeRecord.employee_id, { action: "submit_manager_review", reviewId: review.id, managerReview: "Elliot delivered the agreed integration outcomes, improved operational documentation, and should lead the next reliability review with continued mentoring support.", managerRating: 4 }, manager)
portal = await getEmployeePortal(employee)
assert.equal(portal.reviews.find((row) => row.id === review.id)?.status, "completed")
assert.match(String(portal.reviews.find((row) => row.id === review.id)?.manager_review), /continued mentoring support/i)

const meeting = await manageEmployee(employeeRecord.employee_id, { action: "schedule_one_on_one", scheduledAt: "2027-06-10T17:00:00.000Z" }, manager)
await manageEmployee(employeeRecord.employee_id, { action: "complete_one_on_one", meetingId: meeting.id, employeeNotes: "Discussed platform ownership and support needed.", managerNotes: "Agreed that Elliot will own the reliability review and receive protected preparation time each sprint." }, manager)
const approvedMeeting = await manageEmployee(employeeRecord.employee_id, { action: "approve_one_on_one_summary", meetingId: meeting.id }, manager)
assert.match(String(approvedMeeting.emailDraft?.launchUrl), /^https:\/\/mail\.google\.com\/mail\//)
portal = await getEmployeePortal(employee)
assert.ok(portal.meetings.find((row) => row.id === meeting.id)?.summary_approved_at)

const requisition = await createWorkflow({ type: "hiring", position: "Platform Engineer", department: "Engineering", location: "Remote", employmentType: "Full-time", justification: "Add production reliability coverage for the platform team." }, manager)
hrInbox = await getInboxOperations(hr)
assert.deepEqual(inboxItem(hrInbox, requisition.id).actions, ["reject", "approve"])
await actOnWorkflow({ id: requisition.id, type: "hiring", action: "approve", note: "Headcount is approved in the operating plan." }, hr)
hrInbox = await getInboxOperations(hr)
assert.equal(inboxItem(hrInbox, requisition.id).status, "Open")
assert.equal(inboxItem(hrInbox, requisition.id).isCompleted, false)
const candidate = await createHiringCandidate({ requisitionId: requisition.id, fullName: "Harper Candidate", email: "harper.candidate@example.com", source: "Employee referral", notes: "Integration candidate." }, manager)
for (const stage of ["Screening", "Interview", "Offer"] as const) await updateHiringCandidate(candidate.id, { stage }, manager)
await updateHiringCandidate(candidate.id, { stage: "Hired", startDate: "2027-04-05" }, manager)
const hired = await db.prepare("SELECT employee_id, employment_status FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?)").bind("harper.candidate@example.com").first<{ employee_id: string; employment_status: string }>()
assert.equal(hired?.employment_status, "Preboarding")

const aiHiringPlan = await planAiWorkflow({ prompt: "Request a full-time Release Engineer in Engineering, Remote, because the release programme needs dedicated production coordination." }, manager)
assert.equal(aiHiringPlan.type, "hiring_requisition")
if (aiHiringPlan.type !== "hiring_requisition") throw new Error("Expected a hiring requisition plan.")
const aiWorkflowHandoff = await runHrAgent({
  message: "Request a full-time Release Engineer in Engineering, Remote, because the release programme needs dedicated production coordination.",
  actor: manager,
})
assert.equal(aiWorkflowHandoff.workflow?.type, "hiring_requisition")
assert.equal(aiWorkflowHandoff.workflow?.requiresConfirmation, true)
const aiHiringDraft = await createAiWorkflowDraft({ type: aiHiringPlan.type, position: aiHiringPlan.position, department: aiHiringPlan.department, location: aiHiringPlan.location, employmentType: aiHiringPlan.employmentType, justification: aiHiringPlan.justification }, manager)
const aiHiringResult = await executeAiWorkflow(aiHiringDraft.draft.id, manager, new Request("http://localhost/api/v1/ai/workflows/execute"))
assert.equal(aiHiringResult.status, "completed")
hrInbox = await getInboxOperations(hr)
assert.deepEqual(inboxItem(hrInbox, String(aiHiringResult.requisitionId)).actions, ["reject", "approve"])

const onboarding = await submitEmployeeOnboarding({ organizationName: "LaidbackHR", firstName: "Nora", lastName: "Newhire", department: "Engineering", jobTitle: "Site Reliability Engineer", jobLevel: "IC3", location: "Remote", managerName: manager.displayName, managerEmail: manager.email, hireDate: "2027-05-03", employmentType: "Full-time", annualSalary: 125000, currency: "USD" }, newHire)
assert.equal((await getEmployeeOnboardingState(newHire)).status, "submitted")
await assert.rejects(
  () => actOnWorkflow({ id: "ONB-MISSING", type: "onboarding", action: "approve", note: "Invalid lookup should fail." }, hr),
  /not found/i,
)
const submitted = await db.prepare("SELECT id FROM employee_onboarding_submissions WHERE employee_id=? AND status='submitted'").bind(onboarding.employeeId).first<{ id: string }>()
assert.ok(submitted)
hrInbox = await getInboxOperations(hr)
assert.deepEqual(inboxItem(hrInbox, submitted.id).actions, ["reject", "approve"])
await actOnWorkflow({ id: submitted.id, type: "onboarding", action: "approve", note: "Employment details verified against the approved offer." }, hr)
assert.equal((await getEmployeeOnboardingState(newHire)).status, "complete")
hrInbox = await getInboxOperations(hr)
assert.equal(inboxItem(hrInbox, submitted.id).isCompleted, true)

await db.batch([
  db.prepare("INSERT INTO employee_documents(id, employee_id, document_type, file_name, blob_name, content_type, size_bytes, visibility, uploaded_by_email) VALUES ('INT-DOC-EMP', ?, 'resume', 'employee.pdf', 'integration/employee.pdf', 'application/pdf', 10, 'employee', ?)").bind(employeeRecord.employee_id, employee.email),
  db.prepare("INSERT INTO employee_documents(id, employee_id, document_type, file_name, blob_name, content_type, size_bytes, visibility, uploaded_by_email) VALUES ('INT-DOC-MGR', ?, 'supporting_document', 'manager.pdf', 'integration/manager.pdf', 'application/pdf', 10, 'manager', ?)").bind(employeeRecord.employee_id, hr.email),
  db.prepare("INSERT INTO employee_documents(id, employee_id, document_type, file_name, blob_name, content_type, size_bytes, visibility, uploaded_by_email) VALUES ('INT-DOC-HR', ?, 'supporting_document', 'hr.pdf', 'integration/hr.pdf', 'application/pdf', 10, 'hr', ?)").bind(employeeRecord.employee_id, hr.email),
])
portal = await getEmployeePortal(employee)
assert.deepEqual(portal.documents.map((row) => row.id), ["INT-DOC-EMP"])
assert.equal((await getPerson(employeeRecord.employee_id, hr)).documents.length, 3)
await assert.rejects(() => downloadEmployeeDocument("INT-DOC-EMP", manager), /do not have access/i)
await assert.rejects(() => downloadEmployeeDocument("INT-DOC-MGR", employee), /do not have access/i)
await assert.rejects(
  () => uploadEmployeeDocument(new File([new Uint8Array([1])], "restricted.pdf", { type: "application/pdf" }), { documentType: "supporting_document", visibility: "hr" }, employee),
  /must remain visible to the employee and HR/i,
)

const departing = await createPerson({
  employee_id: "INT-EXIT",
  first_name: "Erin",
  last_name: "Exit",
  work_email: "erin.exit.integration@example.com",
  department: "Engineering",
  job_title: "Software Engineer I",
  location: "Remote",
  manager_id: managerRecord.employee_id,
  hire_date: "2025-01-13",
  employment_type: "Full-time",
  employment_status: "Active",
}, hr)
const asset = await createAsset({ assetTag: "INT-LT-0001", assetType: "Laptop", manufacturer: "Lenovo", model: "ThinkPad T14", serialNumber: "INT-SERIAL-0001", status: "Available", condition: "Good", acquiredOn: "2025-01-01", warrantyExpiresOn: "2028-01-01", replacementDueOn: "2029-01-01" }, admin)
await assignAsset(asset.id, { employeeId: departing.employee_id }, admin)
assert.equal((await getAsset(asset.id)).currentAssignment?.employeeId, departing.employee_id)
assert.ok((await getPerson(departing.employee_id, hr)).assets.some((row) => row.id === asset.id))

let exit = await createEmployeeExit({ employeeId: departing.employee_id, exitType: "Resignation", expectedExitDate: "2027-08-31", notes: "Integration offboarding validation." }, hr)
assert.ok(exit.tasks.some((task) => task.taskType === "asset_return" && task.assetTag === "INT-LT-0001"))
assert.equal((await getPerson(departing.employee_id, hr)).employee.employment_status, "Notice Period")
hrInbox = await getInboxOperations(hr)
assert.equal(inboxItem(hrInbox, exit.id).type, "offboarding")

const knownExitAnswer = await runHrAgent({ message: "Who is scheduled to leave in the next 90 days?", actor: hr, pageContext: { key: "exits", route: "/exits", label: "Exit management", filters: {} } })
assert.equal(knownExitAnswer.tools[0]?.tool, "review_exit_and_asset_operations")
assert.match(knownExitAnswer.answer, /confirmed exit|offboarding/i)

for (const task of exit.tasks) {
  exit = await updateOffboardingTask(exit.id, task.id, { status: "Completed", ...(task.assetAssignmentId ? { returnCondition: "Good" } : {}), notes: "Integration task completed." }, hr)
}
assert.equal(exit.progress, 100)
assert.equal((await getAsset(asset.id)).currentAssignment, null)
exit = await completeEmployeeExit(exit.id, "2027-08-31", hr)
assert.equal(exit.status, "Completed")
assert.equal((await getPerson(departing.employee_id, hr)).employee.employment_status, "Resigned")
assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM attrition_events WHERE employee_id=?").bind(departing.employee_id).first<{ count: number }>())?.count, 1)
assert.ok((await listAssets({ search: "INT-LT-0001" })).items.some((row) => row.status === "Returned"))
assert.ok((await listEmployeeExits({ search: departing.employee_id })).items.some((row) => row.status === "Completed"))

const retained = await createPerson({
  employee_id: "INT-EXIT-CANCEL",
  first_name: "Casey",
  last_name: "Retained",
  work_email: "casey.retained.integration@example.com",
  department: "Engineering",
  job_title: "Software Engineer I",
  location: "Remote",
  manager_id: managerRecord.employee_id,
  hire_date: "2024-06-17",
  employment_type: "Full-time",
  employment_status: "On Bench",
}, hr)
const cancelledExit = await createEmployeeExit({ employeeId: retained.employee_id, exitType: "Contract end", expectedExitDate: "2027-10-15", notes: "Cancellation state restoration validation." }, hr)
assert.equal((await getPerson(retained.employee_id, hr)).employee.employment_status, "Scheduled Exit")
await cancelEmployeeExit(cancelledExit.id, hr)
assert.equal((await getPerson(retained.employee_id, hr)).employee.employment_status, "On Bench")
assert.ok((await listEmployeeExits({ search: retained.employee_id })).items.some((row) => row.status === "Cancelled"))

console.log("Operational integration passed: employee services, actor-scoped queues, reviews, one-on-ones, AI workflows, learning, hiring, onboarding, document visibility, assets, and offboarding.")
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
