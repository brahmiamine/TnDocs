import { foreignKey, index, mysqlEnum, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { users } from '@/platform/database/schema';

export const communitySubmissions = mysqlTable('community_submissions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  ownerUserId: varchar('owner_user_id', { length: 36 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: mysqlEnum('kind', ['support', 'template_request', 'proposal', 'report']).notNull(),
  locale: mysqlEnum('locale', ['fr', 'ar']).notNull(),
  status: mysqlEnum('status', ['submitted', 'triaged', 'revision_requested', 'accepted', 'rejected', 'closed']).notNull().default('submitted'),
  contentCiphertext: text('content_ciphertext').notNull(),
  encryptionKeyVersion: varchar('encryption_key_version', { length: 8 }).notNull(),
  privacyConfirmedAt: timestamp('privacy_confirmed_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, table => [index('community_owner_updated_idx').on(table.ownerUserId, table.updatedAt), index('community_status_created_idx').on(table.status, table.createdAt)]);

export const communitySubmissionEvents = mysqlTable('community_submission_events', {
  id: varchar('id', { length: 36 }).primaryKey(),
  submissionId: varchar('submission_id', { length: 36 }).notNull(),
  actorUserId: varchar('actor_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
  status: mysqlEnum('status', ['submitted', 'triaged', 'revision_requested', 'accepted', 'rejected', 'closed']).notNull(),
  commentCiphertext: text('comment_ciphertext'),
  encryptionKeyVersion: varchar('encryption_key_version', { length: 8 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [foreignKey({ name: 'community_events_submission_fk', columns: [table.submissionId], foreignColumns: [communitySubmissions.id] }).onDelete('cascade'), index('community_events_submission_idx').on(table.submissionId, table.createdAt)]);
