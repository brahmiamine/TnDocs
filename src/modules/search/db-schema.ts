import { int, json, mysqlEnum, mysqlTable, primaryKey, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "@/platform/database/schema";
import type { SearchDictionary } from "./policy";
export const searchConfiguration = mysqlTable("search_configuration", {
  key: varchar("key", { length: 30 }).primaryKey(), revision: int("revision").notNull().default(1),
  dictionary: json("dictionary").$type<SearchDictionary>().notNull(),
  updatedBy: varchar("updated_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export const searchDailyMetrics = mysqlTable("search_daily_metrics", {
  day: varchar("day", { length: 10 }).notNull(), outcome: mysqlEnum("outcome", ["matched", "no_result"]).notNull(), count: int("count").notNull().default(0),
}, table => [primaryKey({ columns: [table.day, table.outcome] })]);
