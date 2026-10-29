import { and, eq, lte, sql } from 'drizzle-orm';
import { database } from '@/platform/database/client';
import { storedFiles } from '@/platform/database/schema';
import { artifactReservations } from './artifacts-schema';
import { jobs } from './schema';
import { enqueueJob, type JobTransaction } from './queue';
import { artifactCleanupEligible, artifactGraceMs, validateArtifactOwnerKey } from './artifacts-policy';
import { validStorageKey } from '@/platform/storage/local';
export type ArtifactJob = { id: string; leaseToken: string; ownerUserId: string | null };
function db() { if (!database) throw new Error('DATABASE_NOT_CONFIGURED'); return database; }
async function lockLiveJob(tx: JobTransaction, job: ArtifactJob) {
  const [current] = await tx.select().from(jobs).where(eq(jobs.id, job.id)).limit(1).for('update');
  if (!current || current.status !== 'leased' || current.leaseToken !== job.leaseToken || !current.leaseExpiresAt || current.leaseExpiresAt.getTime() <= Date.now() || current.ownerUserId !== job.ownerUserId) throw new Error('ARTIFACT_LEASE_LOST');
  return current;
}
async function referenced(tx: JobTransaction, key: string) {
  const [attachment] = await tx.select({ id: storedFiles.id }).from(storedFiles).where(eq(storedFiles.storageKey, key)).limit(1);
  if (attachment) return true;
  const [output] = await tx.select({ id: jobs.id }).from(jobs).where(sql`json_unquote(json_extract(${jobs.result}, '$.storageKey')) = ${key}`).limit(1);
  return !!output;
}
/** Must be called before creating a generated object. Retries allocate a fresh random key. */
export async function reserveArtifact(job: ArtifactJob, storageKey: string) {
  if (!validateArtifactOwnerKey(job.ownerUserId, storageKey)) throw new Error('INVALID_ARTIFACT_KEY');
  await db().transaction(async tx => {
    await lockLiveJob(tx, job);
    const [reservation] = await tx.select().from(artifactReservations).where(eq(artifactReservations.storageKey, storageKey)).limit(1).for('update');
    if (reservation) {
      if (reservation.jobId === job.id && reservation.leaseToken === job.leaseToken) return;
      throw new Error('ARTIFACT_KEY_ALREADY_RESERVED');
    }
    if (await referenced(tx, storageKey)) throw new Error('ARTIFACT_KEY_ALREADY_REFERENCED');
    const [cleanup] = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.kind, 'storage.delete'), sql`json_unquote(json_extract(${jobs.payload}, '$.storageKey')) = ${storageKey}`)).limit(1);
    if (cleanup) throw new Error('ARTIFACT_KEY_RETIRED');
    await tx.insert(artifactReservations).values({ storageKey, jobId: job.id, leaseToken: job.leaseToken });
  });
}
/** Fences the brief atomic file write against sweep/lease takeover. Render before entering this callback. */
export async function writeReservedArtifact<T>(job: ArtifactJob, storageKey: string, write: () => Promise<T>): Promise<T> {
  if (!validateArtifactOwnerKey(job.ownerUserId, storageKey)) throw new Error('INVALID_ARTIFACT_KEY');
  return db().transaction(async tx => {
    await lockLiveJob(tx, job);
    const [reservation] = await tx.select().from(artifactReservations).where(eq(artifactReservations.storageKey, storageKey)).limit(1).for('update');
    if (!reservation || reservation.jobId !== job.id || reservation.leaseToken !== job.leaseToken) throw new Error('ARTIFACT_RESERVATION_LOST');
    return write();
  });
}
/** Call only after completeJob returned true. Crashing before this is safe: the result still protects the object. */
export async function releaseCommittedArtifact(jobId: string, storageKey: string) {
  return db().transaction(async tx => {
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).limit(1).for('update');
    if (!job || job.status !== 'done' || job.result?.storageKey !== storageKey) return false;
    await tx.delete(artifactReservations).where(and(eq(artifactReservations.storageKey, storageKey), eq(artifactReservations.jobId, jobId)));
    return true;
  });
}
/** Only queues deletion; the storage.delete worker repeats reference checks before touching disk. */
export async function sweepAbandonedArtifacts(now = new Date(), graceMs = artifactGraceMs) {
  artifactCleanupEligible({ createdAt: now, referenced: false, job: null }, now, graceMs);
  const store = db(); const cutoff = new Date(now.getTime() - graceMs);
  const candidates = await store.select().from(artifactReservations).where(lte(artifactReservations.createdAt, cutoff)).orderBy(artifactReservations.createdAt).limit(100);
  let queued = 0;
  for (const candidate of candidates) {
    const removed = await store.transaction(async tx => {
      // Match reserve/write lock order: job first, reservation second.
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, candidate.jobId)).limit(1).for('update');
      const [reservation] = await tx.select().from(artifactReservations).where(eq(artifactReservations.storageKey, candidate.storageKey)).limit(1).for('update');
      if (!reservation || !validStorageKey(reservation.storageKey)) return false;
      if (!artifactCleanupEligible({ createdAt: reservation.createdAt, referenced: await referenced(tx, reservation.storageKey), job: job ?? null }, now, graceMs)) return false;
      await enqueueJob({ kind: 'storage.delete', key: `storage-delete:${reservation.storageKey}`, payload: { storageKey: reservation.storageKey }, maxAttempts: 10 }, tx);
      await tx.delete(artifactReservations).where(eq(artifactReservations.storageKey, reservation.storageKey));
      return true;
    });
    if (removed) queued++;
  }
  return { queued };
}
