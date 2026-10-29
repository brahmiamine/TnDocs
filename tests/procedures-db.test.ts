import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && /\/tndocs_verify\w*(?:\?|$)/.test(url));
test("MariaDB: publication and public guides require reviewed current sources; revoked rights hide a guide", { skip: !enabled }, async () => {
  process.env.DATABASE_URL = url;
  const [{ database }, central, sourceSchema, procedureSchema, { publishGuide, listPublishedGuides }] = await Promise.all([import("../src/platform/database/client"), import("../src/platform/database/schema"), import("../src/modules/sources/db-schema"), import("../src/modules/procedures/db-schema"), import("../src/modules/procedures/service")]);
  const { eq } = await import("drizzle-orm"); assert.ok(database);
  const userId = randomUUID(), sourceId = randomUUID(), observationId = randomUUID(), hash = "a".repeat(64);
  let guideId: string | undefined;
  try {
    await database.insert(central.users).values({ id: userId, email: `${userId}@procedures.example.test`, passwordHash: "unusable-test-password", status: "active", role: "admin", emailVerifiedAt: new Date() });
    await database.insert(sourceSchema.registeredSources).values({ id: sourceId, name: "Fictional integration source", url: "https://example.org/fiction", canonicalUrlHash: randomUUID().replace(/-/g, "").padEnd(64, "0"), reusePermission: "pending", approved: 1, active: 1, checkedAt: new Date(), latestHash: hash, createdBy: userId });
    await database.insert(sourceSchema.sourceObservations).values({ id: observationId, sourceId, sha256: hash, mimeType: "text/plain", byteSize: 7, textPreview: "fiction", status: "pending" });
    const label = { fr: "Donnée fictive", ar: "معلومة خيالية" };
    const content = { title: label, summary: label, countries: ["TN"], aliases: ["fiction"], start: "result", nodes: [{ id: "result", kind: "recommendation" as const, label, sourceIds: [sourceId], templateIds: [], facts: [{ label, value: null, sourceIds: [] }] }] };
    const input = { expectedVersion: 0, content, verifiedAt: new Date() };
    await assert.rejects(publishGuide(input, userId), /SOURCE_NOT_VERIFIED/);
    await database.update(sourceSchema.registeredSources).set({ reusePermission: "allowed" }).where(eq(sourceSchema.registeredSources.id, sourceId));
    await assert.rejects(publishGuide(input, userId), /SOURCE_OBSERVATION_NOT_REVIEWED/);
    await database.update(sourceSchema.sourceObservations).set({ status: "approved", reviewedBy: userId, reviewedAt: new Date() }).where(eq(sourceSchema.sourceObservations.id, observationId));
    const published = await publishGuide(input, userId); guideId = published.id;
    assert.equal((await listPublishedGuides()).some(guide => guide.id === guideId), true);
    await assert.rejects(publishGuide({ ...input, id: guideId, expectedVersion: 0 }, userId), /VERSION_CONFLICT/);
    await database.update(sourceSchema.registeredSources).set({ latestHash: "b".repeat(64) }).where(eq(sourceSchema.registeredSources.id, sourceId));
    assert.equal((await listPublishedGuides()).some(guide => guide.id === guideId), false);
    await database.update(sourceSchema.registeredSources).set({ latestHash: hash, reusePermission: "forbidden" }).where(eq(sourceSchema.registeredSources.id, sourceId));
    assert.equal((await listPublishedGuides()).some(guide => guide.id === guideId), false);
    await database.update(sourceSchema.registeredSources).set({ reusePermission: "allowed", approved: 0 }).where(eq(sourceSchema.registeredSources.id, sourceId));
    assert.equal((await listPublishedGuides()).some(guide => guide.id === guideId), false);
    await database.update(sourceSchema.registeredSources).set({ approved: 1 }).where(eq(sourceSchema.registeredSources.id, sourceId));
    await database.update(procedureSchema.procedureGuides).set({ publishedVersion: null }).where(eq(procedureSchema.procedureGuides.id, guideId));
    assert.equal((await listPublishedGuides()).some(guide => guide.id === guideId), false);
    await database.delete(central.users).where(eq(central.users.id, userId));
    const [surviving] = await database.select().from(sourceSchema.registeredSources).where(eq(sourceSchema.registeredSources.id, sourceId));
    assert.equal(surviving.createdBy, null);
    const [version] = await database.select().from(procedureSchema.procedureGuideVersions).where(eq(procedureSchema.procedureGuideVersions.guideId, guideId));
    assert.equal(version.reviewedBy, null);
  } finally {
    if (guideId) await database.delete(procedureSchema.procedureGuides).where(eq(procedureSchema.procedureGuides.id, guideId));
    await database.delete(sourceSchema.registeredSources).where(eq(sourceSchema.registeredSources.id, sourceId));
    await database.delete(central.users).where(eq(central.users.id, userId));
    await (database as unknown as { $client: { end(): Promise<void> } }).$client.end();
  }
});
