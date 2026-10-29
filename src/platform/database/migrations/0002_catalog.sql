CREATE TABLE `catalog_categories` (
	`id` varchar(36) NOT NULL,
	`parent_id` varchar(36),
	`slug` varchar(120) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `catalog_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `catalog_categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `catalog_category_translations` (
	`category_id` varchar(36) NOT NULL,
	`locale` enum('fr','ar') NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` varchar(500) NOT NULL DEFAULT '',
	CONSTRAINT `catalog_category_translations_category_id_locale_pk` PRIMARY KEY(`category_id`,`locale`)
);
--> statement-breakpoint
CREATE TABLE `catalog_organization_translations` (
	`organization_id` varchar(36) NOT NULL,
	`locale` enum('fr','ar') NOT NULL,
	`name` varchar(180) NOT NULL,
	`description` varchar(500) NOT NULL DEFAULT '',
	CONSTRAINT `catalog_organization_translations_organization_id_locale_pk` PRIMARY KEY(`organization_id`,`locale`)
);
--> statement-breakpoint
CREATE TABLE `catalog_organizations` (
	`id` varchar(36) NOT NULL,
	`slug` varchar(120) NOT NULL,
	`official_url` varchar(2048),
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `catalog_organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `catalog_organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `catalog_template_categories` (
	`version_id` varchar(36) NOT NULL,
	`category_id` varchar(36) NOT NULL,
	CONSTRAINT `catalog_template_categories_version_id_category_id_pk` PRIMARY KEY(`version_id`,`category_id`)
);
--> statement-breakpoint
CREATE TABLE `catalog_template_sources` (
	`id` varchar(36) NOT NULL,
	`version_id` varchar(36) NOT NULL,
	`source_name` varchar(180) NOT NULL,
	`source_url` varchar(2048) NOT NULL,
	`official` int NOT NULL DEFAULT 0,
	`reuse_permission` enum('pending','allowed','no_reproduction','forbidden') NOT NULL DEFAULT 'pending',
	`checked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `catalog_template_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `catalog_template_translations` (
	`version_id` varchar(36) NOT NULL,
	`locale` enum('fr','ar') NOT NULL,
	`title` varchar(240) NOT NULL,
	`summary` varchar(1000) NOT NULL,
	`instructions` text NOT NULL,
	`body` text NOT NULL,
	CONSTRAINT `catalog_template_translations_version_id_locale_pk` PRIMARY KEY(`version_id`,`locale`)
);
--> statement-breakpoint
CREATE TABLE `catalog_template_versions` (
	`id` varchar(36) NOT NULL,
	`template_id` varchar(36) NOT NULL,
	`version` int NOT NULL,
	`status` enum('draft','in_review','published','archived') NOT NULL DEFAULT 'draft',
	`form_schema` json,
	`document_content` json,
	`created_by` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `catalog_template_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `catalog_template_versions_template_version_unique` UNIQUE(`template_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `catalog_templates` (
	`id` varchar(36) NOT NULL,
	`status` enum('draft','in_review','published','archived') NOT NULL DEFAULT 'draft',
	`document_type` enum('editable','official','informational') NOT NULL,
	`organization_id` varchar(36),
	`published_version_id` varchar(36),
	`created_by` varchar(36) NOT NULL,
	`published_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `catalog_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `role` enum('user','moderator','admin') DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `catalog_categories` ADD CONSTRAINT `fk_cat_parent` FOREIGN KEY (`parent_id`) REFERENCES `catalog_categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_category_translations` ADD CONSTRAINT `fk_cat_tr_category` FOREIGN KEY (`category_id`) REFERENCES `catalog_categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_organization_translations` ADD CONSTRAINT `fk_cat_org_translation` FOREIGN KEY (`organization_id`) REFERENCES `catalog_organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_template_categories` ADD CONSTRAINT `fk_cat_template_cat_version` FOREIGN KEY (`version_id`) REFERENCES `catalog_template_versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_template_categories` ADD CONSTRAINT `fk_cat_template_category` FOREIGN KEY (`category_id`) REFERENCES `catalog_categories`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_template_sources` ADD CONSTRAINT `fk_cat_source_version` FOREIGN KEY (`version_id`) REFERENCES `catalog_template_versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_template_translations` ADD CONSTRAINT `fk_cat_translation_version` FOREIGN KEY (`version_id`) REFERENCES `catalog_template_versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_template_versions` ADD CONSTRAINT `fk_cat_version_template` FOREIGN KEY (`template_id`) REFERENCES `catalog_templates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_template_versions` ADD CONSTRAINT `fk_cat_version_author` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_templates` ADD CONSTRAINT `fk_cat_template_org` FOREIGN KEY (`organization_id`) REFERENCES `catalog_organizations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_templates` ADD CONSTRAINT `fk_cat_template_author` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `catalog_categories_parent_id_idx` ON `catalog_categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `catalog_template_categories_category_idx` ON `catalog_template_categories` (`category_id`);--> statement-breakpoint
CREATE INDEX `catalog_template_sources_version_id_idx` ON `catalog_template_sources` (`version_id`);--> statement-breakpoint
CREATE INDEX `catalog_template_versions_template_id_idx` ON `catalog_template_versions` (`template_id`);--> statement-breakpoint
CREATE INDEX `catalog_templates_status_published_idx` ON `catalog_templates` (`status`,`published_at`);
--> statement-breakpoint
INSERT INTO `catalog_categories` (`id`, `slug`, `sort_order`, `active`) VALUES
('00000000-0000-4000-8000-000000000001', 'resiliations', 10, 1),
('00000000-0000-4000-8000-000000000002', 'procurations', 20, 1),
('00000000-0000-4000-8000-000000000003', 'declarations', 30, 1),
('00000000-0000-4000-8000-000000000004', 'reclamations', 40, 1),
('00000000-0000-4000-8000-000000000005', 'emploi', 50, 1),
('00000000-0000-4000-8000-000000000006', 'logement', 60, 1);
--> statement-breakpoint
INSERT INTO `catalog_category_translations` (`category_id`, `locale`, `name`, `description`) VALUES
('00000000-0000-4000-8000-000000000001', 'fr', 'Résiliations', 'Mettre fin à un contrat ou à un abonnement.'),
('00000000-0000-4000-8000-000000000001', 'ar', 'إنهاء الاشتراكات', 'إجراءات إنهاء عقد أو اشتراك.'),
('00000000-0000-4000-8000-000000000002', 'fr', 'Procurations', 'Autoriser une personne à agir en votre nom.'),
('00000000-0000-4000-8000-000000000002', 'ar', 'التوكيلات', 'تفويض شخص للتصرف نيابة عنك.'),
('00000000-0000-4000-8000-000000000003', 'fr', 'Déclarations', 'Formaliser une déclaration ou un signalement.'),
('00000000-0000-4000-8000-000000000003', 'ar', 'التصاريح', 'توثيق تصريح أو إشعار.'),
('00000000-0000-4000-8000-000000000004', 'fr', 'Réclamations', 'Présenter une réclamation ou demander un réexamen.'),
('00000000-0000-4000-8000-000000000004', 'ar', 'الشكاوى', 'تقديم شكوى أو طلب إعادة النظر.'),
('00000000-0000-4000-8000-000000000005', 'fr', 'Emploi', 'Préparer des démarches liées au travail.'),
('00000000-0000-4000-8000-000000000005', 'ar', 'العمل', 'تحضير الإجراءات المتعلقة بالعمل.'),
('00000000-0000-4000-8000-000000000006', 'fr', 'Logement', 'Préparer des démarches liées au logement.'),
('00000000-0000-4000-8000-000000000006', 'ar', 'السكن', 'تحضير الإجراءات المتعلقة بالسكن.');
