CREATE TABLE `workflow_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`employee_id` text,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`requested_by_email` text NOT NULL,
	`resolved_by_email` text,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_type_status_idx` ON `workflow_requests` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `workflow_employee_idx` ON `workflow_requests` (`employee_id`);--> statement-breakpoint
CREATE INDEX `workflow_requester_idx` ON `workflow_requests` (`requested_by_email`);