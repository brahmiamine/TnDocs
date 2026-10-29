import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) process.env.DATABASE_URL = testUrl;
const run = testUrl ? test : test.skip;
let closePool: (() => Promise<void>) | null = null;
after(async () => { await closePool?.(); });
run('artifact reservations protect live/referenced files and durably queue abandoned objects only', async () => {
  const { database } = await import('../src/platform/database/client'); const db = database!; closePool = () => db.$client.end();
  const { eq, inArray } = await import('drizzle-orm');
  const { jobs } = await import('../src/platform/jobs/schema');
  const { artifactReservations } = await import('../src/platform/jobs/artifacts-schema');
  const { reserveArtifact, writeReservedArtifact, releaseCommittedArtifact, sweepAbandonedArtifacts } = await import('../src/platform/jobs/artifacts');
  const { completeJob } = await import('../src/platform/jobs/queue');
  const owner = randomUUID(); const leaseToken = randomUUID(); const id = randomUUID();
  const keys = Array.from({ length: 4 }, () => `${owner}/${randomUUID()}.enc`);
  const otherJob = randomUUID(); const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await db.insert(jobs).values({ id, kind: 'document.export', deduplicationKey: `artifact-test:${id}`, ownerUserId: owner, payload: {}, status: 'leased', leaseToken, leaseExpiresAt: new Date(Date.now() + 60_000) });
  const current = { id, leaseToken, ownerUserId: owner };
  try {
    await assert.rejects(reserveArtifact({ ...current, leaseToken: randomUUID() }, keys[0]), /ARTIFACT_LEASE_LOST/);
    await assert.rejects(reserveArtifact({ ...current, ownerUserId: randomUUID() }, keys[0]), /INVALID_ARTIFACT_KEY/);
    for (const key of keys.slice(0, 3)) await reserveArtifact(current, key);
    await reserveArtifact(current, keys[0]); // exact retry is idempotent
    await db.update(artifactReservations).set({ createdAt: old }).where(inArray(artifactReservations.storageKey, keys));
    await sweepAbandonedArtifacts();
    assert.equal((await db.select().from(artifactReservations).where(eq(artifactReservations.jobId, id))).length, 3);
    let writes = 0; await writeReservedArtifact(current, keys[0], async () => { writes++; }); assert.equal(writes, 1);
    await assert.rejects(writeReservedArtifact(current, keys[3], async () => { writes++; }), /ARTIFACT_RESERVATION_LOST/); assert.equal(writes, 1);
    assert.equal(await releaseCommittedArtifact(id, keys[0]), false);
    assert.equal(await completeJob(id, leaseToken, { storageKey: keys[0] }), true);
    // Any job result, not merely the reserving job/document exporter, protects a file.
    await db.insert(jobs).values({ id: otherJob, kind: 'signature.export', deduplicationKey: `artifact-test:${otherJob}`, ownerUserId: owner, payload: {}, status: 'done', result: { storageKey: keys[1] } });
    await sweepAbandonedArtifacts();
    const remaining = await db.select().from(artifactReservations).where(eq(artifactReservations.jobId, id));
    assert.deepEqual(new Set(remaining.map(row => row.storageKey)), new Set(keys.slice(0, 2)));
    const cleanup = await db.select().from(jobs).where(eq(jobs.deduplicationKey, `storage-delete:${keys[2]}`));
    assert.equal(cleanup.length, 1); assert.equal(cleanup[0].payload.storageKey, keys[2]);
    await sweepAbandonedArtifacts();
    assert.equal((await db.select().from(jobs).where(eq(jobs.deduplicationKey, `storage-delete:${keys[2]}`))).length, 1);
    assert.equal(await releaseCommittedArtifact(id, keys[0]), true);
    await assert.rejects(writeReservedArtifact(current, keys[0], async () => { writes++; }), /ARTIFACT_LEASE_LOST/);
    // Deleted job leaves the reservation intact until the independent sweeper queues cleanup.
    await db.delete(jobs).where(eq(jobs.id, otherJob));
    await sweepAbandonedArtifacts();
    assert.equal((await db.select().from(artifactReservations).where(eq(artifactReservations.storageKey, keys[1]))).length, 0);
    assert.equal((await db.select().from(jobs).where(eq(jobs.deduplicationKey, `storage-delete:${keys[1]}`))).length, 1);
  } finally {
    await db.delete(artifactReservations).where(inArray(artifactReservations.storageKey, keys));
    await db.delete(jobs).where(inArray(jobs.deduplicationKey, [`artifact-test:${id}`, `artifact-test:${otherJob}`, ...keys.map(key => `storage-delete:${key}`)]));
  }
});
