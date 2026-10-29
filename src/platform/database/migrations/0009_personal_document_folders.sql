CREATE TABLE `personal_document_folders` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`name_ciphertext` text NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personal_document_folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `personal_documents` ADD `folder_id` varchar(36);--> statement-breakpoint
ALTER TABLE `personal_document_folders` ADD CONSTRAINT `personal_document_folders_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `personal_document_folders_owner_updated_idx` ON `personal_document_folders` (`owner_user_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `personal_documents` ADD CONSTRAINT `personal_documents_folder_id_personal_document_folders_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `personal_document_folders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `personal_documents_folder_idx` ON `personal_documents` (`folder_id`);