import { sql } from "drizzle-orm"
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const actionStatus = sqliteTable("action_status", {
  actionId: text("action_id").primaryKey(),
  status: text("status").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
})

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
  rowCount: integer("row_count").notNull(),
  status: text("status").notNull(),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("data_imports_domain_idx").on(table.domain)])

export const workflowRequests = sqliteTable("workflow_requests", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  employeeId: text("employee_id"),
  title: text("title").notNull(),
  status: text("status").notNull(),
  detailsJson: text("details_json").notNull().default("{}"),
  requestedByEmail: text("requested_by_email").notNull(),
  resolvedByEmail: text("resolved_by_email"),
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("workflow_type_status_idx").on(table.type, table.status),
  index("workflow_employee_idx").on(table.employeeId),
  index("workflow_requester_idx").on(table.requestedByEmail),
])
