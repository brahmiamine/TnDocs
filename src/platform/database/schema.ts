import { mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

/** Initial platform table. Business modules own their tables in separate schema files. */
export const platformMetadata = mysqlTable("platform_metadata", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: varchar("value", { length: 255 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
