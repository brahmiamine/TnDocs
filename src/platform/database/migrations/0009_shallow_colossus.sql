CREATE TABLE `artifact_reservations` (
	`storage_key` varchar(255) NOT NULL,
	`job_id` varchar(36) NOT NULL,
	`lease_token` varchar(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `artifact_reservations_storage_key` PRIMARY KEY(`storage_key`)
);
--> statement-breakpoint
CREATE TABLE `dossier_procedure_items` (
	`item_id` varchar(36) NOT NULL,
	`rule_key` varchar(60) NOT NULL,
	`source_ids` json NOT NULL,
	CONSTRAINT `dossier_procedure_items_item_id` PRIMARY KEY(`item_id`)
);
--> statement-breakpoint
CREATE TABLE `dossier_procedure_refs` (
	`dossier_id` varchar(36) NOT NULL,
	`guide_version_id` varchar(36) NOT NULL,
	`node_id` varchar(60) NOT NULL,
	`country` varchar(2) NOT NULL,
	`locale` enum('fr','ar') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dossier_procedure_refs_dossier_id` PRIMARY KEY(`dossier_id`)
);
--> statement-breakpoint
CREATE TABLE `dossier_share_events` (
	`id` varchar(36) NOT NULL,
	`share_id` varchar(36) NOT NULL,
	`actor_id` varchar(36),
	`action` enum('created','viewed','downloaded','exported','revoked') NOT NULL,
	`item_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dossier_share_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dossier_share_grants` (
	`id` varchar(36) NOT NULL,
	`dossier_id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`recipient_hash` varchar(64) NOT NULL,
	`recipient_ciphertext` text NOT NULL,
	`snapshot_ciphertext` mediumtext NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`can_download` int NOT NULL DEFAULT 0,
	`expires_at` timestamp(3) NOT NULL,
	`revoked_at` timestamp(3),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dossier_share_grants_id` PRIMARY KEY(`id`),
	CONSTRAINT `dossier_share_token_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `catalog_template_versions` DROP FOREIGN KEY `fk_cat_version_author`;
--> statement-breakpoint
ALTER TABLE `catalog_templates` DROP FOREIGN KEY `fk_cat_template_author`;
--> statement-breakpoint
ALTER TABLE `document_revisions` DROP FOREIGN KEY `document_revisions_created_by_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `catalog_template_versions` MODIFY COLUMN `created_by` varchar(36);--> statement-breakpoint
ALTER TABLE `catalog_templates` MODIFY COLUMN `created_by` varchar(36);--> statement-breakpoint
ALTER TABLE `document_revisions` MODIFY COLUMN `created_by` varchar(36);--> statement-breakpoint
ALTER TABLE `source_observations` ADD `extracted_text` longtext;--> statement-breakpoint
ALTER TABLE `source_observations` ADD `original_storage_key` varchar(255);--> statement-breakpoint
ALTER TABLE `source_observations` ADD `original_key_version` varchar(8);--> statement-breakpoint
ALTER TABLE `dossier_procedure_items` ADD CONSTRAINT `dossier_procedure_items_item_id_personal_dossier_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `personal_dossier_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dossier_procedure_refs` ADD CONSTRAINT `dossier_procedure_refs_dossier_id_personal_dossiers_id_fk` FOREIGN KEY (`dossier_id`) REFERENCES `personal_dossiers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dossier_procedure_refs` ADD CONSTRAINT `dossier_procedure_guide_fk` FOREIGN KEY (`guide_version_id`) REFERENCES `procedure_guide_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dossier_share_events` ADD CONSTRAINT `dossier_share_events_share_id_dossier_share_grants_id_fk` FOREIGN KEY (`share_id`) REFERENCES `dossier_share_grants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dossier_share_events` ADD CONSTRAINT `dossier_share_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dossier_share_grants` ADD CONSTRAINT `dossier_share_grants_dossier_id_personal_dossiers_id_fk` FOREIGN KEY (`dossier_id`) REFERENCES `personal_dossiers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `artifact_reservation_age_idx` ON `artifact_reservations` (`created_at`);--> statement-breakpoint
CREATE INDEX `artifact_reservation_job_idx` ON `artifact_reservations` (`job_id`);--> statement-breakpoint
CREATE INDEX `dossier_share_owner_idx` ON `dossier_share_grants` (`dossier_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `catalog_template_versions` ADD CONSTRAINT `catalog_template_versions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_templates` ADD CONSTRAINT `catalog_templates_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_revisions` ADD CONSTRAINT `document_revisions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;