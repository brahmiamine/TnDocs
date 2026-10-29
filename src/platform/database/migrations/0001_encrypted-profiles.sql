CREATE TABLE `person_profiles` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`relationship` enum('self','spouse','child','parent','relative') NOT NULL,
	`authorization_basis` enum('self','consent','legal_authority') NOT NULL,
	`authorization_confirmed_at` timestamp NOT NULL,
	`data_ciphertext` text NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `person_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `person_profiles` ADD CONSTRAINT `person_profiles_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `person_profiles_owner_id_idx` ON `person_profiles` (`owner_user_id`);