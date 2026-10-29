import { index, int, mysqlEnum, mysqlTable, primaryKey, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { users } from '@/platform/database/schema';
export const notifications = mysqlTable('notifications', {
  id: varchar('id', { length: 36 }).primaryKey(),
  ownerUserId: varchar('owner_user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  event: mysqlEnum('event', ['security_changed', 'document_ready', 'publication_updated', 'reminder_due', 'support_replied', 'contribution_reviewed']).notNull(),
  resourceId: varchar('resource_id', { length: 36 }),
  dedupeKey: varchar('dedupe_key', { length: 180 }).notNull(),
  readAt: timestamp('read_at'), emailDeliveredAt: timestamp('email_delivered_at'), createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [index('notifications_owner_created_idx').on(table.ownerUserId, table.createdAt), uniqueIndex('notifications_owner_dedupe_unique').on(table.ownerUserId, table.dedupeKey)]);
export const notificationPreferences = mysqlTable('notification_preferences', {
  ownerUserId: varchar('owner_user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: mysqlEnum('category', ['security', 'document', 'catalogue', 'reminder', 'support']).notNull(),
  inApp: int('in_app').notNull().default(1), email: int('email').notNull().default(0), push: int('push').notNull().default(0),
  pushConsentedAt: timestamp('push_consented_at'), updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, table => [primaryKey({ columns: [table.ownerUserId, table.category] })]);
export const pushSubscriptions = mysqlTable('push_subscriptions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  ownerUserId: varchar('owner_user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpointHash: varchar('endpoint_hash', { length: 64 }).notNull(),
  subscriptionCiphertext: text('subscription_ciphertext').notNull(), encryptionKeyVersion: varchar('encryption_key_version', { length: 8 }).notNull(),
  consentedAt: timestamp('consented_at').notNull(), createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [uniqueIndex('push_owner_endpoint_unique').on(table.ownerUserId, table.endpointHash)]);
export const notificationDeliveries = mysqlTable('notification_deliveries', {
  notificationId: varchar('notification_id', { length: 36 }).notNull().references(() => notifications.id, { onDelete: 'cascade' }),
  subscriptionId: varchar('subscription_id', { length: 36 }).notNull().references(() => pushSubscriptions.id, { onDelete: 'cascade' }),
  deliveredAt: timestamp('delivered_at').defaultNow().notNull(),
}, table => [primaryKey({ columns: [table.notificationId, table.subscriptionId] })]);
