import {after} from 'node:test';
after(async()=>{if(process.env.DATABASE_URL&&/^tndocs_verify\d+$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1))){const {database}=await import('../../src/platform/database/client');await database?.$client.end();}});
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
let enabled = false;
try { enabled = Boolean(process.env.DATABASE_URL && /^tndocs_verify\d+$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1))); } catch { /* Test database only. */ }

test("MariaDB scanned-attachment commits retire old files durably and failures cannot delete the referenced replacement", { skip: !enabled }, async () => {
  const oldKey = process.env.ATTACHMENT_ENCRYPTION_KEY_V1;
  if (!oldKey) process.env.ATTACHMENT_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64");
  const { database } = await import("../../src/platform/database/client");
  const { users, personalDossiers, personalDossierItems, storedFiles } = await import("../../src/platform/database/schema");
  const { jobs } = await import("../../src/platform/jobs/schema");
  const { artifactReservations } = await import("../../src/platform/jobs/artifacts-schema");
  const { storeScannedAttachment } = await import("../../src/modules/dossiers/attachments");
  const { LocalStorageAdapter } = await import("../../src/platform/storage/local");
  const { eq, inArray, sql } = await import("drizzle-orm");
  const db = database!, owner = randomUUID(), dossierId = randomUUID(), itemId = randomUUID();
  const root = await mkdtemp(join(tmpdir(), "tndocs-upload-fixture-"));
  const storage = new LocalStorageAdapter(root);
  const write = (key: string, data: Buffer) => storage.put(key, data);
  try {
    await db.insert(users).values({ id: owner, email: `upload-${owner}@example.test`, passwordHash: "fixture", status: "active", emailVerifiedAt: new Date() });
    await db.insert(personalDossiers).values({ id: dossierId, ownerUserId: owner, titleCiphertext: "fixture", encryptionKeyVersion: "v1" });
    await db.insert(personalDossierItems).values({ id: itemId, dossierId, labelCiphertext: "fixture", encryptionKeyVersion: "v1" });
    const input = { ownerId: owner, dossierId, itemId, expectedStoredFileId: null, data: Buffer.from("%PDF-scanned-fixture"), mimeType: "application/pdf" as const };
    const first = await storeScannedAttachment(input, write);
    const firstKey = `${owner}/${first.storedFileId}.enc`;
    assert.equal(await storage.exists(firstKey), true);
    assert.equal((await db.select().from(artifactReservations).where(eq(artifactReservations.storageKey, firstKey))).length, 0);
    const second = await storeScannedAttachment({ ...input, expectedStoredFileId: first.storedFileId, data: Buffer.from("%PDF-new-scanned-fixture") }, write);
    const secondKey = `${owner}/${second.storedFileId}.enc`;
    const [item] = await db.select().from(personalDossierItems).where(eq(personalDossierItems.id, itemId));
    assert.equal(item.storedFileId, second.storedFileId);
    assert.equal((await db.select().from(storedFiles).where(eq(storedFiles.id, first.storedFileId))).length, 0);
    assert.equal((await db.select().from(jobs).where(eq(jobs.deduplicationKey, `storage-delete:${firstKey}`))).length, 1);
    // Old bytes stay queued for cleanup; no post-commit unlink can throw into a
    // catch that might remove the new referenced object.
    assert.equal(await storage.exists(secondKey), true);
    await assert.rejects(() => storeScannedAttachment({ ...input, expectedStoredFileId: first.storedFileId }, write), /ATTACHMENT_CHANGED/);
    assert.equal((await db.select().from(personalDossierItems).where(eq(personalDossierItems.id, itemId)))[0].storedFileId, second.storedFileId);
    assert.equal(await storage.exists(secondKey), true);
    await assert.rejects(() => storeScannedAttachment({ ...input, expectedStoredFileId: second.storedFileId }, async (key, data) => { await write(key, data); throw new Error("SIMULATED_CRASH_AFTER_FILE_WRITE"); }), /SIMULATED_CRASH/);
    assert.equal((await db.select().from(personalDossierItems).where(eq(personalDossierItems.id, itemId)))[0].storedFileId, second.storedFileId);
    assert.equal(await storage.exists(secondKey), true);
    const cleanup = await db.select().from(jobs).where(sql`${jobs.kind} = 'storage.delete' and json_unquote(json_extract(${jobs.payload}, '$.storageKey')) like ${`${owner}/%`}`);
    assert.equal(cleanup.length, 3, "old object, stale CAS object and failed-write object each have durable cleanup");
    assert.equal(cleanup.some(job => job.payload.storageKey === secondKey), false, "live replacement must never be retired");
  } finally {
    const uploadJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.ownerUserId, owner));
    if (uploadJobs.length) await db.delete(artifactReservations).where(inArray(artifactReservations.jobId, uploadJobs.map(job => job.id)));
    await db.delete(jobs).where(sql`${jobs.ownerUserId} = ${owner} or (${jobs.kind} = 'storage.delete' and json_unquote(json_extract(${jobs.payload}, '$.storageKey')) like ${`${owner}/%`})`);
    await db.delete(users).where(eq(users.id, owner));
    await rm(root, { recursive: true, force: true });
    if (oldKey === undefined) delete process.env.ATTACHMENT_ENCRYPTION_KEY_V1;
  }
});
