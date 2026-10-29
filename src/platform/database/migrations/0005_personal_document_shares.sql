CREATE TABLE `personal_document_share_events` (
	`id` varchar(36) NOT NULL,
	`share_id` varchar(36) NOT NULL,
	`event_type` enum('created','revoked','accessed') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `personal_document_share_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `personal_document_shares` (
	`id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`revision` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`permission` enum('view') NOT NULL DEFAULT 'view',
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `personal_document_shares_id` PRIMARY KEY(`id`),
	CONSTRAINT `personal_document_shares_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `personal_document_share_events` ADD CONSTRAINT `fk_document_share_event` FOREIGN KEY (`share_id`) REFERENCES `personal_document_shares`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `personal_document_shares` ADD CONSTRAINT `fk_document_share_parent` FOREIGN KEY (`document_id`) REFERENCES `personal_documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `personal_document_share_events_share_created_idx` ON `personal_document_share_events` (`share_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `personal_document_shares_document_created_idx` ON `personal_document_shares` (`document_id`,`created_at`);
