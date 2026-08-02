CREATE TABLE IF NOT EXISTS `access_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`target_email` text NOT NULL,
	`details_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `access_audit_created_idx` ON `access_audit` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `access_audit_target_idx` ON `access_audit` (`target_email`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `app_users` (
	`email` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
DROP TABLE IF EXISTS `action_status`;
