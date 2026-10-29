CREATE TABLE `search_configuration` (
	`key` varchar(30) NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`dictionary` json NOT NULL,
	`updated_by` varchar(36),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `search_configuration_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `search_daily_metrics` (
	`day` varchar(10) NOT NULL,
	`outcome` enum('matched','no_result') NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `search_daily_metrics_day_outcome_pk` PRIMARY KEY(`day`,`outcome`)
);
--> statement-breakpoint
ALTER TABLE `search_configuration` ADD CONSTRAINT `search_configuration_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;