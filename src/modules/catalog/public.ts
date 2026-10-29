import { and, desc, eq, inArray, like } from "drizzle-orm";
import { database } from "@/platform/database/client";
import {
  catalogCategories,
  catalogCategoryTranslations,
  catalogTemplateCategories,
  catalogTemplateSources,
  catalogTemplateTranslations,
  catalogTemplateVersions,
  catalogTemplates,
} from "@/platform/database/schema";
import { searchPublishedTemplateIds } from "./search-index";

export async function getPublicCategories(locale: "fr" | "ar") {
  if (!database) return [];
  return database.select({
    id: catalogCategories.id,
    slug: catalogCategories.slug,
    name: catalogCategoryTranslations.name,
    description: catalogCategoryTranslations.description,
  }).from(catalogCategories)
    .innerJoin(catalogCategoryTranslations, and(
      eq(catalogCategoryTranslations.categoryId, catalogCategories.id),
      eq(catalogCategoryTranslations.locale, locale),
    ))
    .where(eq(catalogCategories.active, 1))
    .orderBy(catalogCategories.sortOrder, catalogCategoryTranslations.name);
}

export async function getPublicTemplates(locale: "fr" | "ar", options: { category?: string; query?: string; limit?: number } = {}) {
  if (!database) return [];
  const clauses = [eq(catalogTemplates.status, "published")];
  const searchIds = options.query ? await searchPublishedTemplateIds(options.query, options.category) : null;
  if (searchIds !== null) {
    if (searchIds.length === 0) return [];
    clauses.push(inArray(catalogTemplates.id, searchIds));
  } else if (options.query) {
    clauses.push(like(catalogTemplateTranslations.title, `%${options.query}%`));
  }
  if (options.category) {
    const [category] = await database.select({ id: catalogCategories.id }).from(catalogCategories).where(and(
      eq(catalogCategories.slug, options.category), eq(catalogCategories.active, 1),
    )).limit(1);
    if (!category) return [];
    const linkedTemplates = database.select({ templateId: catalogTemplates.id })
      .from(catalogTemplates).innerJoin(catalogTemplateCategories, eq(catalogTemplates.publishedVersionId, catalogTemplateCategories.versionId))
      .where(eq(catalogTemplateCategories.categoryId, category.id));
    clauses.push(inArray(catalogTemplates.id, linkedTemplates));
  }
  const rows = await database.select({
    id: catalogTemplates.id,
    documentType: catalogTemplates.documentType,
    publishedAt: catalogTemplates.publishedAt,
    versionId: catalogTemplateVersions.id,
    title: catalogTemplateTranslations.title,
    summary: catalogTemplateTranslations.summary,
    instructions: catalogTemplateTranslations.instructions,
    body: catalogTemplateTranslations.body,
    formSchema: catalogTemplateVersions.formSchema,
    documentContent: catalogTemplateVersions.documentContent,
  }).from(catalogTemplates)
    .innerJoin(catalogTemplateVersions, eq(catalogTemplates.publishedVersionId, catalogTemplateVersions.id))
    .innerJoin(catalogTemplateTranslations, and(
      eq(catalogTemplateTranslations.versionId, catalogTemplateVersions.id),
      eq(catalogTemplateTranslations.locale, locale),
    ))
    .where(and(...clauses))
    .orderBy(desc(catalogTemplates.publishedAt))
    .limit(Math.min(Math.max(options.limit ?? 24, 1), 100));

  if (rows.length === 0) return [];
  const sourceRows = await database.select({
    versionId: catalogTemplateSources.versionId,
    name: catalogTemplateSources.sourceName,
    url: catalogTemplateSources.sourceUrl,
    official: catalogTemplateSources.official,
    checkedAt: catalogTemplateSources.checkedAt,
  }).from(catalogTemplateSources).where(inArray(catalogTemplateSources.versionId, rows.map((row) => row.versionId)));
  const sourceMap = new Map<string, typeof sourceRows>();
  for (const source of sourceRows) sourceMap.set(source.versionId, [...(sourceMap.get(source.versionId) ?? []), source]);

  const results = rows.map((row) => ({
    ...row,
    formSchema: row.documentType === "editable" ? row.formSchema : null,
    documentContent: row.documentType === "official" ? null : row.documentContent,
    body: row.documentType === "official" ? "" : row.body,
    sources: (sourceMap.get(row.versionId) ?? []).map((source) => ({
      name: source.name, url: source.url, official: source.official, checkedAt: source.checkedAt,
    })),
  }));
  if (!searchIds) return results;
  const byId = new Map(results.map((row) => [row.id, row]));
  return searchIds.map((id) => byId.get(id)).filter((row): row is (typeof results)[number] => Boolean(row));
}

export async function getPublicTemplate(templateId: string, locale: "fr" | "ar") {
  if (!database) return null;
  const [row] = await database.select({
    id: catalogTemplates.id,
    documentType: catalogTemplates.documentType,
    publishedAt: catalogTemplates.publishedAt,
    versionId: catalogTemplateVersions.id,
    title: catalogTemplateTranslations.title,
    summary: catalogTemplateTranslations.summary,
    instructions: catalogTemplateTranslations.instructions,
    body: catalogTemplateTranslations.body,
    formSchema: catalogTemplateVersions.formSchema,
    documentContent: catalogTemplateVersions.documentContent,
  }).from(catalogTemplates)
    .innerJoin(catalogTemplateVersions, eq(catalogTemplates.publishedVersionId, catalogTemplateVersions.id))
    .innerJoin(catalogTemplateTranslations, and(
      eq(catalogTemplateTranslations.versionId, catalogTemplateVersions.id),
      eq(catalogTemplateTranslations.locale, locale),
    ))
    .where(and(eq(catalogTemplates.id, templateId), eq(catalogTemplates.status, "published")))
    .limit(1);
  if (!row) return null;
  const sources = await database.select({
    name: catalogTemplateSources.sourceName,
    url: catalogTemplateSources.sourceUrl,
    official: catalogTemplateSources.official,
    checkedAt: catalogTemplateSources.checkedAt,
  }).from(catalogTemplateSources).where(eq(catalogTemplateSources.versionId, row.versionId));
  return {
    ...row,
    formSchema: row.documentType === "editable" ? row.formSchema : null,
    documentContent: row.documentType === "official" ? null : row.documentContent,
    body: row.documentType === "official" ? "" : row.body,
    sources,
  };
}
