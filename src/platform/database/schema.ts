import { int, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

const id = (name: string) => varchar(name, { length: 36 });

/** Initial platform table. Business modules own their tables in separate schema files. */
export const platformMetadata = mysqlTable("platform_metadata", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: varchar("value", { length: 255 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const users = mysqlTable("users", {
  id: id("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["pending_verification", "active", "suspended"]).notNull().default("pending_verification"),
  preferredLocale: mysqlEnum("preferred_locale", ["fr", "ar"]).notNull().default("fr"),
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const sessions = mysqlTable("sessions", {
  id: id("id").primaryKey(),
  userId: id("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash)]);

export const verificationChallenges = mysqlTable("verification_challenges", {
  id: id("id").primaryKey(),
  userId: id("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: mysqlEnum("purpose", ["email_verification", "password_reset", "magic_link"]).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("verification_challenges_token_hash_unique").on(table.tokenHash)]);

export const loginAttemptLimits = mysqlTable("login_attempt_limits", {
  keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
  attempts: int("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
