CREATE TABLE `document_revisions` (
	`id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`revision` int NOT NULL,
	`content_ciphertext` text NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`created_by` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_revisions_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_revisions_document_revision_unique` UNIQUE(`document_id`,`revision`)
);
--> statement-breakpoint
CREATE TABLE `personal_documents` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`template_id` varchar(36),
	`template_version_id` varchar(36),
	`title` varchar(240) NOT NULL,
	`status` enum('draft','finalized','archived','trash') NOT NULL DEFAULT 'draft',
	`current_revision` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personal_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `document_revisions` ADD CONSTRAINT `document_revisions_document_id_personal_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `personal_documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_revisions` ADD CONSTRAINT `document_revisions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `personal_documents` ADD CONSTRAINT `personal_documents_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `personal_documents` ADD CONSTRAINT `personal_documents_template_id_catalog_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `catalog_templates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `document_revisions_created_idx` ON `document_revisions` (`document_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `personal_documents_owner_updated_idx` ON `personal_documents` (`owner_user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `personal_documents_template_id_idx` ON `personal_documents` (`template_id`);