import { index, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
/** Intentionally survives job/account deletion: an orphan's deletion evidence must not cascade away. */
export const artifactReservations = mysqlTable('artifact_reservations', {
  storageKey: varchar('storage_key', { length: 255 }).primaryKey(),
  jobId: varchar('job_id', { length: 36 }).notNull(),
  leaseToken: varchar('lease_token', { length: 36 }).notNull(),
  createdAt: timestamp('created_at', { fsp: 3 }).defaultNow().notNull(),
}, table => [index('artifact_reservation_age_idx').on(table.createdAt), index('artifact_reservation_job_idx').on(table.jobId)]);
