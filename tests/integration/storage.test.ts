import {after} from 'node:test';
after(async()=>{if(process.env.DATABASE_URL){const {database}=await import('../../src/platform/database/client');await database?.$client.end();}});
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
let enabled = false;
try { enabled = Boolean(url && /^tndocs_verify\d+$/.test(new URL(url).pathname.slice(1))); } catch { /* Never mutate an unrecognized database. */ }
if (enabled && url) process.env.DATABASE_URL = url;

/** All rows are uniquely named fixtures; cleanup never wipes the shared test DB. */
test("MariaDB retention preserves the full window, restores state and durably queues private-object cleanup", { skip: !enabled }, async () => {
  const { database } = await import("../../src/platform/database/client");
  const { users, personalDocuments, personalDossiers, storedFiles } = await import("../../src/platform/database/schema");
  const { jobs } = await import("../../src/platform/jobs/schema");
  const { trashMarkers } = await import("../../src/platform/retention/schema");
  const { trashOwnedResource, restoreOwnedResource } = await import("../../src/platform/retention/trash");
  const { runRetentionSweep, performStorageDelete } = await import("../../src/platform/retention/sweep");
  const { and, eq, inArray } = await import("drizzle-orm");
  const db = database!;
  const owner = randomUUID(); const documentId = randomUUID(); const finalId = randomUUID(); const expiredId = randomUUID();
  const dossierId = randomUUID(); const activeDossierId = randomUUID(); const fileId = randomUUID(); const referencedId = randomUUID(); const exportId = randomUUID();
  const fileKey = `${owner}/${fileId}.enc`; const referencedKey = `${owner}/${referencedId}.enc`; const artifactKey = `${owner}/${exportId}.enc`;
  const now = new Date(); const yesterday = new Date(now.getTime() - 86400000); const old = new Date(now.getTime() - 31 * 86400000);
  const signatureExportId = randomUUID(); const signatureKey = `${owner}/${signatureExportId}.enc`;
  const previousTtl = process.env.EXPORT_ARTIFACT_TTL_HOURS;
  process.env.EXPORT_ARTIFACT_TTL_HOURS = "24";
  try {
    await db.insert(users).values({ id: owner, email: `retention-${owner}@example.test`, passwordHash: "test-fixture", status: "active" });
    await db.insert(personalDocuments).values([
      { id: documentId, ownerUserId: owner, title: "Retention fixture", status: "draft" },
      { id: finalId, ownerUserId: owner, title: "Final fixture", status: "finalized" },
      { id: expiredId, ownerUserId: owner, title: "Expired fixture", status: "draft" },
    ]);
    await trashOwnedResource("document", documentId, owner, yesterday);
    const [first] = await db.select().from(trashMarkers).where(eq(trashMarkers.resourceId, documentId));
    await trashOwnedResource("document", documentId, owner, now);
    const [repeated] = await db.select().from(trashMarkers).where(eq(trashMarkers.resourceId, documentId));
    assert.equal(repeated.purgeAfter.getTime(), first.purgeAfter.getTime(), "repeated DELETE must not reset the window");
    await runRetentionSweep(now);
    assert.equal((await db.select().from(personalDocuments).where(eq(personalDocuments.id, documentId))).length, 1, "no early purge");
    assert.equal(await restoreOwnedResource("document", documentId, owner, now), "restored");
    assert.equal((await db.select().from(trashMarkers).where(eq(trashMarkers.resourceId, documentId))).length, 0);
    await trashOwnedResource("document", finalId, owner, yesterday);
    assert.equal(await restoreOwnedResource("document", finalId, owner, now), "restored");
    const [final] = await db.select().from(personalDocuments).where(eq(personalDocuments.id, finalId));
    assert.equal(final.status, "finalized", "restore must not silently unlock a finalized revision");
    assert.equal(final.currentRevision, 1);
    await trashOwnedResource("document", expiredId, owner, old);
    assert.equal(await restoreOwnedResource("document", expiredId, owner, now), "expired");
    await db.insert(personalDossiers).values([
      { id: dossierId, ownerUserId: owner, titleCiphertext: "fixture", encryptionKeyVersion: "v1" },
      { id: activeDossierId, ownerUserId: owner, titleCiphertext: "fixture", encryptionKeyVersion: "v1" },
    ]);
    await db.insert(storedFiles).values([
      { id: fileId, ownerUserId: owner, dossierId, storageKey: fileKey, mimeType: "application/pdf", byteSize: 10, sha256: "0".repeat(64), encryptionKeyVersion: "v1", scanStatus: "clean" },
      { id: referencedId, ownerUserId: owner, dossierId: activeDossierId, storageKey: referencedKey, mimeType: "application/pdf", byteSize: 10, sha256: "0".repeat(64), encryptionKeyVersion: "v1", scanStatus: "clean" },
    ]);
    await trashOwnedResource("dossier", dossierId, owner, old);
    await db.insert(jobs).values({ id: exportId, ownerUserId: owner, kind: "document.export", deduplicationKey: `fixture:${exportId}`, payload: { documentId, revision: 1, format: "pdf" }, status: "done", result: { storageKey: artifactKey, bytes: 10 }, updatedAt: old });
    await db.insert(jobs).values({ id: signatureExportId, ownerUserId: owner, kind: "signature.export", deduplicationKey: `fixture:${signatureExportId}`, payload: { fixture: true }, status: "done", result: { storageKey: signatureKey, bytes: 10 }, updatedAt: old });
    await runRetentionSweep(now);
    const [signedArtifact] = await db.select().from(jobs).where(eq(jobs.id, signatureExportId));
    assert.equal(signedArtifact.result?.expired, true);
    assert.equal((await db.select().from(jobs).where(eq(jobs.deduplicationKey, `storage-delete:${signatureKey}`))).length, 1);
    assert.equal((await db.select().from(personalDocuments).where(eq(personalDocuments.id, expiredId))).length, 0);
    assert.equal((await db.select().from(personalDossiers).where(eq(personalDossiers.id, dossierId))).length, 0);
    const [artifact] = await db.select().from(jobs).where(eq(jobs.id, exportId));
    assert.equal(artifact.result?.expired, true); assert.equal(artifact.result?.storageKey, undefined);
    const cleanup = await db.select().from(jobs).where(and(eq(jobs.kind, "storage.delete"), inArray(jobs.deduplicationKey, [`storage-delete:${fileKey}`, `storage-delete:${artifactKey}`])));
    assert.equal(cleanup.length, 2); assert.ok(cleanup.every((job) => job.status === "pending"));
    // This test calls cleanup only for a LIVE reference: the handler must refuse
    // before touching storage. No production or development file is unlinked.
    await assert.rejects(() => performStorageDelete({ storageKey: referencedKey }), /STORAGE_STILL_REFERENCED/);
  } finally {
    if (previousTtl === undefined) delete process.env.EXPORT_ARTIFACT_TTL_HOURS; else process.env.EXPORT_ARTIFACT_TTL_HOURS = previousTtl;
    await db.delete(jobs).where(inArray(jobs.deduplicationKey, [`fixture:${exportId}`, `fixture:${signatureExportId}`, `storage-delete:${signatureKey}`, `storage-delete:${fileKey}`, `storage-delete:${artifactKey}`]));
    await db.delete(users).where(eq(users.id, owner));
  }
});

test("MariaDB owner lock prevents parallel quota checks from overbooking the same account", { skip: !enabled }, async () => {
  const { database } = await import("../../src/platform/database/client");
  const { users, personalDossiers, storedFiles } = await import("../../src/platform/database/schema");
  const { assertStorageQuota } = await import("../../src/platform/storage/quota");
  const { eq } = await import("drizzle-orm");
  const db = database!; const owner = randomUUID(); const dossierId = randomUUID(); const initial = randomUUID();
  const previous = process.env.ACCOUNT_STORAGE_QUOTA_BYTES; process.env.ACCOUNT_STORAGE_QUOTA_BYTES = "1000";
  try {
    await db.insert(users).values({ id: owner, email: `quota-${owner}@example.test`, passwordHash: "test-fixture", status: "active" });
    await db.insert(personalDossiers).values({ id: dossierId, ownerUserId: owner, titleCiphertext: "fixture", encryptionKeyVersion: "v1" });
    await db.insert(storedFiles).values({ id: initial, ownerUserId: owner, dossierId, storageKey: `${owner}/${initial}.enc`, mimeType: "application/pdf", byteSize: 800, sha256: "0".repeat(64), encryptionKeyVersion: "v1", scanStatus: "clean" });
    const attempts = await Promise.allSettled(Array.from({ length: 2 }, () => db.transaction(async (tx) => {
      await assertStorageQuota(tx, owner, 150);
      const id = randomUUID();
      await tx.insert(storedFiles).values({ id, ownerUserId: owner, dossierId, storageKey: `${owner}/${id}.enc`, mimeType: "application/pdf", byteSize: 150, sha256: "0".repeat(64), encryptionKeyVersion: "v1", scanStatus: "clean" });
    })));
    assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = attempts.find((result) => result.status === "rejected") as PromiseRejectedResult;
    assert.match(String(rejection.reason), /STORAGE_QUOTA_EXCEEDED/);
    assert.equal((await db.select().from(storedFiles).where(eq(storedFiles.ownerUserId, owner))).reduce((sum, row) => sum + row.byteSize, 0), 950);
  } finally {
    if (previous === undefined) delete process.env.ACCOUNT_STORAGE_QUOTA_BYTES; else process.env.ACCOUNT_STORAGE_QUOTA_BYTES = previous;
    await db.delete(users).where(eq(users.id, owner));
  }
});
