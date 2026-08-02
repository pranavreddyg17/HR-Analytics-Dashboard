ALTER TABLE `workflow_requests` ADD `priority` text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_requests` ADD `owner_email` text;--> statement-breakpoint
ALTER TABLE `workflow_requests` ADD `due_at` text;--> statement-breakpoint
ALTER TABLE `workflow_requests` ADD `next_action` text;--> statement-breakpoint
ALTER TABLE `workflow_requests` ADD `source_entity_type` text;--> statement-breakpoint
ALTER TABLE `workflow_requests` ADD `source_entity_id` text;--> statement-breakpoint
ALTER TABLE `workflow_requests` ADD `assigned_at` text;--> statement-breakpoint
ALTER TABLE `workflow_requests` ADD `blocked_reason` text;--> statement-breakpoint
ALTER TABLE `workflow_requests` ADD `confidentiality_level` text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_requests` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `workflow_requests` ADD `completion_notes` text;--> statement-breakpoint
CREATE INDEX `workflow_owner_status_idx` ON `workflow_requests` (`owner_email`,`status`);--> statement-breakpoint
CREATE INDEX `workflow_due_status_idx` ON `workflow_requests` (`due_at`,`status`);--> statement-breakpoint
PRAGMA optimize;
