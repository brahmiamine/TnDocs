import { lockStorageOwner } from "@/platform/storage/quota";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personalDossierItems, personalDossiers, storedFiles } from "@/platform/database/schema";
import { enqueueJob } from "@/platform/jobs/queue";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { updateDossierItemSchema } from "@/modules/dossiers/schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ dossierId: string; itemId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Dossier service is not configured." }, { status: 503 });
  const parsed = updateDossierItemSchema.safeParse(await readJsonBody(request, 8 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Select a valid checklist status." }, { status: 400 });
  const { dossierId, itemId } = await params;
  const [dossier] = await db.select({ id: personalDossiers.id }).from(personalDossiers).where(and(
    eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"),
  )).limit(1);
  if (!dossier) return NextResponse.json({ code: "NOT_FOUND", message: "Dossier not found." }, { status: 404 });
  const result = await db.update(personalDossierItems).set({ status: parsed.data.status }).where(and(
    eq(personalDossierItems.id, itemId), eq(personalDossierItems.dossierId, dossierId),
  ));
  if (!result[0].affectedRows) return NextResponse.json({ code: "ITEM_NOT_FOUND", message: "Checklist item not found." }, { status: 404 });
  return NextResponse.json({ id: itemId, status: parsed.data.status }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ dossierId: string; itemId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Dossier service is not configured." }, { status: 503 });
  const { dossierId, itemId } = await params;
  const [dossier] = await db.select({ id: personalDossiers.id }).from(personalDossiers).where(and(
    eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"),
  )).limit(1);
  if (!dossier) return NextResponse.json({ code: "NOT_FOUND", message: "Dossier not found." }, { status: 404 });
  try {
    await db.transaction(async (tx) => {
      await lockStorageOwner(tx, user.id);
      const [liveDossier] = await tx.select({ id: personalDossiers.id }).from(personalDossiers).where(and(eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"))).for("update").limit(1);
      if (!liveDossier) throw new Error("DOSSIER_UNAVAILABLE");
      const [item] = await tx.select().from(personalDossierItems).where(and(eq(personalDossierItems.id, itemId), eq(personalDossierItems.dossierId, dossierId))).for("update").limit(1);
      if (!item) throw new Error("ITEM_NOT_FOUND");
      const [file] = item.storedFileId ? await tx.select({ storageKey: storedFiles.storageKey }).from(storedFiles).where(and(eq(storedFiles.id, item.storedFileId), eq(storedFiles.ownerUserId, user.id))).limit(1) : [];
      if (file) await enqueueJob({ kind: "storage.delete", key: `storage-delete:${file.storageKey}`, payload: { storageKey: file.storageKey }, maxAttempts: 10 }, tx);
      await tx.delete(personalDossierItems).where(and(eq(personalDossierItems.id, itemId), eq(personalDossierItems.dossierId, dossierId)));
      if (item.storedFileId) await tx.delete(storedFiles).where(and(eq(storedFiles.id, item.storedFileId), eq(storedFiles.ownerUserId, user.id)));
    });
  } catch (error) {
    return NextResponse.json({ code: error instanceof Error && error.message === "ITEM_NOT_FOUND" ? "ITEM_NOT_FOUND" : "DOSSIER_UNAVAILABLE" }, { status: error instanceof Error && error.message === "ITEM_NOT_FOUND" ? 404 : 503 });
  }
  return NextResponse.json({ id: itemId, deleted: true }, { headers: { "Cache-Control": "private, no-store" } });
}
