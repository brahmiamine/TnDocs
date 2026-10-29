CREATE TABLE `personal_dossier_items` (
	`id` varchar(36) NOT NULL,
	`dossier_id` varchar(36) NOT NULL,
	`linked_document_id` varchar(36),
	`kind` enum('checklist','document') NOT NULL DEFAULT 'checklist',
	`status` enum('missing','added','reviewed','expired') NOT NULL DEFAULT 'missing',
	`required` int NOT NULL DEFAULT 1,
	`label_ciphertext` text NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personal_dossier_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `personal_dossiers` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`title_ciphertext` text NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`status` enum('open','archived','trash') NOT NULL DEFAULT 'open',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personal_dossiers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `personal_dossier_items` ADD CONSTRAINT `fk_dossier_item_parent` FOREIGN KEY (`dossier_id`) REFERENCES `personal_dossiers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `personal_dossier_items` ADD CONSTRAINT `fk_dossier_item_document` FOREIGN KEY (`linked_document_id`) REFERENCES `personal_documents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `personal_dossiers` ADD CONSTRAINT `fk_dossier_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `personal_dossier_items_dossier_idx` ON `personal_dossier_items` (`dossier_id`);--> statement-breakpoint
CREATE INDEX `personal_dossier_items_document_idx` ON `personal_dossier_items` (`linked_document_id`);--> statement-breakpoint
CREATE INDEX `personal_dossiers_owner_updated_idx` ON `personal_dossiers` (`owner_user_id`,`updated_at`);