CREATE TABLE `action_status` (
	`action_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
