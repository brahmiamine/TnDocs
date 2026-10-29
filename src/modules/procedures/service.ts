import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { catalogTemplates } from "@/platform/database/schema";
import { registeredSources, sourceObservations } from "@/modules/sources/db-schema";
import { procedureGuides, procedureGuideVersions } from "./db-schema";
import { guideSchema, guideSourceIds } from "./schema";
export async function listPublishedGuides() {
  if (!database) return [];
  const rawRows = await database.select({ id: procedureGuides.id, version: procedureGuideVersions.version, content: procedureGuideVersions.content, verifiedAt: procedureGuideVersions.verifiedAt }).from(procedureGuides).innerJoin(procedureGuideVersions, and(eq(procedureGuideVersions.guideId, procedureGuides.id), eq(procedureGuideVersions.version, procedureGuides.publishedVersion))).limit(200);
  const rows = rawRows.map(row => ({ ...row, content: guideSchema.parse(row.content) }));
  const sourceIds = [...new Set(rows.flatMap(row => guideSourceIds(row.content)))];
  const sources = sourceIds.length ? await database.select({ id: registeredSources.id, name: registeredSources.name, url: registeredSources.url, checkedAt: registeredSources.checkedAt, active: registeredSources.active, approved: registeredSources.approved, permission: registeredSources.reusePermission, latestHash: registeredSources.latestHash }).from(registeredSources).where(inArray(registeredSources.id, sourceIds)) : [];
  const approvedObservations = sourceIds.length ? await database.select({ sourceId: sourceObservations.sourceId, hash: sourceObservations.sha256 }).from(sourceObservations).where(and(inArray(sourceObservations.sourceId, sourceIds), eq(sourceObservations.status, "approved"))) : [];
  const approvedHashes = new Set(approvedObservations.map(row => `${row.sourceId}:${row.hash}`));
  const allowed = new Set(sources.filter(source => approvedHashes.has(`${source.id}:${source.latestHash}`) && source.active && source.approved && source.permission !== "pending" && source.permission !== "forbidden" && source.checkedAt).map(source => source.id));
  return rows.filter(row => row.content.nodes.every(node => node.kind !== "recommendation" || [...node.sourceIds, ...node.facts.flatMap(fact => fact.sourceIds), ...node.checklist.flatMap(item => item.sourceIds)].every(id => allowed.has(id)))).map(row => ({ ...row, sources: sources.filter(source => allowed.has(source.id) && row.content.nodes.some(node => node.kind === "recommendation" && [...node.sourceIds, ...node.facts.flatMap(fact => fact.sourceIds), ...node.checklist.flatMap(item => item.sourceIds)].includes(source.id))).map(({ id, name, url, checkedAt }) => ({ id, name, url, checkedAt })) }));
}
export async function publishGuide(input: { id?: string; expectedVersion: number; content: import("zod").z.input<typeof guideSchema>; verifiedAt: Date }, reviewerId: string) {
  if (!database) throw new Error("DATABASE_NOT_CONFIGURED");
  const content = guideSchema.parse(input.content), db = database;
  const sourceIds = [...new Set(content.nodes.flatMap(node => node.kind === "recommendation" ? [...node.sourceIds, ...node.facts.flatMap(fact => fact.sourceIds), ...node.checklist.flatMap(item => item.sourceIds)] : []))];
  const templateIds = [...new Set(content.nodes.flatMap(node => node.kind === "recommendation" ? node.templateIds : []))];
  return db.transaction(async tx => {
    const sources = sourceIds.length ? await tx.select().from(registeredSources).where(inArray(registeredSources.id, sourceIds)).for("update") : [];
    if (sources.length !== sourceIds.length || sources.some(source => !source.active || !source.approved || !source.checkedAt || source.reusePermission === "forbidden" || source.reusePermission === "pending")) throw new Error("SOURCE_NOT_VERIFIED");
    for (const source of sources) {
      const [review] = await tx.select().from(sourceObservations).where(and(eq(sourceObservations.sourceId, source.id), eq(sourceObservations.sha256, source.latestHash ?? ""), eq(sourceObservations.status, "approved"))).limit(1);
      if (!review) throw new Error("SOURCE_OBSERVATION_NOT_REVIEWED");
    }
    const templates = templateIds.length ? await tx.select().from(catalogTemplates).where(inArray(catalogTemplates.id, templateIds)) : [];
    if (templates.length !== templateIds.length || templates.some(template => template.status !== "published" || !template.publishedVersionId)) throw new Error("TEMPLATE_NOT_PUBLISHED");
    let guideId = input.id;
    if (!guideId) {
      if (input.expectedVersion !== 0) throw new Error("VERSION_CONFLICT");
      guideId = randomUUID(); await tx.insert(procedureGuides).values({ id: guideId, createdBy: reviewerId });
    }
    const [current] = await tx.select().from(procedureGuides).where(eq(procedureGuides.id, guideId)).for("update").limit(1);
    if (!current || current.currentVersion !== input.expectedVersion) throw new Error("VERSION_CONFLICT");
    const version = current.currentVersion + 1;
    await tx.insert(procedureGuideVersions).values({ id: randomUUID(), guideId, version, content, reviewedBy: reviewerId, verifiedAt: input.verifiedAt, sha256: createHash("sha256").update(JSON.stringify(content)).digest("hex") });
    await tx.update(procedureGuides).set({ currentVersion: version, publishedVersion: version }).where(eq(procedureGuides.id, guideId));
    return { id: guideId, version };
  });
}
