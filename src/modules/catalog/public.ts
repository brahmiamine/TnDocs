import { and, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { database } from "@/platform/database/client";
import { catalogCategories, catalogCategoryTranslations, catalogOrganizations, catalogOrganizationTranslations, catalogTemplateCategories, catalogTemplateSources, catalogTemplateTranslations, catalogTemplateVersions, catalogTemplates } from "@/platform/database/schema";
import { searchPublishedTemplatePage } from "./search-index";
import { expandSearchQuery, escapeSearchLike, type SearchFilters } from "@/modules/search/policy";
import { getSearchConfiguration, recordSearchOutcome } from "@/modules/search/service";

export async function getPublicCategories(locale: "fr" | "ar") {
  if (!database) return [];
  const fallback = alias(catalogCategoryTranslations, "fallback_category_translation"), preferred = alias(catalogCategoryTranslations, "preferred_category_translation");
  return database.select({ id: catalogCategories.id, slug: catalogCategories.slug, name: sql<string>`coalesce(${preferred.name}, ${fallback.name})`, description: sql<string>`coalesce(${preferred.description}, ${fallback.description})` }).from(catalogCategories)
    .leftJoin(preferred, and(eq(preferred.categoryId, catalogCategories.id), eq(preferred.locale, locale)))
    .leftJoin(fallback, and(eq(fallback.categoryId, catalogCategories.id), eq(fallback.locale, locale === "fr" ? "ar" : "fr")))
    .where(and(eq(catalogCategories.active, 1), or(sql`${preferred.name} is not null`, sql`${fallback.name} is not null`))).orderBy(catalogCategories.sortOrder);
}
export async function getPublicOrganizations(locale: "fr" | "ar") {
  if (!database) return [];
  const rows = await database.select({ id: catalogOrganizations.id, name: catalogOrganizationTranslations.name, locale: catalogOrganizationTranslations.locale }).from(catalogOrganizations).innerJoin(catalogOrganizationTranslations, eq(catalogOrganizationTranslations.organizationId, catalogOrganizations.id)).where(eq(catalogOrganizations.active, 1));
  const chosen = new Map<string, { id: string; name: string; locale: "fr" | "ar" }>();
  for (const row of rows) if (!chosen.has(row.id) || row.locale === locale) chosen.set(row.id, row);
  return [...chosen.values()];
}
function normalizedSql(value: SQL): SQL {
  let result = sql`lower(${value})`;
  for (const [from, to] of [["أ", "ا"], ["إ", "ا"], ["آ", "ا"], ["ٱ", "ا"], ["ى", "ي"], ["ـ", ""], ["œ", "oe"]]) result = sql`replace(${result}, ${from}, ${to})`;
  return sql`regexp_replace(${result}, ${"[ً-ٰٟ]"}, '')`;
}
export type PublicTemplateOptions = SearchFilters & { query?: string; limit?: number; offset?: number; recordMetrics?: boolean; forceDatabaseSearch?: boolean };
export type PublicTemplateResult = Omit<NonNullable<Awaited<ReturnType<typeof getPublicTemplate>>>, "availableLocales">;
export type PublicTemplatePage = { templates: PublicTemplateResult[]; total: number; limit: number; offset: number; hasNext: boolean; searchMode: "database" | "index" };
export async function getPublicTemplatePage(locale: "fr" | "ar", options: PublicTemplateOptions = {}): Promise<PublicTemplatePage> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 24), 1), 100), offset = Math.max(Math.floor(options.offset ?? 0), 0);
  if (!database) return { templates: [], total: 0, limit, offset, hasNext: false, searchMode: "database" as const };
  const db = database, preferred = alias(catalogTemplateTranslations, "preferred_translation"), fallback = alias(catalogTemplateTranslations, "fallback_translation");
  const clauses: SQL[] = [eq(catalogTemplates.status, "published"), sql`${catalogTemplates.publishedVersionId} is not null`];
  if (options.documentType) clauses.push(eq(catalogTemplates.documentType, options.documentType));
  if (options.organizationId) clauses.push(eq(catalogTemplates.organizationId, options.organizationId));
  if (options.category) {
    const links = db.select({ versionId: catalogTemplateCategories.versionId }).from(catalogTemplateCategories).innerJoin(catalogCategories, eq(catalogCategories.id, catalogTemplateCategories.categoryId)).where(and(eq(catalogCategories.active, 1), eq(catalogCategories.slug, options.category)));
    clauses.push(inArray(catalogTemplateVersions.id, links));
  }
  const query = options.query?.trim().slice(0, 120);
  let indexed = query && !options.forceDatabaseSearch ? await searchPublishedTemplatePage(query, locale, { ...options, limit, offset }) : null;
  // Meili has a technical hit window, never a catalogue quota. Beyond it continue through SQL.
  if (offset >= 100_000) indexed = null;
  if (indexed) {
    if (!indexed.ids.length) return getPublicTemplatePage(locale, { ...options, forceDatabaseSearch: true });
    clauses.push(inArray(catalogTemplates.id, indexed.ids));
  } else if (query) {
    const { dictionary } = await getSearchConfiguration(), { terms } = expandSearchQuery(query, dictionary);
    if (!terms.length) return { templates: [], total: 0, limit, offset, hasNext: false, searchMode: "database" as const };
    const matchingVersions = db.select({ versionId: catalogTemplateTranslations.versionId }).from(catalogTemplateTranslations).where(or(...terms.map(term => or(
      like(normalizedSql(sql`${catalogTemplateTranslations.title}`), `%${escapeSearchLike(term)}%`),
      like(normalizedSql(sql`${catalogTemplateTranslations.summary}`), `%${escapeSearchLike(term)}%`),
      like(normalizedSql(sql`${catalogTemplateTranslations.instructions}`), `%${escapeSearchLike(term)}%`),
    ))));
    const matchingOrganizations = db.select({ id: catalogOrganizationTranslations.organizationId }).from(catalogOrganizationTranslations).where(or(...terms.map(term => like(normalizedSql(sql`${catalogOrganizationTranslations.name}`), `%${escapeSearchLike(term)}%`))));
    clauses.push(or(inArray(catalogTemplateVersions.id, matchingVersions), inArray(catalogTemplates.organizationId, matchingOrganizations))!);
  }
  const fields = {
    id: catalogTemplates.id, documentType: catalogTemplates.documentType, organizationId: catalogTemplates.organizationId, publishedAt: catalogTemplates.publishedAt,
    versionId: catalogTemplateVersions.id, title: sql<string>`coalesce(${preferred.title}, ${fallback.title})`, summary: sql<string>`coalesce(${preferred.summary}, ${fallback.summary})`,
    instructions: sql<string>`coalesce(${preferred.instructions}, ${fallback.instructions})`, body: sql<string>`coalesce(${preferred.body}, ${fallback.body})`,
    contentLocale: sql<"fr" | "ar">`coalesce(${preferred.locale}, ${fallback.locale})`, formSchema: catalogTemplateVersions.formSchema, documentContent: catalogTemplateVersions.documentContent,
  };
  const joined = () => db.select(fields).from(catalogTemplates).innerJoin(catalogTemplateVersions, and(eq(catalogTemplates.publishedVersionId, catalogTemplateVersions.id), eq(catalogTemplateVersions.templateId, catalogTemplates.id)))
    .leftJoin(preferred, and(eq(preferred.versionId, catalogTemplateVersions.id), eq(preferred.locale, locale)))
    .leftJoin(fallback, and(eq(fallback.versionId, catalogTemplateVersions.id), eq(fallback.locale, locale === "fr" ? "ar" : "fr")));
  clauses.push(or(sql`${preferred.locale} is not null`, sql`${fallback.locale} is not null`)!);
  const rows = await joined().where(and(...clauses)).orderBy(desc(catalogTemplates.publishedAt), catalogTemplates.id).limit(limit).offset(indexed ? 0 : offset);
  if (indexed && !rows.length && query) return getPublicTemplatePage(locale, { ...options, forceDatabaseSearch: true });
  let total = indexed?.total ?? 0;
  if (!indexed) {
    const [count] = await db.select({ total: sql<number>`count(*)` }).from(catalogTemplates).innerJoin(catalogTemplateVersions, and(eq(catalogTemplates.publishedVersionId, catalogTemplateVersions.id), eq(catalogTemplateVersions.templateId, catalogTemplates.id)))
      .leftJoin(preferred, and(eq(preferred.versionId, catalogTemplateVersions.id), eq(preferred.locale, locale))).leftJoin(fallback, and(eq(fallback.versionId, catalogTemplateVersions.id), eq(fallback.locale, locale === "fr" ? "ar" : "fr"))).where(and(...clauses));
    total = Number(count.total);
  }
  const sources = rows.length ? await db.select({ versionId: catalogTemplateSources.versionId, name: catalogTemplateSources.sourceName, url: catalogTemplateSources.sourceUrl, official: catalogTemplateSources.official, checkedAt: catalogTemplateSources.checkedAt }).from(catalogTemplateSources).where(inArray(catalogTemplateSources.versionId, rows.map(row => row.versionId))) : [];
  let templates = rows.map(row => ({ ...row, translationMissing: row.contentLocale !== locale, formSchema: row.documentType === "editable" ? row.formSchema : null, documentContent: row.documentType === "official" ? null : row.documentContent, body: row.documentType === "official" ? "" : row.body, sources: sources.filter(source => source.versionId === row.versionId).map(({ name, url, official, checkedAt }) => ({ name, url, official, checkedAt })) }));
  if (indexed) { const rank = new Map(indexed.ids.map((id, i) => [id, i])); templates = templates.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)); }
  if (query && options.recordMetrics !== false) await recordSearchOutcome(templates.length > 0);
  return { templates, total, limit, offset, hasNext: offset + limit < total, searchMode: indexed ? "index" as const : "database" as const };
}
export async function getPublicTemplates(locale: "fr" | "ar", options: PublicTemplateOptions = {}) { return (await getPublicTemplatePage(locale, options)).templates; }
export async function getPublicTemplate(templateId: string, locale: "fr" | "ar") {
  if (!database) return null;
  const rows = await database.select({ template: catalogTemplates, version: catalogTemplateVersions, translation: catalogTemplateTranslations }).from(catalogTemplates).innerJoin(catalogTemplateVersions, and(eq(catalogTemplates.publishedVersionId, catalogTemplateVersions.id), eq(catalogTemplateVersions.templateId, catalogTemplates.id))).innerJoin(catalogTemplateTranslations, eq(catalogTemplateTranslations.versionId, catalogTemplateVersions.id)).where(and(eq(catalogTemplates.id, templateId), eq(catalogTemplates.status, "published")));
  const row = rows.find(row => row.translation.locale === locale) ?? rows[0]; if (!row) return null;
  const sources = await database.select({ name: catalogTemplateSources.sourceName, url: catalogTemplateSources.sourceUrl, official: catalogTemplateSources.official, checkedAt: catalogTemplateSources.checkedAt }).from(catalogTemplateSources).where(eq(catalogTemplateSources.versionId, row.version.id));
  return { id: row.template.id, documentType: row.template.documentType, organizationId: row.template.organizationId, publishedAt: row.template.publishedAt, versionId: row.version.id, title: row.translation.title, summary: row.translation.summary, instructions: row.translation.instructions, body: row.template.documentType === "official" ? "" : row.translation.body, contentLocale: row.translation.locale, translationMissing: row.translation.locale !== locale, availableLocales: rows.map(item => item.translation.locale), formSchema: row.template.documentType === "editable" ? row.version.formSchema : null, documentContent: row.template.documentType === "official" ? null : row.version.documentContent, sources };
}
