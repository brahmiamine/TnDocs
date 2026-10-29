import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { scanWithClamAv } from "@/modules/dossiers/clamav";
import { extractDocxText, extractPdfText, detectSourceDocumentMime } from "./extraction";
import { registeredSources, sourceObservations } from "./db-schema";
import { deleteSourceOriginal, preserveSourceOriginal } from "./originals";
export async function ingestSourceOriginal(sourceId: string, bytes: Buffer) {
  if (!database) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error("SOURCE_TOO_LARGE");
  const [source] = await database.select().from(registeredSources).where(eq(registeredSources.id, sourceId)).limit(1);
  if (!source?.approved || !source.active || source.reusePermission !== "allowed") throw new Error("SOURCE_REPRODUCTION_NOT_ALLOWED");
  const mimeType = detectSourceDocumentMime(bytes); if (!mimeType) throw new Error("SOURCE_INVALID_DOCUMENT");
  if (await scanWithClamAv(bytes) !== "clean") throw new Error("SOURCE_INFECTED_DOCUMENT");
  const extractedText = mimeType === "application/pdf" ? await extractPdfText(bytes) : extractDocxText(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [previous] = await database.select().from(sourceObservations).where(and(eq(sourceObservations.sourceId, sourceId), eq(sourceObservations.sha256, sha256))).limit(1);
  const observationId = previous?.id ?? randomUUID();
  const storedNewOriginal = !previous?.originalStorageKey;
  const original = previous?.originalStorageKey && previous.originalKeyVersion ? { storageKey: previous.originalStorageKey, keyVersion: previous.originalKeyVersion } : await preserveSourceOriginal(sourceId, observationId, bytes);
  try {
    return await database.transaction(async tx => {
      const [current] = await tx.select().from(registeredSources).where(eq(registeredSources.id, sourceId)).for("update").limit(1);
      if (!current?.approved || !current.active || current.reusePermission !== "allowed") throw new Error("SOURCE_REPRODUCTION_NOT_ALLOWED");
      const [existing] = await tx.select().from(sourceObservations).where(and(eq(sourceObservations.sourceId, sourceId), eq(sourceObservations.sha256, sha256))).limit(1);
      if (existing) {
        if (!existing.originalStorageKey && existing.id === observationId) await tx.update(sourceObservations).set({ extractedText, textPreview: extractedText.slice(0, 4000), originalStorageKey: original.storageKey, originalKeyVersion: original.keyVersion }).where(eq(sourceObservations.id, existing.id));
        else if (storedNewOriginal && existing.id !== observationId) await deleteSourceOriginal(original.storageKey);
        await tx.update(registeredSources).set({ latestHash: sha256, checkedAt: new Date(), nextCheckAt: new Date(Date.now() + current.frequencyDays * 86400_000), errorCode: null }).where(eq(registeredSources.id, sourceId));
        return { sourceId, observationId: existing.id, changed: sha256 !== current.latestHash, sha256 };
      }
      await tx.insert(sourceObservations).values({ id: observationId, sourceId, sha256, previousHash: current.latestHash, mimeType, byteSize: bytes.length, textPreview: extractedText.slice(0, 4000), extractedText, originalStorageKey: original.storageKey, originalKeyVersion: original.keyVersion });
      await tx.update(registeredSources).set({ latestHash: sha256, checkedAt: new Date(), nextCheckAt: new Date(Date.now() + current.frequencyDays * 86400_000), errorCode: null }).where(eq(registeredSources.id, sourceId));
      return { sourceId, observationId, changed: sha256 !== current.latestHash, sha256 };
    });
  } catch (error) { if (storedNewOriginal) await deleteSourceOriginal(original.storageKey).catch(() => undefined); throw error; }
}
export async function readSourceUpload(request: Request): Promise<Buffer> {
  if (Number(request.headers.get("content-length") ?? 0) > 2 * 1024 * 1024 || !request.body) throw new Error("SOURCE_TOO_LARGE");
  const reader = request.body.getReader(), chunks: Buffer[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("SOURCE_TOO_LARGE"); } chunks.push(Buffer.from(value)); }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
