import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { database } from "@/platform/database/client";
import {
  catalogCategories,
  catalogOrganizations,
  catalogTemplateCategories,
  catalogTemplateSources,
  catalogTemplateTranslations,
  catalogTemplateVersions,
  catalogTemplates,
} from "@/platform/database/schema";
import type { CatalogDraftInput } from "./admin-schema";
import { lockCatalogTaxonomy } from "./taxonomy";
import type { JobTransaction } from "@/platform/jobs/queue";

async function activeClassification(tx:JobTransaction,input:CatalogDraftInput){
  const slugs=[...new Set(input.categorySlugs)];
  const categories=await tx.select({id:catalogCategories.id,slug:catalogCategories.slug}).from(catalogCategories).where(and(inArray(catalogCategories.slug,slugs),eq(catalogCategories.active,1))).for("update");
  if(categories.length!==slugs.length)throw new Error("UNKNOWN_CATEGORY");
  if(input.organizationId){const [organization]=await tx.select({id:catalogOrganizations.id}).from(catalogOrganizations).where(and(eq(catalogOrganizations.id,input.organizationId),eq(catalogOrganizations.active,1))).limit(1).for("update");if(!organization)throw new Error("UNKNOWN_ORGANIZATION");}
  return categories;
}

export async function createCatalogDraft(input: CatalogDraftInput, actorId: string) {
  if (!database) throw new Error("Database is not configured");
  const templateId = randomUUID();
  const versionId = randomUUID();

  await database.transaction(async (tx) => {
    await lockCatalogTaxonomy(tx);
    const categories=await activeClassification(tx,input);
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
  const versionId = randomUUID();
  const version = await database.transaction(async (tx) => {
    await lockCatalogTaxonomy(tx);
    const [template]=await tx.select({id:catalogTemplates.id,status:catalogTemplates.status}).from(catalogTemplates).where(eq(catalogTemplates.id,templateId)).for("update").limit(1);
    if(!template||template.status==="archived")throw new Error("TEMPLATE_NOT_EDITABLE");
    const categories=await activeClassification(tx,input);
    const [latest]=await tx.select({version:catalogTemplateVersions.version}).from(catalogTemplateVersions).where(eq(catalogTemplateVersions.templateId,templateId)).orderBy(desc(catalogTemplateVersions.version)).for("update").limit(1);
    const version=(latest?.version??0)+1;
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
    return version;
  });

  return { templateId, versionId, version, status: "draft" as const };
}
