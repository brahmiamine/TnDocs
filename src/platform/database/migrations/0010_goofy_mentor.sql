ALTER TABLE `signature_assets` MODIFY COLUMN `data_ciphertext` mediumtext NOT NULL;--> statement-breakpoint
ALTER TABLE `signature_participants` MODIFY COLUMN `signature_ciphertext` mediumtext;