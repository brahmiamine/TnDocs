import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && /\/tndocs_verify\w*(?:\?|$)/.test(url));
test("MariaDB bilingual public-only fallback paginates past 100 and marks missing translations", { skip: !enabled }, async () => {
  process.env.DATABASE_URL = url; delete process.env.MEILISEARCH_URL;
  const [{ database }, schema, { getPublicTemplatePage, getPublicTemplate }] = await Promise.all([import("../src/platform/database/client"), import("../src/platform/database/schema"), import("../src/modules/catalog/public")]);
  const { eq, inArray } = await import("drizzle-orm"); assert.ok(database);
  const userId = randomUUID(), organizationId = randomUUID(), categoryId = randomUUID(), marker = randomUUID().replace(/-/g, ""), ids: string[] = [];
  try {
    await database.insert(schema.users).values({ id: userId, email: `${userId}@search.example.test`, passwordHash: "unusable-test-password", status: "active", emailVerifiedAt: new Date() });
    await database.insert(schema.catalogOrganizations).values({ id: organizationId, slug: `fictitious-${marker}` });
    await database.insert(schema.catalogCategories).values({ id: categoryId, slug: `fictitious-${marker}` });
    for (let index = 0; index < 126; index++) {
      const id = randomUUID(), versionId = randomUUID(); ids.push(id);
      await database.insert(schema.catalogTemplates).values({ id, createdBy: userId, status: index < 125 ? "published" : "draft", publishedVersionId: versionId, publishedAt: new Date(), documentType: index % 2 === 0 ? "editable" : "official", organizationId: index < 60 ? organizationId : null });
      await database.insert(schema.catalogTemplateVersions).values({ id: versionId, templateId: id, version: 1, createdBy: userId, status: index < 125 ? "published" : "draft" });
      await database.insert(schema.catalogTemplateTranslations).values({ versionId, locale: "fr", title: `Résiliation ${marker} ${index}`, summary: `Fiction française ${marker}`, instructions: "Fiction de test", body: "Corps de test" });
      if (index === 0) await database.insert(schema.catalogTemplateTranslations).values({ versionId, locale: "ar", title: `إلغاء ${marker}`, summary: "ملخص خيالي", instructions: "اختبار", body: "نص خيالي" });
      if (index % 10 === 0) await database.insert(schema.catalogTemplateCategories).values({ versionId, categoryId });
    }
    const first = await getPublicTemplatePage("ar", { query: marker, limit: 100, forceDatabaseSearch: true, recordMetrics: false });
    const second = await getPublicTemplatePage("ar", { query: marker, limit: 100, offset: 100, forceDatabaseSearch: true, recordMetrics: false });
    assert.equal(first.total, 125); assert.equal(first.templates.length, 100); assert.equal(first.hasNext, true);
    assert.equal(second.templates.length, 25); assert.equal(second.hasNext, false);
    assert.equal(new Set([...first.templates, ...second.templates].map(row => row.id)).size, 125);
    assert.equal([...first.templates, ...second.templates].some(row => row.id === ids[125]), false);
    assert.equal(await getPublicTemplate(ids[125], "ar"), null);
    const bilingual = await getPublicTemplate(ids[0], "ar"), fallback = await getPublicTemplate(ids[1], "ar");
    assert.equal(bilingual?.contentLocale, "ar"); assert.equal(bilingual?.translationMissing, false);
    assert.equal(fallback?.contentLocale, "fr"); assert.equal(fallback?.translationMissing, true); assert.equal(fallback?.body, "");
    const official = await getPublicTemplatePage("ar", { query: marker, documentType: "official", limit: 100, forceDatabaseSearch: true, recordMetrics: false });
    assert.equal(official.total, 62); assert.equal(official.templates.every(row => row.body === "" && row.formSchema === null), true);
    const organization = await getPublicTemplatePage("ar", { query: marker, organizationId, forceDatabaseSearch: true, recordMetrics: false });
    assert.equal(organization.total, 60);
    const category = await getPublicTemplatePage("fr", { query: marker, category: `fictitious-${marker}`, forceDatabaseSearch: true, recordMetrics: false });
    assert.equal(category.total, 13);
    const arabicSynonym = await getPublicTemplatePage("ar", { query: "فَسْخ", category: `fictitious-${marker}`, forceDatabaseSearch: true, recordMetrics: false });
    assert.equal(arabicSynonym.total, 13);
    const frenchAccent = await getPublicTemplatePage("ar", { query: "RÉSILIATION", category: `fictitious-${marker}`, forceDatabaseSearch: true, recordMetrics: false });
    assert.equal(frenchAccent.total, 13);
    const wildcard = await getPublicTemplatePage("fr", { query: "%%%___", forceDatabaseSearch: true, recordMetrics: false });
    assert.equal(wildcard.total, 0);
  } finally {
    if (ids.length) await database.delete(schema.catalogTemplates).where(inArray(schema.catalogTemplates.id, ids));
    await database.delete(schema.catalogCategories).where(eq(schema.catalogCategories.id, categoryId));
    await database.delete(schema.catalogOrganizations).where(eq(schema.catalogOrganizations.id, organizationId));
    await database.delete(schema.users).where(eq(schema.users.id, userId));
    await (database as unknown as { $client: { end(): Promise<void> } }).$client.end();
  }
});
