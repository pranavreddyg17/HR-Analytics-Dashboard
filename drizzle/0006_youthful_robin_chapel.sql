CREATE TABLE `ai_conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`position` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tools_json` text,
	`context_json` text,
	`data_mode` text,
	`provider` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_conversation_messages_conversation_created_idx` ON `ai_conversation_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_conversation_messages_conversation_position_idx` ON `ai_conversation_messages` (`conversation_id`,`position`);--> statement-breakpoint
CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_email` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_conversations_user_updated_idx` ON `ai_conversations` (`user_email`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;
