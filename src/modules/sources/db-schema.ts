import { index, int, longtext, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users } from "@/platform/database/schema";
export const registeredSources = mysqlTable("registered_sources", {
  id: varchar("id", { length: 36 }).primaryKey(), name: varchar("name", { length: 180 }).notNull(),
  url: varchar("url", { length: 2048 }).notNull(), canonicalUrlHash: varchar("canonical_url_hash", { length: 64 }).notNull(),
  reusePermission: mysqlEnum("reuse_permission", ["pending", "allowed", "no_reproduction", "forbidden"]).notNull().default("pending"),
  approved: int("approved").notNull().default(0), active: int("active").notNull().default(1),
  frequencyDays: int("frequency_days").notNull().default(7), nextCheckAt: timestamp("next_check_at").defaultNow().notNull(),
  checkedAt: timestamp("checked_at"), latestHash: varchar("latest_hash", { length: 64 }), errorCode: varchar("error_code", { length: 80 }),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("registered_source_url_unique").on(table.canonicalUrlHash), index("registered_source_due_idx").on(table.active, table.nextCheckAt)]);
export const sourceObservations = mysqlTable("source_observations", {
  id: varchar("id", { length: 36 }).primaryKey(), sourceId: varchar("source_id", { length: 36 }).notNull().references(() => registeredSources.id, { onDelete: "cascade" }),
  sha256: varchar("sha256", { length: 64 }).notNull(), previousHash: varchar("previous_hash", { length: 64 }),
  mimeType: varchar("mime_type", { length: 180 }).notNull(), byteSize: int("byte_size").notNull(),
  textPreview: text("text_preview").notNull(), extractedText: longtext("extracted_text"), originalStorageKey: varchar("original_storage_key", { length: 255 }), originalKeyVersion: varchar("original_key_version", { length: 8 }), status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  reviewNote: text("review_note"), reviewedBy: varchar("reviewed_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }), reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("source_observation_hash_unique").on(table.sourceId, table.sha256), index("source_observation_review_idx").on(table.status, table.createdAt)]);
