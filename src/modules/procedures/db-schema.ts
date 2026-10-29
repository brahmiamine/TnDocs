import { index, int, json, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users } from "@/platform/database/schema";
import type { Guide } from "./schema";
export const procedureGuides = mysqlTable("procedure_guides", {
  id: varchar("id", { length: 36 }).primaryKey(), currentVersion: int("current_version").notNull().default(0),
  publishedVersion: int("published_version"), createdBy: varchar("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export const procedureGuideVersions = mysqlTable("procedure_guide_versions", {
  id: varchar("id", { length: 36 }).primaryKey(), guideId: varchar("guide_id", { length: 36 }).notNull().references(() => procedureGuides.id, { onDelete: "cascade" }),
  version: int("version").notNull(), content: json("content").$type<Guide>().notNull(),
  reviewedBy: varchar("reviewed_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }), verifiedAt: timestamp("verified_at").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(), createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("procedure_version_unique").on(table.guideId, table.version), index("procedure_version_guide_idx").on(table.guideId)]);
