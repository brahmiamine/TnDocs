import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import { personalDocumentShares, users } from "@/platform/database/schema";
const id = (name: string) => varchar(name, { length: 36 });
/** Existing shares without this binding are intentionally inaccessible. */
export const recipientShareGrants = mysqlTable("recipient_share_grants", {
  shareId: id("share_id").primaryKey().references(() => personalDocumentShares.id, { onDelete: "cascade" }),
  recipientHash: varchar("recipient_hash", { length: 64 }).notNull(),
  recipientCiphertext: text("recipient_ciphertext").notNull(),
  encryptionKeyVersion: varchar("encryption_key_version", { length: 8 }).notNull(),
  canView: int("can_view").notNull().default(1),
  canCopy: int("can_copy").notNull().default(0),
  canEdit: int("can_edit").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("recipient_share_grants_recipient_idx").on(table.recipientHash)]);
export const recipientShareEvents = mysqlTable("recipient_share_events", {
  id: id("id").primaryKey(),
  shareId: id("share_id").notNull().references(() => personalDocumentShares.id, { onDelete: "cascade" }),
  actorId: id("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: mysqlEnum("action", ["viewed", "copied", "edited"]).notNull(),
  revision: int("revision").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("recipient_share_events_share_created_idx").on(table.shareId, table.createdAt)]);
