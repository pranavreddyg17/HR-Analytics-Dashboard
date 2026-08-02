CREATE TABLE `hiring_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`requisition_id` text NOT NULL,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`detail` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hiring_activity_requisition_created_idx` ON `hiring_activity` (`requisition_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `hiring_activity_entity_created_idx` ON `hiring_activity` (`entity_type`,`entity_id`,`created_at`);