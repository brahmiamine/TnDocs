import { index, mysqlEnum, mysqlTable, primaryKey, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "@/platform/database/schema";

export const trashMarkers = mysqlTable("trash_markers", {
  resourceKind: mysqlEnum("resource_kind", ["document", "dossier"]).notNull(),
  resourceId: varchar("resource_id", { length: 36 }).notNull(),
  ownerUserId: varchar("owner_user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  trashedAt: timestamp("trashed_at", { fsp: 3 }).notNull(),
  purgeAfter: timestamp("purge_after", { fsp: 3 }).notNull(),
}, (table) => [primaryKey({ columns: [table.resourceKind, table.resourceId] }), index("trash_markers_due_idx").on(table.purgeAfter)]);
