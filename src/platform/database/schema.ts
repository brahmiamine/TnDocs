import { index, int, json, mysqlEnum, mysqlTable, primaryKey, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";

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
  role: mysqlEnum("role", ["user", "moderator", "admin"]).notNull().default("user"),
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

export const personProfiles = mysqlTable("person_profiles", {
  id: id("id").primaryKey(),
  ownerUserId: id("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  relationship: mysqlEnum("relationship", ["self", "spouse", "child", "parent", "relative"]).notNull(),
  authorizationBasis: mysqlEnum("authorization_basis", ["self", "consent", "legal_authority"]).notNull(),
  authorizationConfirmedAt: timestamp("authorization_confirmed_at").notNull(),
  dataCiphertext: text("data_ciphertext").notNull(),
  encryptionKeyVersion: varchar("encryption_key_version", { length: 8 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("person_profiles_owner_id_idx").on(table.ownerUserId)]);

export const personalDocuments = mysqlTable("personal_documents", {
  id: id("id").primaryKey(),
  ownerUserId: id("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: id("template_id").references(() => catalogTemplates.id, { onDelete: "set null" }),
  templateVersionId: id("template_version_id"),
  title: varchar("title", { length: 240 }).notNull(),
  status: mysqlEnum("status", ["draft", "finalized", "archived", "trash"]).notNull().default("draft"),
  currentRevision: int("current_revision").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("personal_documents_owner_updated_idx").on(table.ownerUserId, table.updatedAt), index("personal_documents_template_id_idx").on(table.templateId)]);

export const personalDocumentShares = mysqlTable("personal_document_shares", {
  id: id("id").primaryKey(),
  documentId: id("document_id").notNull().references(() => personalDocuments.id, { onDelete: "cascade" }),
  revision: int("revision").notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  permission: mysqlEnum("permission", ["view"]).notNull().default("view"),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("personal_document_shares_token_hash_unique").on(table.tokenHash), index("personal_document_shares_document_created_idx").on(table.documentId, table.createdAt)]);

export const personalDocumentShareEvents = mysqlTable("personal_document_share_events", {
  id: id("id").primaryKey(),
  shareId: id("share_id").notNull().references(() => personalDocumentShares.id, { onDelete: "cascade" }),
  eventType: mysqlEnum("event_type", ["created", "revoked", "accessed"]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("personal_document_share_events_share_created_idx").on(table.shareId, table.createdAt)]);

export const documentRevisions = mysqlTable("document_revisions", {
  id: id("id").primaryKey(),
  documentId: id("document_id").notNull().references(() => personalDocuments.id, { onDelete: "cascade" }),
  revision: int("revision").notNull(),
  contentCiphertext: text("content_ciphertext").notNull(),
  encryptionKeyVersion: varchar("encryption_key_version", { length: 8 }).notNull(),
  createdBy: id("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("document_revisions_document_revision_unique").on(table.documentId, table.revision), index("document_revisions_created_idx").on(table.documentId, table.createdAt)]);

export const personalDossiers = mysqlTable("personal_dossiers", {
  id: id("id").primaryKey(),
  ownerUserId: id("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  titleCiphertext: text("title_ciphertext").notNull(),
  encryptionKeyVersion: varchar("encryption_key_version", { length: 8 }).notNull(),
  status: mysqlEnum("status", ["open", "archived", "trash"]).notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("personal_dossiers_owner_updated_idx").on(table.ownerUserId, table.updatedAt)]);

export const personalDossierItems = mysqlTable("personal_dossier_items", {
  id: id("id").primaryKey(),
  dossierId: id("dossier_id").notNull().references(() => personalDossiers.id, { onDelete: "cascade" }),
  linkedDocumentId: id("linked_document_id").references(() => personalDocuments.id, { onDelete: "set null" }),
  kind: mysqlEnum("kind", ["checklist", "document"]).notNull().default("checklist"),
  status: mysqlEnum("status", ["missing", "added", "reviewed", "expired"]).notNull().default("missing"),
  required: int("required").notNull().default(1),
  labelCiphertext: text("label_ciphertext").notNull(),
  encryptionKeyVersion: varchar("encryption_key_version", { length: 8 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("personal_dossier_items_dossier_idx").on(table.dossierId), index("personal_dossier_items_document_idx").on(table.linkedDocumentId)]);

export const catalogCategories = mysqlTable("catalog_categories", {
  id: id("id").primaryKey(),
  parentId: id("parent_id").references((): AnyMySqlColumn => catalogCategories.id, { onDelete: "set null" }),
  slug: varchar("slug", { length: 120 }).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
  active: int("active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("catalog_categories_slug_unique").on(table.slug), index("catalog_categories_parent_id_idx").on(table.parentId)]);

export const catalogCategoryTranslations = mysqlTable("catalog_category_translations", {
  categoryId: id("category_id").notNull().references(() => catalogCategories.id, { onDelete: "cascade" }),
  locale: mysqlEnum("locale", ["fr", "ar"]).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  description: varchar("description", { length: 500 }).notNull().default(""),
}, (table) => [primaryKey({ columns: [table.categoryId, table.locale] })]);

export const catalogOrganizations = mysqlTable("catalog_organizations", {
  id: id("id").primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull(),
  officialUrl: varchar("official_url", { length: 2048 }),
  active: int("active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("catalog_organizations_slug_unique").on(table.slug)]);

export const catalogOrganizationTranslations = mysqlTable("catalog_organization_translations", {
  organizationId: id("organization_id").notNull().references(() => catalogOrganizations.id, { onDelete: "cascade" }),
  locale: mysqlEnum("locale", ["fr", "ar"]).notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  description: varchar("description", { length: 500 }).notNull().default(""),
}, (table) => [primaryKey({ columns: [table.organizationId, table.locale] })]);

export const catalogTemplates = mysqlTable("catalog_templates", {
  id: id("id").primaryKey(),
  status: mysqlEnum("status", ["draft", "in_review", "published", "archived"]).notNull().default("draft"),
  documentType: mysqlEnum("document_type", ["editable", "official", "informational"]).notNull(),
  organizationId: id("organization_id").references(() => catalogOrganizations.id, { onDelete: "set null" }),
  publishedVersionId: id("published_version_id"),
  createdBy: id("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("catalog_templates_status_published_idx").on(table.status, table.publishedAt)]);

export const catalogTemplateVersions = mysqlTable("catalog_template_versions", {
  id: id("id").primaryKey(),
  templateId: id("template_id").notNull().references(() => catalogTemplates.id, { onDelete: "cascade" }),
  version: int("version").notNull(),
  status: mysqlEnum("status", ["draft", "in_review", "published", "archived"]).notNull().default("draft"),
  formSchema: json("form_schema"),
  documentContent: json("document_content"),
  createdBy: id("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("catalog_template_versions_template_version_unique").on(table.templateId, table.version), index("catalog_template_versions_template_id_idx").on(table.templateId)]);

export const catalogTemplateTranslations = mysqlTable("catalog_template_translations", {
  versionId: id("version_id").notNull().references(() => catalogTemplateVersions.id, { onDelete: "cascade" }),
  locale: mysqlEnum("locale", ["fr", "ar"]).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  summary: varchar("summary", { length: 1000 }).notNull(),
  instructions: text("instructions").notNull(),
  body: text("body").notNull(),
}, (table) => [primaryKey({ columns: [table.versionId, table.locale] })]);

export const catalogTemplateCategories = mysqlTable("catalog_template_categories", {
  versionId: id("version_id").notNull().references(() => catalogTemplateVersions.id, { onDelete: "cascade" }),
  categoryId: id("category_id").notNull().references(() => catalogCategories.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.versionId, table.categoryId] }), index("catalog_template_categories_category_idx").on(table.categoryId)]);

export const catalogTemplateSources = mysqlTable("catalog_template_sources", {
  id: id("id").primaryKey(),
  versionId: id("version_id").notNull().references(() => catalogTemplateVersions.id, { onDelete: "cascade" }),
  sourceName: varchar("source_name", { length: 180 }).notNull(),
  sourceUrl: varchar("source_url", { length: 2048 }).notNull(),
  official: int("official").notNull().default(0),
  reusePermission: mysqlEnum("reuse_permission", ["pending", "allowed", "no_reproduction", "forbidden"]).notNull().default("pending"),
  checkedAt: timestamp("checked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("catalog_template_sources_version_id_idx").on(table.versionId)]);
