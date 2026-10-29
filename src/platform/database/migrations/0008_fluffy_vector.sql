CREATE TABLE `community_submission_events` (
	`id` varchar(36) NOT NULL,
	`submission_id` varchar(36) NOT NULL,
	`actor_user_id` varchar(36),
	`status` enum('submitted','triaged','revision_requested','accepted','rejected','closed') NOT NULL,
	`comment_ciphertext` text,
	`encryption_key_version` varchar(8),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `community_submission_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `community_submissions` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`kind` enum('support','template_request','proposal','report') NOT NULL,
	`locale` enum('fr','ar') NOT NULL,
	`status` enum('submitted','triaged','revision_requested','accepted','rejected','closed') NOT NULL DEFAULT 'submitted',
	`content_ciphertext` text NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`privacy_confirmed_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `community_submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_state_metadata` (
	`document_id` varchar(36) NOT NULL,
	`favorite` int NOT NULL DEFAULT 0,
	`pre_archive_status` enum('draft','finalized') NOT NULL DEFAULT 'draft',
	`pre_trash_status` enum('draft','finalized','archived') NOT NULL DEFAULT 'draft',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `document_state_metadata_document_id` PRIMARY KEY(`document_id`)
);
--> statement-breakpoint
CREATE TABLE `email_change_challenges` (
	`token_hash` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`new_email` varchar(320) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	CONSTRAINT `email_change_challenges_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `identity_audit_events` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`event` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `identity_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_queue` (
	`id` varchar(36) NOT NULL,
	`kind` varchar(80) NOT NULL,
	`deduplication_key` varchar(180) NOT NULL,
	`owner_user_id` varchar(36),
	`payload` json NOT NULL,
	`status` enum('pending','leased','done','retrying','dead','cancelled') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`max_attempts` int NOT NULL DEFAULT 5,
	`available_at` timestamp(3) NOT NULL DEFAULT (now()),
	`lease_token` varchar(36),
	`lease_expires_at` timestamp(3),
	`result` json,
	`error_code` varchar(80),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_queue_id` PRIMARY KEY(`id`),
	CONSTRAINT `jobs_dedupe_unique` UNIQUE(`deduplication_key`)
);
--> statement-breakpoint
CREATE TABLE `legal_publications` (
	`slug` enum('mentions','confidentialite','conditions','cookies') NOT NULL,
	`locale` enum('fr','ar') NOT NULL,
	`version_id` varchar(36) NOT NULL,
	`published_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `legal_publications_slug_locale_pk` PRIMARY KEY(`slug`,`locale`)
);
--> statement-breakpoint
CREATE TABLE `legal_versions` (
	`id` varchar(36) NOT NULL,
	`slug` enum('mentions','confidentialite','conditions','cookies') NOT NULL,
	`locale` enum('fr','ar') NOT NULL,
	`version` int NOT NULL,
	`status` enum('draft','reviewed','published') NOT NULL DEFAULT 'draft',
	`title` varchar(240) NOT NULL,
	`body` text NOT NULL,
	`created_by` varchar(36),
	`reviewed_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`reviewed_at` timestamp,
	`published_at` timestamp,
	CONSTRAINT `legal_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `legal_slug_locale_version_unique` UNIQUE(`slug`,`locale`,`version`)
);
--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`notification_id` varchar(36) NOT NULL,
	`subscription_id` varchar(36) NOT NULL,
	`delivered_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_deliveries_notification_id_subscription_id_pk` PRIMARY KEY(`notification_id`,`subscription_id`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`owner_user_id` varchar(36) NOT NULL,
	`category` enum('security','document','catalogue','reminder','support') NOT NULL,
	`in_app` int NOT NULL DEFAULT 1,
	`email` int NOT NULL DEFAULT 0,
	`push` int NOT NULL DEFAULT 0,
	`push_consented_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_owner_user_id_category_pk` PRIMARY KEY(`owner_user_id`,`category`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`event` enum('security_changed','document_ready','publication_updated','reminder_due','support_replied','contribution_reviewed') NOT NULL,
	`resource_id` varchar(36),
	`dedupe_key` varchar(180) NOT NULL,
	`read_at` timestamp,
	`email_delivered_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_owner_dedupe_unique` UNIQUE(`owner_user_id`,`dedupe_key`)
);
--> statement-breakpoint
CREATE TABLE `oauth_flows` (
	`state_hash` varchar(64) NOT NULL,
	`verifier` varchar(128) NOT NULL,
	`locale` varchar(2) NOT NULL,
	`link_user_id` varchar(36),
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	CONSTRAINT `oauth_flows_state_hash` PRIMARY KEY(`state_hash`)
);
--> statement-breakpoint
CREATE TABLE `oauth_identities` (
	`provider` varchar(20) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `oauth_identities_provider_subject_pk` PRIMARY KEY(`provider`,`subject`),
	CONSTRAINT `oauth_user_provider_unique` UNIQUE(`user_id`,`provider`)
);
--> statement-breakpoint
CREATE TABLE `private_document_models` (
	`document_id` varchar(36) NOT NULL,
	`source_template_id` varchar(36),
	`source_version` int NOT NULL,
	`content_ciphertext` mediumtext NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `private_document_models_document_id` PRIMARY KEY(`document_id`)
);
--> statement-breakpoint
CREATE TABLE `private_template_versions` (
	`id` varchar(36) NOT NULL,
	`template_id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`content_ciphertext` mediumtext NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `private_template_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `private_template_versions_version_unique` UNIQUE(`template_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `private_templates` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`current_version` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `private_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `procedure_guide_versions` (
	`id` varchar(36) NOT NULL,
	`guide_id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`content` json NOT NULL,
	`reviewed_by` varchar(36),
	`verified_at` timestamp NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `procedure_guide_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `procedure_version_unique` UNIQUE(`guide_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `procedure_guides` (
	`id` varchar(36) NOT NULL,
	`current_version` int NOT NULL DEFAULT 0,
	`published_version` int,
	`created_by` varchar(36),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `procedure_guides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`endpoint_hash` varchar(64) NOT NULL,
	`subscription_ciphertext` text NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`consented_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_owner_endpoint_unique` UNIQUE(`owner_user_id`,`endpoint_hash`)
);
--> statement-breakpoint
CREATE TABLE `recipient_share_events` (
	`id` varchar(36) NOT NULL,
	`share_id` varchar(36) NOT NULL,
	`actor_id` varchar(36),
	`action` enum('viewed','copied','edited') NOT NULL,
	`revision` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recipient_share_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipient_share_grants` (
	`share_id` varchar(36) NOT NULL,
	`recipient_hash` varchar(64) NOT NULL,
	`recipient_ciphertext` text NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`can_view` int NOT NULL DEFAULT 1,
	`can_copy` int NOT NULL DEFAULT 0,
	`can_edit` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `recipient_share_grants_share_id` PRIMARY KEY(`share_id`)
);
--> statement-breakpoint
CREATE TABLE `identity_recovery_codes` (
	`user_id` varchar(36) NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`used_at` timestamp,
	CONSTRAINT `identity_recovery_codes_user_id_code_hash_pk` PRIMARY KEY(`user_id`,`code_hash`)
);
--> statement-breakpoint
CREATE TABLE `registered_sources` (
	`id` varchar(36) NOT NULL,
	`name` varchar(180) NOT NULL,
	`url` varchar(2048) NOT NULL,
	`canonical_url_hash` varchar(64) NOT NULL,
	`reuse_permission` enum('pending','allowed','no_reproduction','forbidden') NOT NULL DEFAULT 'pending',
	`approved` int NOT NULL DEFAULT 0,
	`active` int NOT NULL DEFAULT 1,
	`frequency_days` int NOT NULL DEFAULT 7,
	`next_check_at` timestamp NOT NULL DEFAULT (now()),
	`checked_at` timestamp,
	`latest_hash` varchar(64),
	`error_code` varchar(80),
	`created_by` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `registered_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `registered_source_url_unique` UNIQUE(`canonical_url_hash`)
);
--> statement-breakpoint
CREATE TABLE `session_factors` (
	`session_id` varchar(36) NOT NULL,
	`verified_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `session_factors_session_id` PRIMARY KEY(`session_id`)
);
--> statement-breakpoint
CREATE TABLE `signature_assets` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`kind` enum('signature','stamp') NOT NULL,
	`data_ciphertext` text NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signature_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signature_events` (
	`id` varchar(36) NOT NULL,
	`request_id` varchar(36) NOT NULL,
	`participant_id` varchar(36),
	`event_type` enum('invited','verified','viewed','signed','declined','revoked') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signature_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signature_participants` (
	`id` varchar(36) NOT NULL,
	`request_id` varchar(36) NOT NULL,
	`email_ciphertext` text NOT NULL,
	`encryption_key_version` varchar(8) NOT NULL,
	`invite_token_hash` varchar(64) NOT NULL,
	`verification_token_hash` varchar(64),
	`verification_expires_at` timestamp,
	`verification_used_at` timestamp,
	`access_token_hash` varchar(64),
	`verified_at` timestamp,
	`status` enum('invited','viewed','signed','declined') NOT NULL DEFAULT 'invited',
	`signature_ciphertext` text,
	`signed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signature_participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `signature_participants_invite_unique` UNIQUE(`invite_token_hash`),
	CONSTRAINT `signature_participants_verification_unique` UNIQUE(`verification_token_hash`),
	CONSTRAINT `signature_participants_access_unique` UNIQUE(`access_token_hash`)
);
--> statement-breakpoint
CREATE TABLE `signature_requests` (
	`id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`document_id` varchar(36) NOT NULL,
	`revision` int NOT NULL,
	`content_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signature_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `source_observations` (
	`id` varchar(36) NOT NULL,
	`source_id` varchar(36) NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`previous_hash` varchar(64),
	`mime_type` varchar(180) NOT NULL,
	`byte_size` int NOT NULL,
	`text_preview` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`review_note` text,
	`reviewed_by` varchar(36),
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `source_observations_id` PRIMARY KEY(`id`),
	CONSTRAINT `source_observation_hash_unique` UNIQUE(`source_id`,`sha256`)
);
--> statement-breakpoint
CREATE TABLE `system_audit_events` (
	`id` varchar(36) NOT NULL,
	`actor_user_id` varchar(36),
	`action` enum('settings_changed','legal_created','legal_reviewed','legal_published') NOT NULL,
	`resource_id` varchar(36) NOT NULL,
	`revision` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`key` varchar(36) NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`values` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `trash_markers` (
	`resource_kind` enum('document','dossier') NOT NULL,
	`resource_id` varchar(36) NOT NULL,
	`owner_user_id` varchar(36) NOT NULL,
	`trashed_at` timestamp(3) NOT NULL,
	`purge_after` timestamp(3) NOT NULL,
	CONSTRAINT `trash_markers_resource_kind_resource_id_pk` PRIMARY KEY(`resource_kind`,`resource_id`)
);
--> statement-breakpoint
CREATE TABLE `user_second_factors` (
	`user_id` varchar(36) NOT NULL,
	`secret_ciphertext` text NOT NULL,
	`enabled_at` timestamp,
	`last_used_step` int NOT NULL DEFAULT -1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_second_factors_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `document_revisions` MODIFY COLUMN `content_ciphertext` mediumtext NOT NULL;--> statement-breakpoint
ALTER TABLE `community_submission_events` ADD CONSTRAINT `community_submission_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_submission_events` ADD CONSTRAINT `community_events_submission_fk` FOREIGN KEY (`submission_id`) REFERENCES `community_submissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `community_submissions` ADD CONSTRAINT `community_submissions_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_state_metadata` ADD CONSTRAINT `document_state_metadata_document_id_personal_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `personal_documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `email_change_challenges` ADD CONSTRAINT `email_change_challenges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `identity_audit_events` ADD CONSTRAINT `identity_audit_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `legal_publications` ADD CONSTRAINT `legal_publications_version_id_legal_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `legal_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `legal_versions` ADD CONSTRAINT `legal_versions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `legal_versions` ADD CONSTRAINT `legal_versions_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `notification_deliveries_notification_id_notifications_id_fk` FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_deliveries` ADD CONSTRAINT `notification_deliveries_subscription_id_push_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oauth_flows` ADD CONSTRAINT `oauth_flows_link_user_id_users_id_fk` FOREIGN KEY (`link_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oauth_identities` ADD CONSTRAINT `oauth_identities_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `private_document_models` ADD CONSTRAINT `private_document_models_document_id_personal_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `personal_documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `private_document_models` ADD CONSTRAINT `private_doc_source_template_fk` FOREIGN KEY (`source_template_id`) REFERENCES `private_templates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `private_template_versions` ADD CONSTRAINT `private_template_versions_template_id_private_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `private_templates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `private_templates` ADD CONSTRAINT `private_templates_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procedure_guide_versions` ADD CONSTRAINT `procedure_guide_versions_guide_id_procedure_guides_id_fk` FOREIGN KEY (`guide_id`) REFERENCES `procedure_guides`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procedure_guide_versions` ADD CONSTRAINT `procedure_guide_versions_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `procedure_guides` ADD CONSTRAINT `procedure_guides_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD CONSTRAINT `push_subscriptions_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipient_share_events` ADD CONSTRAINT `recipient_share_events_share_id_personal_document_shares_id_fk` FOREIGN KEY (`share_id`) REFERENCES `personal_document_shares`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipient_share_events` ADD CONSTRAINT `recipient_share_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipient_share_grants` ADD CONSTRAINT `recipient_share_grants_share_id_personal_document_shares_id_fk` FOREIGN KEY (`share_id`) REFERENCES `personal_document_shares`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `identity_recovery_codes` ADD CONSTRAINT `identity_recovery_codes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `registered_sources` ADD CONSTRAINT `registered_sources_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_factors` ADD CONSTRAINT `session_factors_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signature_assets` ADD CONSTRAINT `signature_assets_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signature_events` ADD CONSTRAINT `signature_events_request_id_signature_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `signature_requests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signature_events` ADD CONSTRAINT `signature_events_participant_id_signature_participants_id_fk` FOREIGN KEY (`participant_id`) REFERENCES `signature_participants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signature_participants` ADD CONSTRAINT `signature_participants_request_id_signature_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `signature_requests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signature_requests` ADD CONSTRAINT `signature_requests_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signature_requests` ADD CONSTRAINT `signature_requests_document_id_personal_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `personal_documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `source_observations` ADD CONSTRAINT `source_observations_source_id_registered_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `registered_sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `source_observations` ADD CONSTRAINT `source_observations_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `system_audit_events` ADD CONSTRAINT `system_audit_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trash_markers` ADD CONSTRAINT `trash_markers_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_second_factors` ADD CONSTRAINT `user_second_factors_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `community_events_submission_idx` ON `community_submission_events` (`submission_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `community_owner_updated_idx` ON `community_submissions` (`owner_user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `community_status_created_idx` ON `community_submissions` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_change_user_idx` ON `email_change_challenges` (`user_id`);--> statement-breakpoint
CREATE INDEX `identity_audit_user_time_idx` ON `identity_audit_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_claim_idx` ON `job_queue` (`status`,`available_at`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `notifications_owner_created_idx` ON `notifications` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `oauth_flows_expiry_idx` ON `oauth_flows` (`expires_at`);--> statement-breakpoint
CREATE INDEX `private_templates_owner_updated_idx` ON `private_templates` (`owner_user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `procedure_version_guide_idx` ON `procedure_guide_versions` (`guide_id`);--> statement-breakpoint
CREATE INDEX `recipient_share_events_share_created_idx` ON `recipient_share_events` (`share_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `recipient_share_grants_recipient_idx` ON `recipient_share_grants` (`recipient_hash`);--> statement-breakpoint
CREATE INDEX `registered_source_due_idx` ON `registered_sources` (`active`,`next_check_at`);--> statement-breakpoint
CREATE INDEX `signature_assets_owner_idx` ON `signature_assets` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `signature_events_request_idx` ON `signature_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `signature_participants_request_idx` ON `signature_participants` (`request_id`);--> statement-breakpoint
CREATE INDEX `signature_requests_document_idx` ON `signature_requests` (`document_id`);--> statement-breakpoint
CREATE INDEX `source_observation_review_idx` ON `source_observations` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `system_audit_created_idx` ON `system_audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `trash_markers_due_idx` ON `trash_markers` (`purge_after`);