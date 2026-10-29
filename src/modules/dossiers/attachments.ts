import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { personalDossierItems, personalDossiers, storedFiles } from "@/platform/database/schema";
import { assertStorageQuota, lockStorageOwner } from "@/platform/storage/quota";
import { reserveArtifact, writeReservedArtifact } from "@/platform/jobs/artifacts";
import { artifactReservations } from "@/platform/jobs/artifacts-schema";
import { jobs } from "@/platform/jobs/schema";
import { enqueueJob } from "@/platform/jobs/queue";
import { encryptAttachment } from "./file-crypto";
import { attachmentStorageKey, writeEncryptedAttachment } from "./file-storage";

type Input = { ownerId: string; dossierId: string; itemId: string; expectedStoredFileId: string | null; data: Buffer; mimeType: "application/pdf" | "image/png" | "image/jpeg" };
/** Caller must verify MIME, size and ClamAV result before calling. The injectable
 * byte writer lets integration tests use a temporary private storage root. */
export async function storeScannedAttachment(input: Input, writeObject = writeEncryptedAttachment) {
  const db = database; if (!db) throw new Error("SERVICE_UNAVAILABLE");
  const fileId = randomUUID(), storageKey = attachmentStorageKey(input.ownerId, fileId);
  const upload = { id: randomUUID(), leaseToken: randomUUID(), ownerUserId: input.ownerId };
  try {
    const encrypted = encryptAttachment(input.data, input.ownerId, fileId);
    // Durable reservation precedes ALL filesystem I/O. A crash cannot leave an
    // untracked object; incomplete leases are retired by the orphan sweep.
    await db.insert(jobs).values({ id: upload.id, kind: "attachment.upload", deduplicationKey: `attachment-upload:${fileId}`, ownerUserId: input.ownerId, payload: { fileId, storageKey }, status: "leased", attempts: 1, maxAttempts: 1, leaseToken: upload.leaseToken, leaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000) });
    await reserveArtifact(upload, storageKey);
    await writeReservedArtifact(upload, storageKey, () => writeObject(storageKey, encrypted.payload));
    await db.transaction(async tx => {
      await lockStorageOwner(tx, input.ownerId);
      const [previous] = input.expectedStoredFileId ? await tx.select().from(storedFiles).where(and(eq(storedFiles.id, input.expectedStoredFileId), eq(storedFiles.ownerUserId, input.ownerId), eq(storedFiles.dossierId, input.dossierId))).limit(1) : [];
      await assertStorageQuota(tx, input.ownerId, input.data.byteLength, previous?.byteSize ?? 0);
      const [active] = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.id, upload.id), eq(jobs.status, "leased"), eq(jobs.leaseToken, upload.leaseToken), gt(jobs.leaseExpiresAt, new Date()))).for("update").limit(1);
      if (!active) throw new Error("UPLOAD_LEASE_LOST");
      const [dossier] = await tx.select({ id: personalDossiers.id }).from(personalDossiers).where(and(eq(personalDossiers.id, input.dossierId), eq(personalDossiers.ownerUserId, input.ownerId), eq(personalDossiers.status, "open"))).for("update").limit(1);
      if (!dossier) throw new Error("DOSSIER_UNAVAILABLE");
      await tx.insert(storedFiles).values({ id: fileId, ownerUserId: input.ownerId, dossierId: input.dossierId, storageKey, mimeType: input.mimeType, byteSize: input.data.byteLength, sha256: createHash("sha256").update(input.data).digest("hex"), encryptionKeyVersion: encrypted.keyVersion, scanStatus: "clean" });
      const [changed] = await tx.update(personalDossierItems).set({ storedFileId: fileId, kind: "file", status: "added" }).where(and(eq(personalDossierItems.id, input.itemId), eq(personalDossierItems.dossierId, input.dossierId), input.expectedStoredFileId ? eq(personalDossierItems.storedFileId, input.expectedStoredFileId) : isNull(personalDossierItems.storedFileId)));
      if (!changed.affectedRows) throw new Error("ATTACHMENT_CHANGED");
      if (previous) {
        await enqueueJob({ kind: "storage.delete", key: `storage-delete:${previous.storageKey}`, payload: { storageKey: previous.storageKey }, maxAttempts: 10 }, tx);
        await tx.delete(storedFiles).where(eq(storedFiles.id, previous.id));
      }
      await tx.delete(artifactReservations).where(eq(artifactReservations.storageKey, storageKey));
      await tx.delete(jobs).where(eq(jobs.id, upload.id));
    });
    return { storedFileId: fileId, mimeType: input.mimeType, byteSize: input.data.byteLength };
  } catch (error) {
    // A connection failure may have happened after COMMIT. The successful
    // transaction deleted this transient row, so never unlink blindly here.
    await db.transaction(async tx => {
      const [pending] = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, upload.id)).for("update").limit(1);
      if (!pending) return;
      await tx.update(jobs).set({ status: "cancelled", leaseToken: null, leaseExpiresAt: null }).where(eq(jobs.id, upload.id));
      await enqueueJob({ kind: "storage.delete", key: `storage-delete:${storageKey}`, payload: { storageKey }, maxAttempts: 10 }, tx);
      await tx.delete(artifactReservations).where(eq(artifactReservations.storageKey, storageKey));
    }).catch(() => undefined);
    throw error;
  }
}
