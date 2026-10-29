import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && /\/tndocs_verify\w*(?:\?|$)/.test(url));
test("Meili outbox payload uses valid document IDs, distinct templates, safe filters and cross-language queries", { skip: !enabled }, async () => {
  process.env.DATABASE_URL = url; process.env.MEILISEARCH_URL = "https://meili.example.invalid";
  const [{ database }, schema, { rebuildPublishedTemplateIndex, searchPublishedTemplatePage }] = await Promise.all([import("../src/platform/database/client"), import("../src/platform/database/schema"), import("../src/modules/catalog/search-index")]);
  const { eq } = await import("drizzle-orm"); assert.ok(database);
  const originalFetch = global.fetch, userId = randomUUID(), templateId = randomUUID(), draftId = randomUUID(), versionId = randomUUID();
  const [previous] = await database.select().from(schema.platformMetadata).where(eq(schema.platformMetadata.key, "catalog_search_index"));
  const indexed: Array<{ id: string; templateId: string }> = []; let settingsChecked = false, searchChecked = false;
  global.fetch = (async (raw, init) => {
    const target = new URL(String(raw)); assert.equal(target.origin, "https://meili.example.invalid");
    if (target.pathname.startsWith("/tasks/")) return Response.json({ status: "succeeded" });
    if (target.pathname.endsWith("/settings")) {
      assert.equal(init?.method, "PATCH"); const body = JSON.parse(String(init?.body));
      assert.equal(body.distinctAttribute, "templateId"); assert.ok(body.filterableAttributes.includes("organizationId")); assert.ok(body.synonyms.resiliation.includes("فسخ")); settingsChecked = true;
    } else if (target.pathname.endsWith("/documents")) indexed.push(...JSON.parse(String(init?.body)));
    else if (target.pathname.endsWith("/search")) {
      const body = JSON.parse(String(init?.body)); assert.equal(body.q, "resiliation"); assert.equal(body.offset, 120); assert.equal(body.limit, 25); assert.equal(body.filter.includes("locale"), false); assert.match(body.filter, /documentType = "official"/); searchChecked = true;
      return Response.json({ hits: [{ templateId }], estimatedTotalHits: 1 });
    }
    return Response.json({ taskUid: 1 });
  }) as typeof fetch;
  try {
    await database.insert(schema.users).values({ id: userId, email: `${userId}@meili.example.test`, passwordHash: "unusable-test-password", status: "active", emailVerifiedAt: new Date() });
    await database.insert(schema.catalogTemplates).values([{ id: templateId, createdBy: userId, status: "published", publishedVersionId: versionId, publishedAt: new Date(), documentType: "editable" }, { id: draftId, createdBy: userId, status: "draft", documentType: "editable" }]);
    await database.insert(schema.catalogTemplateVersions).values({ id: versionId, templateId, version: 1, createdBy: userId, status: "published" });
    await database.insert(schema.catalogTemplateTranslations).values(["fr", "ar"].map(locale => ({ versionId, locale: locale as "fr" | "ar", title: locale === "fr" ? "Résiliation fictive" : "فسخ خيالي", summary: "Fiction", instructions: "Fiction", body: "Fiction" })));
    assert.equal((await rebuildPublishedTemplateIndex()).configured, true);
    assert.equal(settingsChecked, true); assert.equal(indexed.filter(row => row.templateId === templateId).length, 2);
    assert.equal(indexed.some(row => row.templateId === draftId), false);
    assert.equal(indexed.every(row => /^[A-Za-z0-9_-]+$/.test(row.id)), true);
    const result = await searchPublishedTemplatePage("نحب نفسخ اشتراك", "ar", { offset: 120, limit: 25, documentType: "official" });
    assert.equal(searchChecked, true); assert.deepEqual(result?.ids, [templateId]);
    global.fetch = (async () => { throw new Error("SIMULATED_INDEX_OUTAGE"); }) as typeof fetch;
    assert.equal(await searchPublishedTemplatePage("resiliation", "ar"), null);
  } finally {
    global.fetch = originalFetch;
    await database.delete(schema.catalogTemplates).where(eq(schema.catalogTemplates.id, templateId));
    await database.delete(schema.catalogTemplates).where(eq(schema.catalogTemplates.id, draftId));
    await database.delete(schema.users).where(eq(schema.users.id, userId));
    if (previous) await database.update(schema.platformMetadata).set({ value: previous.value }).where(eq(schema.platformMetadata.key, "catalog_search_index")); else await database.delete(schema.platformMetadata).where(eq(schema.platformMetadata.key, "catalog_search_index"));
    await (database as unknown as { $client: { end(): Promise<void> } }).$client.end();
  }
});
