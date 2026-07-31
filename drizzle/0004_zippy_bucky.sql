CREATE TABLE `ai_workflow_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`employee_ids_json` text DEFAULT '[]' NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_by_email` text NOT NULL,
	`opened_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_workflow_creator_idx` ON `ai_workflow_drafts` (`created_by_email`);--> statement-breakpoint
CREATE INDEX `ai_workflow_status_idx` ON `ai_workflow_drafts` (`status`);