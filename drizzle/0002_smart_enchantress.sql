CREATE TABLE `employee_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_id` text NOT NULL,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`changes_json` text,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `employee_activity_employee_idx` ON `employee_activity` (`employee_id`);--> statement-breakpoint
CREATE INDEX `employee_activity_created_idx` ON `employee_activity` (`created_at`);--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `employees` ADD `first_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `last_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `preferred_name` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `work_email` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `manager_id` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `employment_type` text DEFAULT 'Full-time' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `employees` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- SQLite does not allow a non-constant CURRENT_TIMESTAMP default when adding a
-- column to an existing table. Runtime writes populate this field explicitly.
ALTER TABLE `employees` ADD `created_at` text;--> statement-breakpoint
CREATE INDEX `employees_status_idx` ON `employees` (`employment_status`);--> statement-breakpoint
CREATE INDEX `employees_manager_idx` ON `employees` (`manager_id`);--> statement-breakpoint
CREATE INDEX `employees_work_email_idx` ON `employees` (`work_email`);
