import { index, int, json, mysqlEnum, mysqlTable, primaryKey, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { users } from '@/platform/database/schema';
import type { SettingsValues } from './schema';
export const systemSettings = mysqlTable('system_settings', {
  key: varchar('key', { length: 36 }).primaryKey(), revision: int('revision').notNull().default(1), values: json('values').$type<SettingsValues>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});
export const systemAuditEvents = mysqlTable('system_audit_events', {
  id: varchar('id', { length: 36 }).primaryKey(), actorUserId: varchar('actor_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  action: mysqlEnum('action', ['settings_changed', 'legal_created', 'legal_reviewed', 'legal_published', 'user_changed', 'category_created', 'category_updated', 'organization_created', 'organization_updated']).notNull(), resourceId: varchar('resource_id', { length: 36 }).notNull(),
  revision: int('revision').notNull(), createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [index('system_audit_created_idx').on(table.createdAt)]);
export const legalVersions = mysqlTable('legal_versions', {
  id: varchar('id', { length: 36 }).primaryKey(), slug: mysqlEnum('slug', ['mentions', 'confidentialite', 'conditions', 'cookies']).notNull(), locale: mysqlEnum('locale', ['fr', 'ar']).notNull(),
  version: int('version').notNull(), status: mysqlEnum('status', ['draft', 'reviewed', 'published']).notNull().default('draft'),
  title: varchar('title', { length: 240 }).notNull(), body: text('body').notNull(),
  createdBy: varchar('created_by', { length: 36 }).references(() => users.id, { onDelete: 'set null' }), reviewedBy: varchar('reviewed_by', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(), reviewedAt: timestamp('reviewed_at'), publishedAt: timestamp('published_at'),
}, table => [uniqueIndex('legal_slug_locale_version_unique').on(table.slug, table.locale, table.version)]);
export const legalPublications = mysqlTable('legal_publications', {
  slug: mysqlEnum('slug', ['mentions', 'confidentialite', 'conditions', 'cookies']).notNull(), locale: mysqlEnum('locale', ['fr', 'ar']).notNull(),
  versionId: varchar('version_id', { length: 36 }).notNull().references(() => legalVersions.id, { onDelete: 'restrict' }),
  publishedAt: timestamp('published_at').defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.slug, table.locale] })]);
