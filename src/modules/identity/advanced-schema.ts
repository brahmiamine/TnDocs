import { index, int, mysqlTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { sessions, users } from "@/platform/database/schema";

export const userSecondFactors = mysqlTable("user_second_factors", {
  userId: varchar("user_id", { length: 36 }).primaryKey().references(() => users.id, { onDelete: "cascade" }),
  secretCiphertext: text("secret_ciphertext").notNull(),
  enabledAt: timestamp("enabled_at"),
  lastUsedStep: int("last_used_step").notNull().default(-1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const recoveryCodes = mysqlTable("identity_recovery_codes", {
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  usedAt: timestamp("used_at"),
}, table => [primaryKey({ columns: [table.userId, table.codeHash] })]);
export const sessionFactors = mysqlTable("session_factors", {
  sessionId: varchar("session_id", { length: 36 }).primaryKey().references(() => sessions.id, { onDelete: "cascade" }),
  verifiedAt: timestamp("verified_at").defaultNow().notNull(),
});
export const oauthIdentities = mysqlTable("oauth_identities", {
  provider: varchar("provider", { length: 20 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.provider, table.subject] }), uniqueIndex("oauth_user_provider_unique").on(table.userId, table.provider)]);
export const oauthFlows = mysqlTable("oauth_flows", {
  stateHash: varchar("state_hash", { length: 64 }).primaryKey(),
  verifier: varchar("verifier", { length: 128 }).notNull(),
  locale: varchar("locale", { length: 2 }).notNull(),
  linkUserId: varchar("link_user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
}, table => [index("oauth_flows_expiry_idx").on(table.expiresAt)]);
export const identityAuditEvents = mysqlTable("identity_audit_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
  event: varchar("event", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("identity_audit_user_time_idx").on(table.userId, table.createdAt)]);
export const emailChangeChallenges = mysqlTable("email_change_challenges", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  newEmail: varchar("new_email", { length: 320 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
}, table => [index("email_change_user_idx").on(table.userId)]);
