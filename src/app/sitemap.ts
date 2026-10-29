import type { MetadataRoute } from 'next';
import { and, eq } from 'drizzle-orm';
import { database } from '@/platform/database/client';
import { catalogTemplates, catalogTemplateTranslations, catalogTemplateVersions } from '@/platform/database/schema';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const routes: MetadataRoute.Sitemap = ['fr', 'ar'].flatMap(locale => ['', '/catalogue', '/aide'].map(path => ({ url: `${origin}/${locale}${path}` })));
  if (!database) return routes;
  const translations = await database.select({ id: catalogTemplates.id, locale: catalogTemplateTranslations.locale, updatedAt: catalogTemplates.updatedAt })
    .from(catalogTemplates).innerJoin(catalogTemplateVersions, and(eq(catalogTemplates.publishedVersionId, catalogTemplateVersions.id), eq(catalogTemplateVersions.status, 'published')))
    .innerJoin(catalogTemplateTranslations, eq(catalogTemplateTranslations.versionId, catalogTemplateVersions.id))
    .where(eq(catalogTemplates.status, 'published'));
  const locales = new Map<string, Record<string, string>>();
  for (const row of translations) locales.set(row.id, { ...locales.get(row.id), [row.locale]: `${origin}/${row.locale}/catalogue/${row.id}` });
  return routes.concat(translations.map(row => ({ url: `${origin}/${row.locale}/catalogue/${row.id}`, lastModified: row.updatedAt, alternates: { languages: locales.get(row.id)! } })));
}
