import { eq, sql } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { enqueueJob } from "@/platform/jobs/queue";
import { searchConfiguration, searchDailyMetrics } from "./db-schema";
import { defaultSearchDictionary, searchDictionarySchema, type SearchDictionary } from "./policy";
export async function getSearchConfiguration() {
  if (database) {
    try { const [row] = await database.select().from(searchConfiguration).where(eq(searchConfiguration.key, "default")).limit(1); if (row) { const parsed = searchDictionarySchema.safeParse(row.dictionary); if (parsed.success) return { revision: row.revision, dictionary: parsed.data }; } }
    catch { /* Search retains its deterministic fallback until migrations/configuration are ready. */ }
  }
  return { revision: 0, dictionary: defaultSearchDictionary };
}
export async function saveSearchConfiguration(dictionary: SearchDictionary, expectedRevision: number, userId: string) {
  if (!database) throw new Error("DATABASE_NOT_CONFIGURED");
  return database.transaction(async tx => {
    const [current] = await tx.select().from(searchConfiguration).where(eq(searchConfiguration.key, "default")).for("update").limit(1);
    if ((current?.revision ?? 0) !== expectedRevision) throw new Error("REVISION_CONFLICT");
    const revision = expectedRevision + 1;
    if (current) await tx.update(searchConfiguration).set({ dictionary, revision, updatedBy: userId }).where(eq(searchConfiguration.key, "default"));
    else await tx.insert(searchConfiguration).values({ key: "default", dictionary, revision, updatedBy: userId });
    await enqueueJob({ kind: "catalog.rebuild", key: `search-config:${revision}`, payload: {} }, tx);
    return { revision };
  });
}
/** Only date and result count are stored. Never query text, user ID, address, or per-search hashes. */
export async function recordSearchOutcome(matched: boolean) {
  if (!database) return;
  try { await database.insert(searchDailyMetrics).values({ day: new Date().toISOString().slice(0, 10), outcome: matched ? "matched" : "no_result", count: 1 }).onDuplicateKeyUpdate({ set: { count: sql`${searchDailyMetrics.count} + 1` } }); }
  catch { /* Metrics must never prevent finding a document. */ }
}
