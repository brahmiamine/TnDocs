import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { personalDocuments, personalDossiers, storedFiles } from "@/platform/database/schema";
import { enqueueJob } from "@/platform/jobs/queue";
import { sweepAbandonedArtifacts } from "@/platform/jobs/artifacts";
import { jobs } from "@/platform/jobs/schema";
import { deleteStoredAttachment } from "@/modules/dossiers/file-storage";
import { attachmentStorageKey } from "@/modules/dossiers/file-storage";
import { validStorageKey } from "@/platform/storage/local";
import { trashMarkers } from "./schema";
import { canPurgeTrash, exportArtifactExpired } from "./policy";
import { lockOwnedTrashResource, trashOwnedResource } from "./trash";

function db() { if (!database) throw new Error("DATABASE_NOT_CONFIGURED"); return database; }

/** Idempotent file cleanup handler. Reference checks are repeated when the job runs,
 * not just when the DB record is deleted. ENOENT is a successful retry outcome. */
export async function performStorageDelete(payload: Record<string, unknown>) {
  const key = payload.storageKey;
  if (typeof key !== "string" || !validStorageKey(key)) throw new Error("INVALID_STORAGE_KEY");
  const [attachment] = await db().select({ id: storedFiles.id }).from(storedFiles).where(eq(storedFiles.storageKey, key)).limit(1);
  if (attachment) throw new Error("STORAGE_STILL_REFERENCED");
  const [artifact] = await db().select({ id: jobs.id }).from(jobs).where(sql`json_unquote(json_extract(${jobs.result}, '$.storageKey')) = ${key}`).limit(1);
  if (artifact) throw new Error("STORAGE_STILL_REFERENCED");
  await deleteStoredAttachment(key);
  return { deleted: true };
}

/** Run only in the configured worker. Thirty-day trash deadlines come from
 * immutable markers; ordinary updatedAt changes never shorten that period. */
export async function runRetentionSweep(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_RETENTION_DATE");
  const ttlHours = Number(process.env.EXPORT_ARTIFACT_TTL_HOURS ?? "24");
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) throw new Error("INVALID_EXPORT_TTL");
  const cutoff = new Date(now.getTime() - ttlHours * 3600 * 1000);
  const store = db();
  let backfilled = 0; let purged = 0; let artifactsExpired = 0;
  // Legacy trash has no trustworthy deletion timestamp. Start a full window at
  // first observation instead of inferring an earlier irreversible deadline.
  const oldDocuments = await store.select({ id: personalDocuments.id, ownerId: personalDocuments.ownerUserId }).from(personalDocuments)
    .leftJoin(trashMarkers, and(eq(trashMarkers.resourceKind, "document"), eq(trashMarkers.resourceId, personalDocuments.id)))
    .where(and(eq(personalDocuments.status, "trash"), isNull(trashMarkers.resourceId))).limit(100);
  const oldDossiers = await store.select({ id: personalDossiers.id, ownerId: personalDossiers.ownerUserId }).from(personalDossiers)
    .leftJoin(trashMarkers, and(eq(trashMarkers.resourceKind, "dossier"), eq(trashMarkers.resourceId, personalDossiers.id)))
    .where(and(eq(personalDossiers.status, "trash"), isNull(trashMarkers.resourceId))).limit(100);
  for (const row of oldDocuments) if (await trashOwnedResource("document", row.id, row.ownerId, now)) backfilled++;
  for (const row of oldDossiers) if (await trashOwnedResource("dossier", row.id, row.ownerId, now)) backfilled++;
  const markers = await store.select().from(trashMarkers).where(lte(trashMarkers.purgeAfter, now)).orderBy(trashMarkers.purgeAfter).limit(100);
  for (const marker of markers) {
    const deleted = await store.transaction(async (tx) => {
      // Lock order matches trash/restore: resource first, marker second.
      const resource = await lockOwnedTrashResource(tx, marker.resourceKind, marker.resourceId, marker.ownerUserId);
      const condition = and(eq(trashMarkers.resourceKind, marker.resourceKind), eq(trashMarkers.resourceId, marker.resourceId), eq(trashMarkers.ownerUserId, marker.ownerUserId));
      const [current] = await tx.select().from(trashMarkers).where(condition).for("update").limit(1);
      if (!current) return false;
      if (!resource || resource.status !== "trash") { await tx.delete(trashMarkers).where(condition); return false; }
      if (!canPurgeTrash({ status: resource.status, purgeAfter: current.purgeAfter }, now)) return false;
      if (marker.resourceKind === "dossier") {
        const files = await tx.select({ key: storedFiles.storageKey }).from(storedFiles).where(and(eq(storedFiles.dossierId, marker.resourceId), eq(storedFiles.ownerUserId, marker.ownerUserId)));
        for (const file of files) await enqueueJob({ kind: "storage.delete", key: `storage-delete:${file.key}`, payload: { storageKey: file.key }, maxAttempts: 10 }, tx);
        await tx.delete(personalDossiers).where(and(eq(personalDossiers.id, marker.resourceId), eq(personalDossiers.ownerUserId, marker.ownerUserId), eq(personalDossiers.status, "trash")));
      } else await tx.delete(personalDocuments).where(and(eq(personalDocuments.id, marker.resourceId), eq(personalDocuments.ownerUserId, marker.ownerUserId), eq(personalDocuments.status, "trash")));
      await tx.delete(trashMarkers).where(condition);
      return true;
    });
    if (deleted) purged++;
  }
  const exports = await store.select({ id: jobs.id }).from(jobs).where(and(or(eq(jobs.kind, "document.export"), eq(jobs.kind, "signature.export")), or(eq(jobs.status, "done"), eq(jobs.status, "dead"), eq(jobs.status, "cancelled")), lte(jobs.updatedAt, cutoff), sql`coalesce(json_unquote(json_extract(${jobs.result}, '$.expired')), 'false') <> 'true'`)).orderBy(jobs.updatedAt).limit(100);
  for (const candidate of exports) {
    const expired = await store.transaction(async (tx) => {
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, candidate.id)).for("update").limit(1);
      if (!job || job.result?.expired === true || !exportArtifactExpired(job, now, ttlHours)) return false;
      const key = typeof job.result?.storageKey === "string" ? job.result.storageKey : job.ownerUserId ? attachmentStorageKey(job.ownerUserId, job.id) : null;
      if (key && validStorageKey(key)) await enqueueJob({ kind: "storage.delete", key: `storage-delete:${key}`, payload: { storageKey: key }, maxAttempts: 10 }, tx);
      await tx.update(jobs).set({ result: { expired: true, expiredAt: now.toISOString() } }).where(eq(jobs.id, job.id));
      return true;
    });
    if (expired) artifactsExpired++;
  }
  const orphans = await sweepAbandonedArtifacts(now);
  return { backfilled, purged, artifactsExpired, artifactOrphansQueued: orphans.queued };
}
