CREATE TABLE `data_import_rows` (
	`job_id` text NOT NULL,
	`row_key` text NOT NULL,
	`payload_json` text NOT NULL,
	PRIMARY KEY(`job_id`, `row_key`)
);
--> statement-breakpoint
DROP INDEX `data_imports_domain_idx`;--> statement-breakpoint
ALTER TABLE `data_imports` ADD `mode` text DEFAULT 'merge' NOT NULL;--> statement-breakpoint
ALTER TABLE `data_imports` ADD `total_rows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `data_imports` ADD `inserted_rows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `data_imports` ADD `updated_rows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `data_imports` ADD `deleted_rows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `data_imports` ADD `error_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `data_imports` ADD `error_summary` text;--> statement-breakpoint
ALTER TABLE `data_imports` ADD `imported_by_email` text;--> statement-breakpoint
ALTER TABLE `data_imports` ADD `completed_at` text;--> statement-breakpoint
CREATE INDEX `data_imports_domain_date_idx` ON `data_imports` (`domain`,`imported_at`);--> statement-breakpoint
CREATE INDEX `data_imports_status_date_idx` ON `data_imports` (`status`,`imported_at`);
