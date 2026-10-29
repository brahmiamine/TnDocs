import { getSearchConfiguration } from "@/modules/search/service";
import { expandSearchQuery, meiliFilters, normalizedSynonyms, normalizeSearchText, type SearchFilters } from "@/modules/search/policy";
import { eq } from "drizzle-orm";
import { database } from "@/platform/database/client";
import {
  catalogCategories,
  catalogTemplateCategories,
  catalogTemplateTranslations,
  catalogTemplateVersions,
  catalogTemplates,
  platformMetadata,
} from "@/platform/database/schema";

const initialIndex = "tndocs_catalog_v1";
const baseUrl = process.env.MEILISEARCH_URL?.replace(/\/$/, "");
const masterKey = process.env.MEILISEARCH_MASTER_KEY;
type SearchDocument = { id: string; templateId: string; locale: "fr" | "ar"; title: string; summary: string; searchText: string; categorySlugs: string[]; documentType: string; organizationId: string | null };

function headers() {
  return { "Content-Type": "application/json", ...(masterKey ? { Authorization: `Bearer ${masterKey}` } : {}) };
}

async function requestMeili(path: string, init: RequestInit = {}) {
  if (!baseUrl) throw new Error("Search service is not configured");
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers(), ...init.headers }, signal: init.signal ?? AbortSignal.timeout(4000), cache: "no-store" });
  if (!response.ok) throw new Error(`Search service request failed (${response.status})`);
  return response.status === 204 ? null : response.json() as Promise<Record<string, unknown>>;
}

async function waitForTask(taskUid: number) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const task = await requestMeili(`/tasks/${taskUid}`) as { status?: string; error?: { message?: string } };
    if (task.status === "succeeded") return;
    if (task.status === "failed" || task.status === "canceled") throw new Error(task.error?.message ?? "Search index task failed");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Search index task timed out");
}

async function createIndex(uid: string) {
  try {
    const result = await requestMeili("/indexes", { method: "POST", body: JSON.stringify({ uid, primaryKey: "id" }) }) as { taskUid?: number };
    if (typeof result?.taskUid === "number") await waitForTask(result.taskUid);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("(409)")) throw error;
  }
}

async function configureIndex(uid: string) {
  const { dictionary } = await getSearchConfiguration();
  const result = await requestMeili(`/indexes/${encodeURIComponent(uid)}/settings`, {
    method: "PATCH",
    body: JSON.stringify({
      searchableAttributes: ["title", "summary", "searchText"],
      filterableAttributes: ["locale", "categorySlugs", "documentType", "organizationId"],
      distinctAttribute: "templateId",
      synonyms: normalizedSynonyms(dictionary),
      pagination: { maxTotalHits: 100_000 },
      displayedAttributes: ["templateId", "locale", "title", "summary"],
    }),
  }) as { taskUid?: number };
  if (typeof result?.taskUid === "number") await waitForTask(result.taskUid);
}

async function activeIndex() {
  if (!database || !baseUrl) return null;
  const [row] = await database.select({ value: platformMetadata.value }).from(platformMetadata).where(eq(platformMetadata.key, "catalog_search_index")).limit(1);
  if (row?.value) return row.value;
  await createIndex(initialIndex);
  await configureIndex(initialIndex);
  await database.insert(platformMetadata).values({ key: "catalog_search_index", value: initialIndex })
    .onDuplicateKeyUpdate({ set: { value: initialIndex, updatedAt: new Date() } });
  return initialIndex;
}

async function documentsForTemplate(templateId: string): Promise<SearchDocument[]> {
  if (!database) return [];
  const [template] = await database.select().from(catalogTemplates).where(eq(catalogTemplates.id, templateId)).limit(1);
  if (!template?.publishedVersionId || template.status !== "published") return [];
  const [version] = await database.select({ id: catalogTemplateVersions.id }).from(catalogTemplateVersions).where(eq(catalogTemplateVersions.id, template.publishedVersionId)).limit(1);
  if (!version) return [];
  const [translations, categories] = await Promise.all([
    database.select().from(catalogTemplateTranslations).where(eq(catalogTemplateTranslations.versionId, version.id)),
    database.select({ slug: catalogCategories.slug }).from(catalogCategories)
      .innerJoin(catalogTemplateCategories, eq(catalogTemplateCategories.categoryId, catalogCategories.id))
      .where(eq(catalogTemplateCategories.versionId, version.id)),
  ]);
  const categorySlugs = categories.map(({ slug }) => slug);
  return translations.map((translation) => ({
    id: `${template.id}_${translation.locale}`, templateId: template.id, locale: translation.locale,
    title: translation.title, summary: translation.summary,
    searchText: normalizeSearchText([translation.title, translation.summary, translation.instructions, template.documentType === "official" ? "" : translation.body].join(" ")),
    categorySlugs, documentType: template.documentType, organizationId: template.organizationId,
  }));
}

async function putDocuments(index: string, documents: SearchDocument[]) {
  if (documents.length === 0) return;
  const result = await requestMeili(`/indexes/${encodeURIComponent(index)}/documents?primaryKey=id`, { method: "POST", body: JSON.stringify(documents) }) as { taskUid?: number };
  if (typeof result?.taskUid === "number") await waitForTask(result.taskUid);
}

export async function syncPublishedTemplateToSearch(templateId: string) {
  const index = await activeIndex();
  if (!index) return false;
  const documents = await documentsForTemplate(templateId);
  await putDocuments(index, documents);
  if (documents.length === 0) await removeTemplateFromSearch(templateId, index);
  return true;
}

export async function removeTemplateFromSearch(templateId: string, index?: string) {
  const target = index ?? await activeIndex();
  if (!target) return false;
  const result = await requestMeili(`/indexes/${encodeURIComponent(target)}/documents/delete-batch`, { method: "POST", body: JSON.stringify([`${templateId}_fr`, `${templateId}_ar`]) }) as { taskUid?: number };
  if (typeof result?.taskUid === "number") await waitForTask(result.taskUid);
  return true;
}

export async function rebuildPublishedTemplateIndex() {
  if (!database || !baseUrl) return { configured: false, indexed: 0 };
  const previous = await activeIndex();
  const next = `tndocs_catalog_${Date.now()}`;
  await createIndex(next);
  await configureIndex(next);
  const published = await database.select({ id: catalogTemplates.id }).from(catalogTemplates).where(eq(catalogTemplates.status, "published"));
  let count = 0;
  for (const template of published) {
    const documents = await documentsForTemplate(template.id);
    await putDocuments(next, documents);
    count += documents.length;
  }
  await database.insert(platformMetadata).values({ key: "catalog_search_index", value: next })
    .onDuplicateKeyUpdate({ set: { value: next, updatedAt: new Date() } });
  return { configured: true, indexed: count, previousIndex: previous, activeIndex: next };
}

export async function searchPublishedTemplatePage(query: string, _locale: "fr" | "ar", options: SearchFilters & { limit?: number; offset?: number } = {}) {
  try {
    const index = await activeIndex();
    if (!index) return null;
    const { dictionary } = await getSearchConfiguration();
    const filters = meiliFilters(options);
    const result = await requestMeili(`/indexes/${encodeURIComponent(index)}/search`, {
      method: "POST", body: JSON.stringify({ q: expandSearchQuery(query, dictionary).query, ...(filters.length ? { filter: filters.join(" AND ") } : {}), limit: Math.min(Math.max(options.limit ?? 24, 1), 100), offset: Math.max(options.offset ?? 0, 0), attributesToRetrieve: ["templateId"] }),
    }) as { hits?: Array<{ templateId?: string }>; estimatedTotalHits?: number };
    const ids = [...new Set((result.hits ?? []).map(hit => hit.templateId).filter((id): id is string => Boolean(id)))];
    return { ids, total: result.estimatedTotalHits ?? ids.length };
  } catch { return null; }
}
/** Compatibility wrapper. Locale selects display language, never the language being searched. */
export async function searchPublishedTemplateIds(query: string, locale: "fr" | "ar", category?: string, options: SearchFilters & { limit?: number; offset?: number } = {}) {
  return (await searchPublishedTemplatePage(query, locale, { ...options, category: category ?? options.category }))?.ids ?? null;
}
