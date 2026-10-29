import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { database } from "@/platform/database/client";
import { personalDossierItems, personalDossiers } from "@/platform/database/schema";
import { procedureGuides, procedureGuideVersions } from "@/modules/procedures/db-schema";
import { guideSchema } from "@/modules/procedures/schema";
import { registeredSources, sourceObservations } from "@/modules/sources/db-schema";
import { encryptDossierData } from "@/modules/documents/crypto";
import { assertStorageQuota, lockStorageOwner } from "@/platform/storage/quota";
import { dossierProcedureItems, dossierProcedureRefs } from "./db-schema";
import { getProcedureChecklist, procedureDossierSchema } from "./policy";

export async function createDossierFromProcedure(ownerId: string, raw: z.infer<typeof procedureDossierSchema>) {
  const input = procedureDossierSchema.parse(raw);
  if (!database) throw new Error("SERVICE_UNAVAILABLE");
  return database.transaction(async tx => {
    await lockStorageOwner(tx, ownerId);
    const [published] = await tx.select({ guide: procedureGuides, version: procedureGuideVersions }).from(procedureGuides).innerJoin(procedureGuideVersions, and(eq(procedureGuideVersions.guideId, procedureGuides.id), eq(procedureGuideVersions.version, procedureGuides.publishedVersion))).where(and(eq(procedureGuides.id, input.guideId), eq(procedureGuideVersions.version, input.expectedVersion))).limit(1);
    if (!published) throw new Error("PROCEDURE_VERSION_UNAVAILABLE");
    const guide = guideSchema.parse(published.version.content);
    const rules = getProcedureChecklist(guide, input.nodeId, input.country);
    const node = guide.nodes.find(node => node.id === input.nodeId)!;
    const sourceIds = [...new Set(node.kind === "recommendation" ? [...node.sourceIds, ...rules.flatMap(rule => rule.sourceIds)] : [])];
    const sources = await tx.select().from(registeredSources).where(inArray(registeredSources.id, sourceIds)).for("update");
    if (sources.length !== sourceIds.length || sources.some(source => !source.active || !source.approved || !source.checkedAt || ["pending", "forbidden"].includes(source.reusePermission))) throw new Error("PROCEDURE_SOURCE_UNAVAILABLE");
    for (const source of sources) {
      const [review] = await tx.select({ id: sourceObservations.id }).from(sourceObservations).where(and(eq(sourceObservations.sourceId, source.id), eq(sourceObservations.sha256, source.latestHash ?? ""), eq(sourceObservations.status, "approved"))).limit(1).for("update");
      if (!review) throw new Error("PROCEDURE_SOURCE_UNAVAILABLE");
    }
    const [current] = await tx.select().from(procedureGuides).where(eq(procedureGuides.id, input.guideId)).limit(1).for("update");
    if (!current || current.publishedVersion !== input.expectedVersion) throw new Error("PROCEDURE_VERSION_UNAVAILABLE");
    const id = randomUUID();
    const title = guide.title[input.locale].slice(0, 180);
    const encryptedTitle = encryptDossierData(title, ownerId, id);
    const items = rules.map(rule => { const itemId = randomUUID(); return { rule, id: itemId, encrypted: encryptDossierData(rule.label[input.locale], ownerId, itemId) }; });
    await assertStorageQuota(tx, ownerId, Buffer.byteLength(encryptedTitle.ciphertext) + items.reduce((bytes, item) => bytes + Buffer.byteLength(item.encrypted.ciphertext), 0));
    await tx.insert(personalDossiers).values({ id, ownerUserId: ownerId, titleCiphertext: encryptedTitle.ciphertext, encryptionKeyVersion: encryptedTitle.keyVersion });
    await tx.insert(dossierProcedureRefs).values({ dossierId: id, guideVersionId: published.version.id, nodeId: input.nodeId, country: input.country, locale: input.locale });
    for (const item of items) {
      await tx.insert(personalDossierItems).values({ id: item.id, dossierId: id, kind: "checklist", status: "missing", required: item.rule.required ? 1 : 0, labelCiphertext: item.encrypted.ciphertext, encryptionKeyVersion: item.encrypted.keyVersion });
      await tx.insert(dossierProcedureItems).values({ itemId: item.id, ruleKey: item.rule.id, sourceIds: item.rule.sourceIds });
    }
    return { id, title, sourceVersion: input.expectedVersion, itemCount: items.length };
  });
}

export async function getDossierProcedure(dossierId: string) {
  if (!database) return null;
  const [row] = await database.select({ reference: dossierProcedureRefs, version: procedureGuideVersions }).from(dossierProcedureRefs).innerJoin(procedureGuideVersions, eq(procedureGuideVersions.id, dossierProcedureRefs.guideVersionId)).where(eq(dossierProcedureRefs.dossierId, dossierId)).limit(1);
  if (!row) return null;
  const content = guideSchema.parse(row.version.content);
  const node = content.nodes.find(node => node.id === row.reference.nodeId);
  const ids = node?.kind === "recommendation" ? [...new Set([...node.sourceIds, ...node.checklist.flatMap(item => item.sourceIds)])] : [];
  const sources = ids.length ? await database.select({ id: registeredSources.id, name: registeredSources.name, url: registeredSources.url, checkedAt: registeredSources.checkedAt }).from(registeredSources).where(inArray(registeredSources.id, ids)) : [];
  return { guideId: row.version.guideId, version: row.version.version, nodeId: row.reference.nodeId, country: row.reference.country, verifiedAt: row.version.verifiedAt, title: content.title, sources };
}
