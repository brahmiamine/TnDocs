import { customType, foreignKey, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { personalDossierItems, personalDossiers, users } from "@/platform/database/schema";
import { procedureGuideVersions } from "@/modules/procedures/db-schema";
const id = (name: string) => varchar(name, { length: 36 });
const mediumtext = customType<{ data: string }>({ dataType: () => "mediumtext" });

/** Immutable provenance: a newly published procedure never rewrites this dossier. */
export const dossierProcedureRefs = mysqlTable("dossier_procedure_refs", {
  dossierId: id("dossier_id").primaryKey().references(() => personalDossiers.id, { onDelete: "cascade" }),
  guideVersionId: id("guide_version_id").notNull(),
  nodeId: varchar("node_id", { length: 60 }).notNull(), country: varchar("country", { length: 2 }).notNull(),
  locale: mysqlEnum("locale", ["fr", "ar"]).notNull(), createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [foreignKey({ name: "dossier_procedure_guide_fk", columns: [table.guideVersionId], foreignColumns: [procedureGuideVersions.id] }).onDelete("restrict")]);
export const dossierProcedureItems = mysqlTable("dossier_procedure_items", {
  itemId: id("item_id").primaryKey().references(() => personalDossierItems.id, { onDelete: "cascade" }),
  ruleKey: varchar("rule_key", { length: 60 }).notNull(), sourceIds: json("source_ids").$type<string[]>().notNull(),
});
/** Membership/document revisions are encrypted and pinned at grant creation. */
export const dossierShareGrants = mysqlTable("dossier_share_grants", {
  id: id("id").primaryKey(), dossierId: id("dossier_id").notNull().references(() => personalDossiers.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(), recipientHash: varchar("recipient_hash", { length: 64 }).notNull(),
  recipientCiphertext: text("recipient_ciphertext").notNull(), snapshotCiphertext: mediumtext("snapshot_ciphertext").notNull(),
  encryptionKeyVersion: varchar("encryption_key_version", { length: 8 }).notNull(), canDownload: int("can_download").notNull().default(0),
  expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(), revokedAt: timestamp("revoked_at", { fsp: 3 }), createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("dossier_share_token_unique").on(table.tokenHash), index("dossier_share_owner_idx").on(table.dossierId, table.createdAt)]);
export const dossierShareEvents = mysqlTable("dossier_share_events", {
  id: id("id").primaryKey(), shareId: id("share_id").notNull().references(() => dossierShareGrants.id, { onDelete: "cascade" }),
  actorId: id("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: mysqlEnum("action", ["created", "viewed", "downloaded", "exported", "revoked"]).notNull(),
  itemId: id("item_id"), createdAt: timestamp("created_at").notNull().defaultNow(),
});
