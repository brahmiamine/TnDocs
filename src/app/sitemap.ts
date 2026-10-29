import type { MetadataRoute } from "next";
import { and, desc, eq } from "drizzle-orm";
import { database } from "@/platform/database/client";
import {
  catalogCategories,
  catalogCategoryTranslations,
  catalogTemplateTranslations,
  catalogTemplateVersions,
  catalogTemplates,
} from "@/platform/database/schema";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const entries: MetadataRoute.Sitemap = [];
  const locales = ["fr", "ar"] as const;
  for (const locale of locales) {
    entries.push(
      { url: baseUrl + "/" + locale, alternates: { languages: { fr: baseUrl + "/fr", ar: baseUrl + "/ar" } } },
      { url: baseUrl + "/" + locale + "/catalogue", alternates: { languages: { fr: baseUrl + "/fr/catalogue", ar: baseUrl + "/ar/catalogue" } } },
    );
  }
  const db = database;
  if (!db) return entries;

  const [categories, frenchTemplates, arabicTemplates] = await Promise.all([
    db.select({ slug: catalogCategories.slug, locale: catalogCategoryTranslations.locale, updatedAt: catalogCategories.createdAt })
      .from(catalogCategories).innerJoin(catalogCategoryTranslations, eq(catalogCategoryTranslations.categoryId, catalogCategories.id))
      .where(eq(catalogCategories.active, 1)),
    ...(["fr", "ar"] as const).map((locale) => db.select({
      id: catalogTemplates.id, publishedAt: catalogTemplates.publishedAt, updatedAt: catalogTemplates.updatedAt,
    }).from(catalogTemplates)
      .innerJoin(catalogTemplateVersions, and(eq(catalogTemplateVersions.id, catalogTemplates.publishedVersionId), eq(catalogTemplateVersions.status, "published")))
      .innerJoin(catalogTemplateTranslations, and(eq(catalogTemplateTranslations.versionId, catalogTemplateVersions.id), eq(catalogTemplateTranslations.locale, locale)))
      .where(eq(catalogTemplates.status, "published")).orderBy(desc(catalogTemplates.publishedAt))),
  ]);

  const translations = new Map<string, Set<string>>([
    ["fr", new Set(frenchTemplates.map((item) => item.id))],
    ["ar", new Set(arabicTemplates.map((item) => item.id))],
  ]);
  for (const [locale, templates] of [["fr", frenchTemplates], ["ar", arabicTemplates]] as const) {
    for (const template of templates) {
      const languages: Record<string, string> = {};
      for (const alternate of locales) {
        if (translations.get(alternate)?.has(template.id)) languages[alternate] = baseUrl + "/" + alternate + "/catalogue/" + template.id;
      }
      entries.push({
        url: baseUrl + "/" + locale + "/catalogue/" + template.id,
        lastModified: template.updatedAt ?? template.publishedAt ?? undefined,
        alternates: { languages },
      });
    }
  }

  for (const category of categories) {
    const languages: Record<string, string> = {};
    for (const localized of categories) {
      if (localized.slug === category.slug) languages[localized.locale] = baseUrl + "/" + localized.locale + "/catalogue/categories/" + localized.slug;
    }
    entries.push({
      url: baseUrl + "/" + category.locale + "/catalogue/categories/" + category.slug,
      lastModified: category.updatedAt,
      alternates: { languages },
    });
  }
  return entries;
}
