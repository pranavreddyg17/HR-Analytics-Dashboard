import assert from "node:assert/strict"

import { downloadEmployeeDocument, uploadEmployeeDocument } from "@/lib/server/employee-documents"
import { createEmployeeCase, createExpenseClaim, getEmployeePortal } from "@/lib/server/employee-portal"
import { getEmployeeOnboardingState, submitEmployeeOnboarding } from "@/lib/server/employee-onboarding"
import { createHiringCandidate, updateHiringCandidate } from "@/lib/server/hiring"
import { ensureHrDatabase } from "@/lib/server/hr-repository"
import { assignLearningCourse, completeLearningAssignment, createLearningCourse, listLearningOperations } from "@/lib/server/learning"
import { createPerson, getPerson } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"
import { actOnWorkflow, createWorkflow } from "@/lib/server/workflows"

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for operational integration tests.")

const hr: RequestActor = { email: "hr.integration@example.com", displayName: "HR Integration", role: "hr" }
const manager: RequestActor = { email: "manager.integration@example.com", displayName: "Morgan Manager", role: "manager" }
const employee: RequestActor = { email: "employee.integration@example.com", displayName: "Elliot Employee", role: "employee" }
const newHire: RequestActor = { email: "newhire.integration@example.com", displayName: "Nora Newhire", role: "employee" }

async function main() {
const db = await ensureHrDatabase()
await db.batch([
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
await db.batch([
  db.prepare("UPDATE app_users SET employee_id=?, onboarding_status='complete' WHERE email=?").bind(managerRecord.employee_id, manager.email),
  db.prepare("UPDATE app_users SET employee_id=?, onboarding_status='complete' WHERE email=?").bind(employeeRecord.employee_id, employee.email),
])

const leave = await createWorkflow({ type: "leave", leaveType: "Annual", startDate: "2027-02-08", endDate: "2027-02-09", note: "Integration coverage handoff is documented." }, employee)
await actOnWorkflow({ id: leave.id, type: "leave", action: "approve", note: "Coverage confirmed by the manager." }, manager)
let portal = await getEmployeePortal(employee)
assert.equal(portal.leave.find((row) => row.id === leave.id)?.approval_status, "Approved")
assert.match(String(portal.leave.find((row) => row.id === leave.id)?.decision_note), /approved/i)

const expense = await createExpenseClaim({ category: "training", expenseDate: "2026-08-01", amount: 180, currency: "USD", description: "Cloud certification examination fee." }, employee)
await assert.rejects(() => actOnWorkflow({ id: expense.id, type: "reimbursement", action: "approve", note: "Self approval must fail." }, employee), /Only HR|own reimbursement/i)
await actOnWorkflow({ id: expense.id, type: "reimbursement", action: "approve", note: "Receipt and policy eligibility verified." }, hr)
portal = await getEmployeePortal(employee)
assert.equal(portal.claims.find((row) => row.id === expense.id)?.status, "approved")
assert.equal(portal.claims.find((row) => row.id === expense.id)?.decision_note, "Receipt and policy eligibility verified.")

const employeeCase = await createEmployeeCase({ category: "equipment", subject: "Development laptop replacement", description: "The assigned laptop is failing hardware diagnostics and needs replacement.", confidentiality: "manager" }, employee)
await actOnWorkflow({ id: employeeCase.id, type: "case", action: "complete", note: "Replacement approved and the service desk ticket was created." }, manager)
portal = await getEmployeePortal(employee)
assert.equal(portal.cases.find((row) => row.id === employeeCase.id)?.status, "resolved")
assert.match(String(portal.cases.find((row) => row.id === employeeCase.id)?.resolution_note), /service desk/i)

const course = await createLearningCourse({ code: "INT-AZ-101", title: "Integration cloud reliability", defaultHours: 3, isMandatory: false, skillIds: [] }, hr)
const campaign = await assignLearningCourse({ targetType: "job_title", targetValue: "Software Engineer II", courseId: course.id, dueDate: "2027-03-01", hours: 3, note: "Role capability evidence." }, hr)
assert.equal(campaign.assigned, 1)
let learning = await listLearningOperations(employee)
const assignment = learning.assignments.find((row) => row.courseId === course.id)
assert.ok(assignment)
await completeLearningAssignment(assignment.id, { assessmentScore: 92, note: "Completion verified in employee self-service." }, employee)
learning = await listLearningOperations(hr)
assert.equal(learning.assignments.find((row) => row.id === assignment.id)?.status, "Completed")

const requisition = await createWorkflow({ type: "hiring", position: "Platform Engineer", department: "Engineering", location: "Remote", employmentType: "Full-time", justification: "Add production reliability coverage for the platform team." }, manager)
await actOnWorkflow({ id: requisition.id, type: "hiring", action: "approve", note: "Headcount is approved in the operating plan." }, hr)
const candidate = await createHiringCandidate({ requisitionId: requisition.id, fullName: "Harper Candidate", email: "harper.candidate@example.com", source: "Employee referral", notes: "Integration candidate." }, manager)
for (const stage of ["Screening", "Interview", "Offer"] as const) await updateHiringCandidate(candidate.id, { stage }, manager)
await updateHiringCandidate(candidate.id, { stage: "Hired", startDate: "2027-04-05" }, manager)
const hired = await db.prepare("SELECT employee_id, employment_status FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?)").bind("harper.candidate@example.com").first<{ employee_id: string; employment_status: string }>()
assert.equal(hired?.employment_status, "Preboarding")

const onboarding = await submitEmployeeOnboarding({ organizationName: "LaidbackHR", firstName: "Nora", lastName: "Newhire", department: "Engineering", jobTitle: "Site Reliability Engineer", jobLevel: "IC3", location: "Remote", managerName: manager.displayName, managerEmail: manager.email, hireDate: "2027-05-03", employmentType: "Full-time", annualSalary: 125000, currency: "USD" }, newHire)
assert.equal((await getEmployeeOnboardingState(newHire)).status, "submitted")
await assert.rejects(
  () => actOnWorkflow({ id: "ONB-MISSING", type: "onboarding", action: "approve", note: "Invalid lookup should fail." }, hr),
  /not found/i,
)
const submitted = await db.prepare("SELECT id FROM employee_onboarding_submissions WHERE employee_id=? AND status='submitted'").bind(onboarding.employeeId).first<{ id: string }>()
assert.ok(submitted)
await actOnWorkflow({ id: submitted.id, type: "onboarding", action: "approve", note: "Employment details verified against the approved offer." }, hr)
assert.equal((await getEmployeeOnboardingState(newHire)).status, "complete")

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

console.log("Operational integration passed: leave, reimbursement, case resolution, learning, hiring, onboarding, and document visibility.")
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
