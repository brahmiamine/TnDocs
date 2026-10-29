import { randomUUID } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { database } from "@/platform/database/client";
import {
  catalogCategories,
  catalogTemplateCategories,
  catalogTemplateSources,
  catalogTemplateTranslations,
  catalogTemplateVersions,
  catalogTemplates,
} from "@/platform/database/schema";
import type { CatalogDraftInput } from "./admin-schema";

export async function createCatalogDraft(input: CatalogDraftInput, actorId: string) {
  if (!database) throw new Error("Database is not configured");
  const categories = await database.select({ id: catalogCategories.id, slug: catalogCategories.slug })
    .from(catalogCategories).where(inArray(catalogCategories.slug, [...new Set(input.categorySlugs)]));
  if (categories.length !== new Set(input.categorySlugs).size) throw new Error("UNKNOWN_CATEGORY");
  const templateId = randomUUID();
  const versionId = randomUUID();

  await database.transaction(async (tx) => {
    await tx.insert(catalogTemplates).values({ id: templateId, status: "draft", documentType: input.documentType, organizationId: input.organizationId ?? null, createdBy: actorId });
    await tx.insert(catalogTemplateVersions).values({
      id: versionId, templateId, version: 1, formSchema: input.formSchema ?? null,
      documentContent: input.documentContent ?? null, createdBy: actorId,
    });
    const translations = (["fr", "ar"] as const).flatMap((locale) => {
      const translation = input.translations[locale];
      return translation ? [{ versionId, locale, ...translation }] : [];
    });
    if (translations.length) await tx.insert(catalogTemplateTranslations).values(translations);
    await tx.insert(catalogTemplateCategories).values(categories.map(({ id }) => ({ versionId, categoryId: id })));
    const sources = input.sources.map((source) => ({
      id: randomUUID(), versionId, sourceName: source.sourceName, sourceUrl: source.sourceUrl,
      official: source.official ? 1 : 0, reusePermission: source.reusePermission,
      checkedAt: source.reviewed ? new Date() : null,
    }));
    if (sources.length) await tx.insert(catalogTemplateSources).values(sources);
  });

  return { templateId, versionId, version: 1, status: "draft" as const };
}

export async function addCatalogDraftVersion(templateId: string, input: CatalogDraftInput, actorId: string) {
  if (!database) throw new Error("Database is not configured");
  const [template] = await database.select({ id: catalogTemplates.id, status: catalogTemplates.status })
    .from(catalogTemplates).where(eq(catalogTemplates.id, templateId)).limit(1);
  if (!template || template.status === "archived") throw new Error("TEMPLATE_NOT_EDITABLE");
  const categories = await database.select({ id: catalogCategories.id, slug: catalogCategories.slug })
    .from(catalogCategories).where(inArray(catalogCategories.slug, [...new Set(input.categorySlugs)]));
  if (categories.length !== new Set(input.categorySlugs).size) throw new Error("UNKNOWN_CATEGORY");
  const [latest] = await database.select({ version: catalogTemplateVersions.version }).from(catalogTemplateVersions)
    .where(eq(catalogTemplateVersions.templateId, templateId)).orderBy(desc(catalogTemplateVersions.version)).limit(1);
  const versionId = randomUUID();
  const version = (latest?.version ?? 0) + 1;

  await database.transaction(async (tx) => {
    await tx.insert(catalogTemplateVersions).values({
      id: versionId, templateId, version, status: "draft", formSchema: input.formSchema ?? null,
      documentContent: input.documentContent ?? null, createdBy: actorId,
    });
    const translations = (["fr", "ar"] as const).flatMap((locale) => {
      const translation = input.translations[locale];
      return translation ? [{ versionId, locale, ...translation }] : [];
    });
    await tx.insert(catalogTemplateTranslations).values(translations);
    await tx.insert(catalogTemplateCategories).values(categories.map(({ id }) => ({ versionId, categoryId: id })));
    const sources = input.sources.map((source) => ({
      id: randomUUID(), versionId, sourceName: source.sourceName, sourceUrl: source.sourceUrl,
      official: source.official ? 1 : 0, reusePermission: source.reusePermission,
      checkedAt: source.reviewed ? new Date() : null,
    }));
    if (sources.length) await tx.insert(catalogTemplateSources).values(sources);
  });

  return { templateId, versionId, version, status: "draft" as const };
}
