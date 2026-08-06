import { sql } from "drizzle-orm"
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

// Legacy import/write contracts. Canonical reads use the normalized tables and
// views below; these tables remain temporarily so existing CSV/API clients can
// migrate without a destructive cutover.
export const employees = sqliteTable("employees", {
  employeeId: text("employee_id").primaryKey(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  preferredName: text("preferred_name"),
  workEmail: text("work_email"),
  phone: text("phone"),
  department: text("department").notNull(),
  jobTitle: text("job_title").notNull(),
  location: text("location").notNull(),
  manager: text("manager").notNull(),
  managerId: text("manager_id"),
  hireDate: text("hire_date").notNull(),
  employmentType: text("employment_type").notNull().default("Full-time"),
  employmentStatus: text("employment_status").notNull(),
  tenureYears: real("tenure_years").notNull(),
  dataSource: text("data_source").notNull().default("imported"),
  archivedAt: text("archived_at"),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("employees_department_idx").on(table.department),
  index("employees_job_title_idx").on(table.jobTitle),
  index("employees_location_idx").on(table.location),
  index("employees_status_idx").on(table.employmentStatus),
  index("employees_manager_idx").on(table.managerId),
  index("employees_work_email_idx").on(table.workEmail),
])

export const employeeActivity = sqliteTable("employee_activity", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  eventType: text("event_type").notNull(),
  summary: text("summary").notNull(),
  changesJson: text("changes_json"),
  actorEmail: text("actor_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("employee_activity_employee_idx").on(table.employeeId),
  index("employee_activity_created_idx").on(table.createdAt),
])

export const workspaceSettings = sqliteTable("workspace_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const hiringRecords = sqliteTable("hiring_records", {
  id: text("id").primaryKey(),
  position: text("position").notNull(),
  department: text("department").notNull(),
  applicationDate: text("application_date").notNull(),
  hiringDate: text("hiring_date"),
  hiringSource: text("hiring_source").notNull(),
  timeToHireDays: integer("time_to_hire_days"),
  recruitmentStatus: text("recruitment_status").notNull(),
  location: text("location").notNull(),
  dataSource: text("data_source").notNull().default("imported"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("hiring_department_idx").on(table.department),
  index("hiring_date_idx").on(table.hiringDate),
])

export const hiringCandidates = sqliteTable("hiring_candidates", {
  id: text("id").primaryKey(),
  requisitionId: text("requisition_id").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  stage: text("stage").notNull().default("Applied"),
  source: text("source").notNull(),
  appliedAt: text("applied_at").notNull(),
  ownerEmail: text("owner_email").notNull(),
  nextStep: text("next_step").notNull(),
  nextStepDueAt: text("next_step_due_at"),
  notes: text("notes"),
  rejectedReason: text("rejected_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("hiring_candidates_requisition_stage_idx").on(table.requisitionId, table.stage),
  index("hiring_candidates_due_stage_idx").on(table.nextStepDueAt, table.stage),
  uniqueIndex("hiring_candidates_requisition_email_idx").on(table.requisitionId, table.email),
])

export const hiringActivity = sqliteTable("hiring_activity", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  requisitionId: text("requisition_id").notNull(),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  detail: text("detail").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("hiring_activity_requisition_created_idx").on(table.requisitionId, table.createdAt),
  index("hiring_activity_entity_created_idx").on(table.entityType, table.entityId, table.createdAt),
])

export const attritionEvents = sqliteTable("attrition_events", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  exitDate: text("exit_date").notNull(),
  exitReason: text("exit_reason").notNull(),
  exitType: text("exit_type").notNull(),
  department: text("department").notNull(),
  tenureYears: real("tenure_years").notNull(),
  dataSource: text("data_source").notNull().default("imported"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("attrition_employee_idx").on(table.employeeId),
  index("attrition_department_idx").on(table.department),
  index("attrition_date_idx").on(table.exitDate),
])

export const attritionModelProfiles = sqliteTable("attrition_model_profiles", {
  employeeId: text("employee_id").primaryKey(),
  observedAttrition: text("observed_attrition").notNull(),
  riskScore: real("risk_score").notNull(),
  riskLevel: text("risk_level").notNull(),
  topDriver: text("top_driver").notNull(),
  monthlyIncome: real("monthly_income").notNull(),
  distanceFromHome: integer("distance_from_home").notNull(),
  educationLevel: integer("education_level").notNull(),
  educationField: text("education_field").notNull(),
  environmentSatisfaction: integer("environment_satisfaction").notNull(),
  jobSatisfaction: integer("job_satisfaction").notNull(),
  priorCompanies: integer("prior_companies").notNull(),
  workLifeBalance: integer("work_life_balance").notNull(),
  yearsAtCompany: real("years_at_company").notNull(),
  modelVersion: text("model_version").notNull(),
  dataSource: text("data_source").notNull().default("demo"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("attrition_model_risk_idx").on(table.riskLevel, table.riskScore),
  index("attrition_model_observed_idx").on(table.observedAttrition),
])

export const leaveRecords = sqliteTable("leave_records", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  leaveType: text("leave_type").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  leaveDays: real("leave_days").notNull(),
  approvalStatus: text("approval_status").notNull(),
  department: text("department").notNull(),
  dataSource: text("data_source").notNull().default("imported"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("leave_employee_idx").on(table.employeeId),
  index("leave_department_idx").on(table.department),
  index("leave_date_idx").on(table.startDate),
])

export const trainingRecords = sqliteTable("training_records", {
  id: text("id").primaryKey(),
  trainingProgram: text("training_program").notNull(),
  employeeId: text("employee_id").notNull(),
  completionStatus: text("completion_status").notNull(),
  completionDate: text("completion_date"),
  trainingHours: real("training_hours").notNull(),
  assessmentScore: real("assessment_score"),
  department: text("department").notNull(),
  dataSource: text("data_source").notNull().default("imported"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("training_employee_idx").on(table.employeeId),
  index("training_department_idx").on(table.department),
  index("training_date_idx").on(table.completionDate),
])

export const promotionRecords = sqliteTable("promotion_records", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  previousTitle: text("previous_title").notNull(),
  newTitle: text("new_title").notNull(),
  promotionDate: text("promotion_date").notNull(),
  department: text("department").notNull(),
  monthsSincePreviousPromotion: integer("months_since_previous_promotion").notNull(),
  dataSource: text("data_source").notNull().default("imported"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("promotion_employee_idx").on(table.employeeId),
  index("promotion_department_idx").on(table.department),
  index("promotion_date_idx").on(table.promotionDate),
])

export const dataImports = sqliteTable("data_imports", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(),
  filename: text("filename").notNull(),
  mode: text("mode").notNull().default("merge"),
  totalRows: integer("total_rows").notNull().default(0),
  rowCount: integer("row_count").notNull(),
  insertedRows: integer("inserted_rows").notNull().default(0),
  updatedRows: integer("updated_rows").notNull().default(0),
  deletedRows: integer("deleted_rows").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  errorSummary: text("error_summary"),
  importedByEmail: text("imported_by_email"),
  status: text("status").notNull(),
  completedAt: text("completed_at"),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("data_imports_domain_date_idx").on(table.domain, table.importedAt),
  index("data_imports_status_date_idx").on(table.status, table.importedAt),
])

export const dataImportRows = sqliteTable("data_import_rows", {
  jobId: text("job_id").notNull(),
  rowKey: text("row_key").notNull(),
  payloadJson: text("payload_json").notNull(),
}, (table) => [
  primaryKey({ columns: [table.jobId, table.rowKey] }),
])

export const workflowRequests = sqliteTable("workflow_requests", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  employeeId: text("employee_id"),
  title: text("title").notNull(),
  status: text("status").notNull(),
  detailsJson: text("details_json").notNull().default("{}"),
  requestedByEmail: text("requested_by_email").notNull(),
  priority: text("priority").notNull().default("medium"),
  ownerEmail: text("owner_email"),
  dueAt: text("due_at"),
  nextAction: text("next_action"),
  sourceEntityType: text("source_entity_type"),
  sourceEntityId: text("source_entity_id"),
  assignedAt: text("assigned_at"),
  blockedReason: text("blocked_reason"),
  confidentialityLevel: text("confidentiality_level").notNull().default("internal"),
  resolvedByEmail: text("resolved_by_email"),
  resolvedAt: text("resolved_at"),
  completedAt: text("completed_at"),
  completionNotes: text("completion_notes"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("workflow_type_status_idx").on(table.type, table.status),
  index("workflow_employee_idx").on(table.employeeId),
  index("workflow_requester_idx").on(table.requestedByEmail),
  index("workflow_owner_status_idx").on(table.ownerEmail, table.status),
  index("workflow_due_status_idx").on(table.dueAt, table.status),
])

export const aiWorkflowDrafts = sqliteTable("ai_workflow_drafts", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("ready"),
  employeeIdsJson: text("employee_ids_json").notNull().default("[]"),
  detailsJson: text("details_json").notNull().default("{}"),
  createdByEmail: text("created_by_email").notNull(),
  openedAt: text("opened_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("ai_workflow_creator_idx").on(table.createdByEmail),
])

export const aiConversations = sqliteTable("ai_conversations", {
  id: text("id").primaryKey(),
  userEmail: text("user_email").notNull(),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("ai_conversations_user_updated_idx").on(table.userEmail, table.updatedAt),
])

export const aiConversationMessages = sqliteTable("ai_conversation_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  position: integer("position").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  toolsJson: text("tools_json"),
  contextJson: text("context_json"),
  dataMode: text("data_mode"),
  provider: text("provider"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("ai_conversation_messages_conversation_position_idx").on(table.conversationId, table.position),
])

export const appUsers = sqliteTable("app_users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  role: text("role").notNull().default("viewer"),
  status: text("status").notNull().default("active"),
  invitedBy: text("invited_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastLoginAt: text("last_login_at"),
})

export const accessAudit = sqliteTable("access_audit", {
  id: text("id").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  targetEmail: text("target_email").notNull(),
  detailsJson: text("details_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("access_audit_created_idx").on(table.createdAt),
  index("access_audit_target_idx").on(table.targetEmail),
])

// Canonical HR master data. The original domain tables remain as a staged
// compatibility layer so existing D1 records can be migrated without downtime.
export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code"),
  parentDepartmentId: text("parent_department_id"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("departments_name_uq").on(table.name),
  uniqueIndex("departments_code_uq").on(table.code),
  index("departments_parent_idx").on(table.parentDepartmentId),
])

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  countryCode: text("country_code"),
  timezone: text("timezone"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("locations_name_uq").on(table.name)])

export const jobProfiles = sqliteTable("job_profiles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  jobFamily: text("job_family"),
  jobLevel: text("job_level"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("job_profiles_title_uq").on(table.title)])

export const employmentAssignments = sqliteTable("employment_assignments", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.employeeId, { onDelete: "cascade" }),
  departmentId: text("department_id").notNull().references(() => departments.id),
  jobProfileId: text("job_profile_id").notNull().references(() => jobProfiles.id),
  locationId: text("location_id").notNull().references(() => locations.id),
  managerEmployeeId: text("manager_employee_id").references(() => employees.employeeId),
  employmentType: text("employment_type").notNull(),
  employmentStatus: text("employment_status").notNull(),
  effectiveStart: text("effective_start").notNull(),
  effectiveEnd: text("effective_end"),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("employment_assignments_employee_dates_idx").on(table.employeeId, table.effectiveStart, table.effectiveEnd),
  index("employment_assignments_department_status_idx").on(table.departmentId, table.employmentStatus),
  index("employment_assignments_manager_idx").on(table.managerEmployeeId),
])

export const leaveTypes = sqliteTable("leave_types", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isPaid: integer("is_paid", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("leave_types_name_uq").on(table.name)])

export const leaveRequests = sqliteTable("leave_requests", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.employeeId),
  leaveTypeId: text("leave_type_id").notNull().references(() => leaveTypes.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  leaveDays: real("leave_days").notNull(),
  status: text("status").notNull(),
  requestedAt: text("requested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  decidedAt: text("decided_at"),
  decidedByEmail: text("decided_by_email"),
  dataSource: text("data_source").notNull().default("imported"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("leave_requests_employee_dates_idx").on(table.employeeId, table.startDate, table.endDate),
  index("leave_requests_status_start_idx").on(table.status, table.startDate),
  index("leave_requests_type_idx").on(table.leaveTypeId),
])

export const learningCourses = sqliteTable("learning_courses", {
  id: text("id").primaryKey(),
  code: text("code"),
  title: text("title").notNull(),
  defaultDurationHours: real("default_duration_hours").notNull().default(0),
  isMandatory: integer("is_mandatory", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("learning_courses_title_uq").on(table.title),
  uniqueIndex("learning_courses_code_uq").on(table.code),
])

export const courseAssignments = sqliteTable("course_assignments", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => learningCourses.id),
  employeeId: text("employee_id").notNull().references(() => employees.employeeId),
  assignedAt: text("assigned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  dueDate: text("due_date"),
  status: text("status").notNull(),
  completedAt: text("completed_at"),
  assessmentScore: real("assessment_score"),
  assignedHours: real("assigned_hours").notNull().default(0),
  dataSource: text("data_source").notNull().default("imported"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("course_assignments_employee_status_idx").on(table.employeeId, table.status),
  index("course_assignments_due_status_idx").on(table.dueDate, table.status),
  index("course_assignments_course_idx").on(table.courseId),
])

export const jobRequisitions = sqliteTable("job_requisitions", {
  id: text("id").primaryKey(),
  jobProfileId: text("job_profile_id").notNull().references(() => jobProfiles.id),
  departmentId: text("department_id").notNull().references(() => departments.id),
  locationId: text("location_id").notNull().references(() => locations.id),
  openedAt: text("opened_at").notNull(),
  hiredAt: text("hired_at"),
  source: text("source").notNull(),
  status: text("status").notNull(),
  dataSource: text("data_source").notNull().default("imported"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("job_requisitions_department_status_idx").on(table.departmentId, table.status),
  index("job_requisitions_opened_idx").on(table.openedAt),
])

export const talentCandidates = sqliteTable("talent_candidates", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("talent_candidates_email_uq").on(table.email)])

export const candidateApplications = sqliteTable("candidate_applications", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => talentCandidates.id),
  requisitionId: text("requisition_id").notNull().references(() => jobRequisitions.id),
  stage: text("stage").notNull(),
  source: text("source").notNull(),
  appliedAt: text("applied_at").notNull(),
  ownerEmail: text("owner_email").notNull(),
  nextStep: text("next_step").notNull(),
  nextStepDueAt: text("next_step_due_at"),
  notes: text("notes"),
  rejectedReason: text("rejected_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("candidate_applications_requisition_stage_idx").on(table.requisitionId, table.stage),
  index("candidate_applications_candidate_idx").on(table.candidateId),
  index("candidate_applications_due_stage_idx").on(table.nextStepDueAt, table.stage),
  uniqueIndex("candidate_applications_requisition_candidate_uq").on(table.requisitionId, table.candidateId),
])

export const exitReasons = sqliteTable("exit_reasons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("exit_reasons_name_uq").on(table.name)])

export const employeeExits = sqliteTable("employee_exits", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.employeeId),
  exitDate: text("exit_date").notNull(),
  exitReasonId: text("exit_reason_id").notNull().references(() => exitReasons.id),
  exitType: text("exit_type").notNull(),
  // Department is an event-time snapshot. It must not drift when an employee
  // later changes assignment or when the current org structure is renamed.
  departmentId: text("department_id").references(() => departments.id),
  dataSource: text("data_source").notNull().default("imported"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("employee_exits_employee_date_idx").on(table.employeeId, table.exitDate),
  index("employee_exits_department_date_idx").on(table.departmentId, table.exitDate),
  index("employee_exits_reason_idx").on(table.exitReasonId),
])

export const employeePromotions = sqliteTable("employee_promotions", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.employeeId),
  previousJobProfileId: text("previous_job_profile_id").notNull().references(() => jobProfiles.id),
  newJobProfileId: text("new_job_profile_id").notNull().references(() => jobProfiles.id),
  departmentId: text("department_id").references(() => departments.id),
  promotionDate: text("promotion_date").notNull(),
  dataSource: text("data_source").notNull().default("imported"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("employee_promotions_employee_date_idx").on(table.employeeId, table.promotionDate),
  index("employee_promotions_department_date_idx").on(table.departmentId, table.promotionDate),
])

export const modelVersions = sqliteTable("model_versions", {
  id: text("id").primaryKey(),
  modelName: text("model_name").notNull(),
  algorithm: text("algorithm"),
  reviewThreshold: real("review_threshold"),
  evaluationWindowDays: integer("evaluation_window_days"),
  metricsJson: text("metrics_json"),
  intendedUse: text("intended_use"),
  prohibitedUse: text("prohibited_use"),
  trainedAt: text("trained_at"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

export const attritionAssessments = sqliteTable("attrition_assessments", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull().references(() => employees.employeeId),
  modelVersionId: text("model_version_id").notNull().references(() => modelVersions.id),
  riskScore: real("risk_score").notNull(),
  dataSource: text("data_source").notNull().default("demo"),
  assessedAt: text("assessed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("attrition_assessments_employee_model_uq").on(table.employeeId, table.modelVersionId),
  index("attrition_assessments_risk_idx").on(table.modelVersionId, table.riskScore),
])

export const attritionAssessmentFeatures = sqliteTable("attrition_assessment_features", {
  assessmentId: text("assessment_id").notNull().references(() => attritionAssessments.id, { onDelete: "cascade" }),
  featureKey: text("feature_key").notNull(),
  featureValue: text("feature_value").notNull(),
  contribution: real("contribution"),
  contributionRank: integer("contribution_rank"),
  explanation: text("explanation"),
}, (table) => [
  primaryKey({ columns: [table.assessmentId, table.featureKey] }),
  index("attrition_assessment_features_key_idx").on(table.featureKey),
])
