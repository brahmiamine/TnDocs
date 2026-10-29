import { and, eq } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { personalDocuments, personalDossiers } from "@/platform/database/schema";
import type { JobTransaction } from "@/platform/jobs/queue";
import { documentStateMetadata } from "@/modules/document-state/db-schema";
import { trashMarkers } from "./schema";
import { trashPurgeAfter } from "./policy";

export type TrashKind = "document" | "dossier";
function db() { if (!database) throw new Error("DATABASE_NOT_CONFIGURED"); return database; }
export async function lockOwnedTrashResource(tx: JobTransaction, kind: TrashKind, resourceId: string, ownerId: string) {
  if (kind === "document") return (await tx.select({ id: personalDocuments.id, status: personalDocuments.status }).from(personalDocuments).where(and(eq(personalDocuments.id, resourceId), eq(personalDocuments.ownerUserId, ownerId))).for("update").limit(1))[0];
  return (await tx.select({ id: personalDossiers.id, status: personalDossiers.status }).from(personalDossiers).where(and(eq(personalDossiers.id, resourceId), eq(personalDossiers.ownerUserId, ownerId))).for("update").limit(1))[0];
}
/** Call while holding the resource row lock in the same transaction. */
export async function markResourceTrashed(tx: JobTransaction, kind: TrashKind, resourceId: string, ownerId: string, now = new Date()) {
  const condition = and(eq(trashMarkers.resourceKind, kind), eq(trashMarkers.resourceId, resourceId), eq(trashMarkers.ownerUserId, ownerId));
  const [existing] = await tx.select().from(trashMarkers).where(condition).for("update").limit(1);
  if (!existing) await tx.insert(trashMarkers).values({ resourceKind: kind, resourceId, ownerUserId: ownerId, trashedAt: now, purgeAfter: trashPurgeAfter(now) });
}
/** Call while holding the resource row lock; expiration cannot be bypassed by a
 * second route that happens to expose the same restore operation. */
export async function clearTrashMarkerForRestore(tx: JobTransaction, kind: TrashKind, resourceId: string, ownerId: string, now = new Date()) {
  const condition = and(eq(trashMarkers.resourceKind, kind), eq(trashMarkers.resourceId, resourceId), eq(trashMarkers.ownerUserId, ownerId));
  const [marker] = await tx.select().from(trashMarkers).where(condition).for("update").limit(1);
  if (marker && marker.purgeAfter.getTime() <= now.getTime()) throw new Error("TRASH_RETENTION_EXPIRED");
  await tx.delete(trashMarkers).where(condition);
}

export async function trashOwnedResource(kind: TrashKind, resourceId: string, ownerId: string, now = new Date()) {
  return db().transaction(async (tx) => {
    const resource = await lockOwnedTrashResource(tx, kind, resourceId, ownerId);
    if (!resource) return false;
    const condition = and(eq(trashMarkers.resourceKind, kind), eq(trashMarkers.resourceId, resourceId), eq(trashMarkers.ownerUserId, ownerId));
    const [existing] = await tx.select().from(trashMarkers).where(condition).for("update").limit(1);
    // A repeated DELETE is idempotent; it must not postpone or shorten retention.
    if (resource.status === "trash" && existing) return true;
    if (kind === "document") {
      if (resource.status !== "trash") await tx.insert(documentStateMetadata).values({ documentId: resourceId, preTrashStatus: resource.status as "draft" | "finalized" | "archived" }).onDuplicateKeyUpdate({ set: { preTrashStatus: resource.status as "draft" | "finalized" | "archived", updatedAt: now } });
      await tx.update(personalDocuments).set({ status: "trash" }).where(eq(personalDocuments.id, resourceId));
    }
    else await tx.update(personalDossiers).set({ status: "trash" }).where(eq(personalDossiers.id, resourceId));
    await tx.delete(trashMarkers).where(condition);
    await tx.insert(trashMarkers).values({ resourceKind: kind, resourceId, ownerUserId: ownerId, trashedAt: now, purgeAfter: trashPurgeAfter(now) });
    return true;
  });
}
export async function restoreOwnedResource(kind: TrashKind, resourceId: string, ownerId: string, now = new Date()): Promise<"restored" | "not_found" | "expired"> {
  return db().transaction(async (tx) => {
    const resource = await lockOwnedTrashResource(tx, kind, resourceId, ownerId);
    if (!resource || resource.status !== "trash") return "not_found";
    const condition = and(eq(trashMarkers.resourceKind, kind), eq(trashMarkers.resourceId, resourceId), eq(trashMarkers.ownerUserId, ownerId));
    const [marker] = await tx.select().from(trashMarkers).where(condition).for("update").limit(1);
    if (marker && marker.purgeAfter.getTime() <= now.getTime()) return "expired";
    if (kind === "document") {
      const [metadata] = await tx.select().from(documentStateMetadata).where(eq(documentStateMetadata.documentId, resourceId)).limit(1);
      await tx.update(personalDocuments).set({ status: metadata?.preTrashStatus ?? "draft" }).where(eq(personalDocuments.id, resourceId));
    }
    else await tx.update(personalDossiers).set({ status: "open" }).where(eq(personalDossiers.id, resourceId));
    await tx.delete(trashMarkers).where(condition);
    return "restored";
  });
}
