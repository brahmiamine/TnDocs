import { index, int, json, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
export const jobs = mysqlTable('job_queue', {
 id: varchar('id',{length:36}).primaryKey(),
 kind: varchar('kind',{length:80}).notNull(),
 deduplicationKey: varchar('deduplication_key',{length:180}).notNull(),
 ownerUserId: varchar('owner_user_id',{length:36}),
 payload: json('payload').$type<Record<string,unknown>>().notNull(),
 status:mysqlEnum('status',['pending','leased','done','retrying','dead','cancelled']).notNull().default('pending'),
 attempts:int('attempts').notNull().default(0), maxAttempts:int('max_attempts').notNull().default(5),
 availableAt:timestamp('available_at',{fsp:3}).notNull().defaultNow(),
 leaseToken:varchar('lease_token',{length:36}),leaseExpiresAt:timestamp('lease_expires_at',{fsp:3}),
 result:json('result').$type<Record<string,unknown>>(), errorCode:varchar('error_code',{length:80}),
 createdAt:timestamp('created_at').notNull().defaultNow(),updatedAt:timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
},t=>[uniqueIndex('jobs_dedupe_unique').on(t.deduplicationKey),index('jobs_claim_idx').on(t.status,t.availableAt,t.leaseExpiresAt)]);
