CREATE TABLE `stored_files` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`dossier_id` varchar(36) NOT NULL,
	`storage_key` varchar(255) NOT NULL,
	`mime_type` enum('application/pdf','image/jpeg','image/png') NOT NULL,
	`byte_size` int NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`scan_status` enum('clean') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stored_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `stored_files_storage_key_unique` UNIQUE(`storage_key`)
);
--> statement-breakpoint
ALTER TABLE `personal_dossier_items` MODIFY COLUMN `kind` enum('checklist','document','file') NOT NULL DEFAULT 'checklist';--> statement-breakpoint
ALTER TABLE `personal_dossier_items` ADD `stored_file_id` varchar(36);--> statement-breakpoint
ALTER TABLE `stored_files` ADD CONSTRAINT `fk_stored_file_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stored_files` ADD CONSTRAINT `fk_stored_file_dossier` FOREIGN KEY (`dossier_id`) REFERENCES `personal_dossiers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `stored_files_owner_idx` ON `stored_files` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `stored_files_dossier_idx` ON `stored_files` (`dossier_id`);--> statement-breakpoint
ALTER TABLE `personal_dossier_items` ADD CONSTRAINT `fk_dossier_item_file` FOREIGN KEY (`stored_file_id`) REFERENCES `stored_files`(`id`) ON DELETE set null ON UPDATE no action;
