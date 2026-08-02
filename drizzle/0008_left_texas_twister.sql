CREATE TABLE `hiring_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`requisition_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`stage` text DEFAULT 'Applied' NOT NULL,
	`source` text NOT NULL,
	`applied_at` text NOT NULL,
	`owner_email` text NOT NULL,
	`next_step` text NOT NULL,
	`next_step_due_at` text,
	`notes` text,
	`rejected_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hiring_candidates_requisition_stage_idx` ON `hiring_candidates` (`requisition_id`,`stage`);--> statement-breakpoint
CREATE INDEX `hiring_candidates_due_stage_idx` ON `hiring_candidates` (`next_step_due_at`,`stage`);--> statement-breakpoint
CREATE UNIQUE INDEX `hiring_candidates_requisition_email_idx` ON `hiring_candidates` (`requisition_id`,`email`);