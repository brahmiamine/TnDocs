import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { database } from '@/platform/database/client';
import { catalogTemplates, storedFiles } from '@/platform/database/schema';
import type { JobTransaction } from '@/platform/jobs/queue';
import { jobs } from '@/platform/jobs/schema';
import { registeredSources } from '@/modules/sources/db-schema';
import { systemSettings, systemAuditEvents, legalVersions, legalPublications } from './db-schema';
import { defaultSettings, publicSettings, settingsValuesSchema, type FeatureFlag } from './schema';
import type { z } from 'zod';
import { legalDraftSchema, settingsSchema, legalActionSchema } from './schema';

export async function getSystemSettings(db: NonNullable<typeof database> | JobTransaction | null = database) {
  if (!db) return { ...defaultSettings, revision: 1 };
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'global')).limit(1);
  if (!row) return { ...defaultSettings, revision: 1 };
  return { ...settingsValuesSchema.parse(row.values), revision: row.revision };
}
export async function getPublicSettings() { const value = await getSystemSettings(); return publicSettings(value); }
export async function isFeatureEnabled(flag: FeatureFlag) { return (await getSystemSettings()).featureFlags[flag]; }
export async function saveSystemSettings(actorId: string, input: z.infer<typeof settingsSchema>) {
  if (!database) throw new Error('UNAVAILABLE');
  input = settingsSchema.parse(input);
  const values = settingsValuesSchema.parse({ quotaBytes: input.quotaBytes, featureFlags: input.featureFlags, donationUrl: input.donationUrl, partners: input.partners });
  await database.transaction(async tx => {
    await tx.insert(systemSettings).values({ key: 'global', revision: 1, values: defaultSettings }).onDuplicateKeyUpdate({ set: { key: 'global' } });
    const [row] = await tx.select().from(systemSettings).where(eq(systemSettings.key, 'global')).limit(1).for('update');
    if (row.revision !== input.expectedRevision) throw new Error('CONFLICT');
    await tx.update(systemSettings).set({ values, revision: row.revision + 1, updatedAt: new Date() }).where(eq(systemSettings.key, 'global'));
    await tx.insert(systemAuditEvents).values({ id: randomUUID(), actorUserId: actorId, action: 'settings_changed', resourceId: 'global', revision: row.revision + 1 });
  });
}
export async function createLegalVersion(actorId: string, input: z.infer<typeof legalDraftSchema>) {
  if (!database) throw new Error('UNAVAILABLE');
  input = legalDraftSchema.parse(input);
  const id = randomUUID();
  await database.transaction(async tx => {
    // The singleton settings lock serializes version allocation without mutating existing text.
    await tx.insert(systemSettings).values({ key: 'global', revision: 1, values: defaultSettings }).onDuplicateKeyUpdate({ set: { key: 'global' } });
    await tx.select().from(systemSettings).where(eq(systemSettings.key, 'global')).limit(1).for('update');
    const [last] = await tx.select({ version: legalVersions.version }).from(legalVersions).where(and(eq(legalVersions.slug, input.slug), eq(legalVersions.locale, input.locale))).orderBy(desc(legalVersions.version)).limit(1);
    const version = (last?.version ?? 0) + 1;
    await tx.insert(legalVersions).values({ id, ...input, version, createdBy: actorId });
    await tx.insert(systemAuditEvents).values({ id: randomUUID(), actorUserId: actorId, action: 'legal_created', resourceId: id, revision: version });
  });
  return id;
}
export async function actOnLegalVersion(actorId: string, id: string, input: z.infer<typeof legalActionSchema>) {
  if (!database) throw new Error('UNAVAILABLE');
  input = legalActionSchema.parse(input);
  await database.transaction(async tx => {
    const [row] = await tx.select().from(legalVersions).where(eq(legalVersions.id, id)).limit(1).for('update');
    if (!row) throw new Error('NOT_FOUND'); if (row.status !== input.expectedStatus) throw new Error('CONFLICT');
    const now = new Date();
    if (input.action === 'review') {
      await tx.update(legalVersions).set({ status: 'reviewed', reviewedBy: actorId, reviewedAt: now }).where(eq(legalVersions.id, id));
    } else {
      await tx.update(legalVersions).set({ status: 'published', publishedAt: now }).where(eq(legalVersions.id, id));
      await tx.insert(legalPublications).values({ slug: row.slug, locale: row.locale, versionId: row.id, publishedAt: now }).onDuplicateKeyUpdate({ set: { versionId: row.id, publishedAt: now } });
    }
    await tx.insert(systemAuditEvents).values({ id: randomUUID(), actorUserId: actorId, action: input.action === 'review' ? 'legal_reviewed' : 'legal_published', resourceId: id, revision: row.version });
  });
}
export async function getPublishedLegal(slug: typeof legalVersions.$inferSelect['slug'], locale: 'fr' | 'ar') {
  if (!database) return null;
  const [row] = await database.select({ id: legalVersions.id, title: legalVersions.title, body: legalVersions.body, version: legalVersions.version, publishedAt: legalPublications.publishedAt }).from(legalPublications).innerJoin(legalVersions, and(eq(legalPublications.versionId, legalVersions.id), eq(legalVersions.status, 'published'))).where(and(eq(legalPublications.slug, slug), eq(legalPublications.locale, locale))).limit(1);
  return row ?? null;
}
export async function getSystemOverview() {
  if (!database) throw new Error('UNAVAILABLE');
  const [jobCounts, sourceCounts, templateCounts, storageCounts, legal, audit] = await Promise.all([
    database.select({ status: jobs.status, count: count() }).from(jobs).groupBy(jobs.status),
    database.select({ approved: registeredSources.approved, active: registeredSources.active, count: count(), errors: sql<number>`SUM(CASE WHEN ${registeredSources.errorCode} IS NULL THEN 0 ELSE 1 END)` }).from(registeredSources).groupBy(registeredSources.approved, registeredSources.active),
    database.select({ status: catalogTemplates.status, count: count() }).from(catalogTemplates).groupBy(catalogTemplates.status),
    database.select({ files: count(), bytes: sql<number>`COALESCE(SUM(${storedFiles.byteSize}), 0)` }).from(storedFiles),
    database.select().from(legalVersions).orderBy(desc(legalVersions.createdAt)).limit(100),
    database.select({ id: systemAuditEvents.id, action: systemAuditEvents.action, resourceId: systemAuditEvents.resourceId, revision: systemAuditEvents.revision, createdAt: systemAuditEvents.createdAt }).from(systemAuditEvents).orderBy(desc(systemAuditEvents.createdAt)).limit(100),
  ]);
  return { jobs: jobCounts, sources: sourceCounts.map(row => ({ ...row, errors: Number(row.errors) })), templates: templateCounts, storage: { files: storageCounts[0].files, bytes: Number(storageCounts[0].bytes) }, legal, audit };
}
