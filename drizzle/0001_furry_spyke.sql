CREATE TABLE `attrition_events` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`exit_date` text NOT NULL,
	`exit_reason` text NOT NULL,
	`exit_type` text NOT NULL,
	`department` text NOT NULL,
	`tenure_years` real NOT NULL,
	`data_source` text DEFAULT 'imported' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attrition_employee_idx` ON `attrition_events` (`employee_id`);--> statement-breakpoint
CREATE INDEX `attrition_department_idx` ON `attrition_events` (`department`);--> statement-breakpoint
CREATE INDEX `attrition_date_idx` ON `attrition_events` (`exit_date`);--> statement-breakpoint
CREATE TABLE `data_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`filename` text NOT NULL,
	`row_count` integer NOT NULL,
	`status` text NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `data_imports_domain_idx` ON `data_imports` (`domain`);--> statement-breakpoint
CREATE TABLE `employees` (
	`employee_id` text PRIMARY KEY NOT NULL,
	`department` text NOT NULL,
	`job_title` text NOT NULL,
	`location` text NOT NULL,
	`manager` text NOT NULL,
	`hire_date` text NOT NULL,
	`employment_status` text NOT NULL,
	`tenure_years` real NOT NULL,
	`data_source` text DEFAULT 'imported' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `employees_department_idx` ON `employees` (`department`);--> statement-breakpoint
CREATE INDEX `employees_job_title_idx` ON `employees` (`job_title`);--> statement-breakpoint
CREATE INDEX `employees_location_idx` ON `employees` (`location`);--> statement-breakpoint
CREATE TABLE `hiring_records` (
	`id` text PRIMARY KEY NOT NULL,
	`position` text NOT NULL,
	`department` text NOT NULL,
	`application_date` text NOT NULL,
	`hiring_date` text,
	`hiring_source` text NOT NULL,
	`time_to_hire_days` integer,
	`recruitment_status` text NOT NULL,
	`location` text NOT NULL,
	`data_source` text DEFAULT 'imported' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hiring_department_idx` ON `hiring_records` (`department`);--> statement-breakpoint
CREATE INDEX `hiring_date_idx` ON `hiring_records` (`hiring_date`);--> statement-breakpoint
CREATE TABLE `leave_records` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`leave_days` real NOT NULL,
	`approval_status` text NOT NULL,
	`department` text NOT NULL,
	`data_source` text DEFAULT 'imported' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leave_employee_idx` ON `leave_records` (`employee_id`);--> statement-breakpoint
CREATE INDEX `leave_department_idx` ON `leave_records` (`department`);--> statement-breakpoint
CREATE INDEX `leave_date_idx` ON `leave_records` (`start_date`);--> statement-breakpoint
CREATE TABLE `promotion_records` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`previous_title` text NOT NULL,
	`new_title` text NOT NULL,
	`promotion_date` text NOT NULL,
	`department` text NOT NULL,
	`months_since_previous_promotion` integer NOT NULL,
	`data_source` text DEFAULT 'imported' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `promotion_employee_idx` ON `promotion_records` (`employee_id`);--> statement-breakpoint
CREATE INDEX `promotion_department_idx` ON `promotion_records` (`department`);--> statement-breakpoint
CREATE INDEX `promotion_date_idx` ON `promotion_records` (`promotion_date`);--> statement-breakpoint
CREATE TABLE `training_records` (
	`id` text PRIMARY KEY NOT NULL,
	`training_program` text NOT NULL,
	`employee_id` text NOT NULL,
	`completion_status` text NOT NULL,
	`completion_date` text,
	`training_hours` real NOT NULL,
	`assessment_score` real,
	`department` text NOT NULL,
	`data_source` text DEFAULT 'imported' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `training_employee_idx` ON `training_records` (`employee_id`);--> statement-breakpoint
CREATE INDEX `training_department_idx` ON `training_records` (`department`);--> statement-breakpoint
CREATE INDEX `training_date_idx` ON `training_records` (`completion_date`);