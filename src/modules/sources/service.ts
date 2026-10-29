import { randomUUID } from "node:crypto";
import { and, eq, lte, ne } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { isFeatureEnabled } from "@/modules/administration/service";
import { enqueueJob } from "@/platform/jobs/queue";
import { registeredSources, sourceObservations } from "./db-schema";
import { detectSourceDocumentMime } from "./extraction";
import { ingestSourceOriginal } from "./ingestion";
import { fetchSourceSnapshot } from "./fetch";
export async function observeSource(sourceId: string) {
  if (!await isFeatureEnabled("sourceWatch")) throw new Error("SOURCE_FEATURE_DISABLED");
  if (!database) throw new Error("DATABASE_NOT_CONFIGURED");
  const [source] = await database.select().from(registeredSources).where(and(eq(registeredSources.id, sourceId), eq(registeredSources.approved, 1), eq(registeredSources.active, 1))).limit(1);
  if (!source || source.reusePermission === "pending" || source.reusePermission === "forbidden") throw new Error("SOURCE_NOT_APPROVED");
  try {
    const snapshot = await fetchSourceSnapshot(source.url);
    if (source.reusePermission === "allowed" && detectSourceDocumentMime(snapshot.data)) return ingestSourceOriginal(sourceId, snapshot.data);
    if (source.reusePermission === "allowed" && ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(snapshot.mimeType)) throw new Error("SOURCE_CONTENT_TYPE_MISMATCH");
    await database.transaction(async tx => {
      const [current] = await tx.select().from(registeredSources).where(eq(registeredSources.id, sourceId)).for("update").limit(1);
      if (!current?.active || !current.approved || current.reusePermission === "forbidden" || current.reusePermission === "pending") throw new Error("SOURCE_NOT_APPROVED");
      // Content reproduction restrictions are honored: hash/metadata only for no_reproduction sources.
      await tx.insert(sourceObservations).values({ id: randomUUID(), sourceId, sha256: snapshot.sha256, previousHash: current.latestHash, mimeType: snapshot.mimeType, byteSize: snapshot.bytes, textPreview: current.reusePermission === "allowed" ? snapshot.textPreview : "" }).onDuplicateKeyUpdate({ set: { sha256: snapshot.sha256 } });
      await tx.update(registeredSources).set({ latestHash: snapshot.sha256, checkedAt: new Date(), nextCheckAt: new Date(Date.now() + current.frequencyDays * 86400_000), errorCode: null }).where(eq(registeredSources.id, sourceId));
    });
    return { sourceId, changed: snapshot.sha256 !== source.latestHash, sha256: snapshot.sha256 };
  } catch (error) {
    const code = error instanceof Error && /^SOURCE_[A-Z_]+$/.test(error.message) ? error.message : "SOURCE_FETCH_FAILED";
    await database.update(registeredSources).set({ errorCode: code }).where(eq(registeredSources.id, sourceId));
    throw new Error(code);
  }
}
/** Scheduler is safe on every worker tick; queue deduplication bounds each check period. */
export async function scheduleDueSources() {
  if (!await isFeatureEnabled("sourceWatch")) return 0;
  if (!database) return 0;
  const sources = await database.select().from(registeredSources).where(and(eq(registeredSources.active, 1), eq(registeredSources.approved, 1), ne(registeredSources.reusePermission, "pending"), ne(registeredSources.reusePermission, "forbidden"), lte(registeredSources.nextCheckAt, new Date()))).limit(100);
  for (const source of sources) await enqueueJob({ kind: "source.observe", key: `source:${source.id}:auto:${Math.floor(Date.now() / (source.frequencyDays * 86400_000))}`, payload: { sourceId: source.id } });
  return sources.length;
}
export async function sourceObservationJob(payload: Record<string, unknown>) {
  if (typeof payload.sourceId !== "string") throw new Error("SOURCE_INVALID_JOB");
  return observeSource(payload.sourceId);
}
