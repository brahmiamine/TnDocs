import { storeScannedAttachment } from "@/modules/dossiers/attachments";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personalDossierItems, personalDossiers, storedFiles } from "@/platform/database/schema";
import { decryptAttachment } from "@/modules/dossiers/file-crypto";
import { readEncryptedAttachment } from "@/modules/dossiers/file-storage";
import { detectAllowedMimeType, scanWithClamAv } from "@/modules/dossiers/clamav";
import { getCurrentUser } from "@/modules/identity/service";
import { configuredStorageQuota, lockStorageOwner } from "@/platform/storage/quota";
import { enqueueJob } from "@/platform/jobs/queue";
import { requireSameOrigin } from "@/modules/identity/http";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ dossierId: string; itemId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES + 64 * 1024) {
    return NextResponse.json({ code: "FILE_TOO_LARGE" }, { status: 413 });
  }

  const { dossierId, itemId } = await params;
  const [item] = await database.select({ id: personalDossierItems.id, storedFileId: personalDossierItems.storedFileId })
    .from(personalDossierItems).innerJoin(personalDossiers, eq(personalDossiers.id, personalDossierItems.dossierId))
    .where(and(eq(personalDossierItems.id, itemId), eq(personalDossierItems.dossierId, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"))).limit(1);
  if (!item) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({ code: "INVALID_UPLOAD" }, { status: 400 }); }
  const value = form.get("file");
  if (!(value instanceof File) || value.size < 1 || value.size > MAX_FILE_BYTES) {
    return NextResponse.json({ code: value instanceof File && value.size > MAX_FILE_BYTES ? "FILE_TOO_LARGE" : "INVALID_UPLOAD" }, { status: value instanceof File && value.size > MAX_FILE_BYTES ? 413 : 400 });
  }
  const data = Buffer.from(await value.arrayBuffer());
  const mimeType = detectAllowedMimeType(data);
  if (!mimeType || value.type !== mimeType) return NextResponse.json({ code: "UNSUPPORTED_FILE_TYPE" }, { status: 415 });
  const [usage] = await database.select({ byteSize: sql<number>`coalesce(sum(${storedFiles.byteSize}), 0)` })
    .from(storedFiles).where(eq(storedFiles.ownerUserId, user.id));
  const previousSize = item.storedFileId ? await database.select({ byteSize: storedFiles.byteSize }).from(storedFiles).where(eq(storedFiles.id, item.storedFileId)).then((rows) => rows[0]?.byteSize ?? 0) : 0;
  if (Number(usage?.byteSize ?? 0) - previousSize + data.byteLength > await configuredStorageQuota()) {
    return NextResponse.json({ code: "STORAGE_QUOTA_EXCEEDED" }, { status: 413 });
  }

  let scan: "clean" | "infected";
  try { scan = await scanWithClamAv(data); }
  catch { return NextResponse.json({ code: "ANTIVIRUS_UNAVAILABLE" }, { status: 503 }); }
  if (scan === "infected") return NextResponse.json({ code: "UNSAFE_FILE" }, { status: 422 });

  try {
    const result = await storeScannedAttachment({ ownerId: user.id, dossierId, itemId, expectedStoredFileId: item.storedFileId, data, mimeType });
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "ATTACHMENT_UNAVAILABLE";
    return NextResponse.json({ code: code === "STORAGE_QUOTA_EXCEEDED" || code === "ATTACHMENT_CHANGED" ? code : "ATTACHMENT_UNAVAILABLE" }, { status: code === "STORAGE_QUOTA_EXCEEDED" ? 413 : code === "ATTACHMENT_CHANGED" ? 409 : 503 });
  }

}

export async function GET(_request: Request, { params }: { params: Promise<{ dossierId: string; itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { dossierId, itemId } = await params;
  const [row] = await database.select({
    fileId: storedFiles.id, storageKey: storedFiles.storageKey, mimeType: storedFiles.mimeType,
    byteSize: storedFiles.byteSize, sha256: storedFiles.sha256, keyVersion: storedFiles.encryptionKeyVersion,
  }).from(personalDossierItems)
    .innerJoin(personalDossiers, eq(personalDossiers.id, personalDossierItems.dossierId))
    .innerJoin(storedFiles, and(eq(storedFiles.id, personalDossierItems.storedFileId), eq(storedFiles.ownerUserId, user.id)))
    .where(and(eq(personalDossierItems.id, itemId), eq(personalDossierItems.dossierId, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"))).limit(1);
  if (!row) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  try {
    const ciphertext = await readEncryptedAttachment(row.storageKey);
    const data = decryptAttachment(ciphertext, row.keyVersion, user.id, row.fileId);
    if (data.byteLength !== row.byteSize || createHash("sha256").update(data).digest("hex") !== row.sha256) throw new Error("Attachment integrity check failed");
    const extension = row.mimeType === "application/pdf" ? "pdf" : row.mimeType === "image/png" ? "png" : "jpg";
    return new NextResponse(new Uint8Array(data), { headers: {
      "Content-Type": row.mimeType, "Content-Length": String(row.byteSize),
      "Content-Disposition": `attachment; filename="tndocs-piece.${extension}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox", "Referrer-Policy": "no-referrer",
    } });
  } catch {
    return NextResponse.json({ code: "ATTACHMENT_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ dossierId: string; itemId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { dossierId, itemId } = await params;
  const [row] = await database.select({ storedFileId: personalDossierItems.storedFileId, linkedDocumentId: personalDossierItems.linkedDocumentId })
    .from(personalDossierItems).innerJoin(personalDossiers, eq(personalDossiers.id, personalDossierItems.dossierId))
    .where(and(eq(personalDossierItems.id, itemId), eq(personalDossierItems.dossierId, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"))).limit(1);
  if (!row?.storedFileId) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const [file] = await database.select({ storageKey: storedFiles.storageKey }).from(storedFiles).where(and(
    eq(storedFiles.id, row.storedFileId), eq(storedFiles.ownerUserId, user.id),
  )).limit(1);
  try {
    await database.transaction(async (tx) => {
      await lockStorageOwner(tx, user.id);
      const [dossier] = await tx.select({ id: personalDossiers.id }).from(personalDossiers).where(and(eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"))).for("update").limit(1);
      if (!dossier) throw new Error("DOSSIER_UNAVAILABLE");
      const [changed] = await tx.update(personalDossierItems).set({ storedFileId: null, kind: row.linkedDocumentId ? "document" : "checklist", status: "missing" }).where(and(eq(personalDossierItems.id, itemId), eq(personalDossierItems.dossierId, dossierId), eq(personalDossierItems.storedFileId, row.storedFileId!)));
      if (!changed.affectedRows) throw new Error("ATTACHMENT_CHANGED");
      if (file) await enqueueJob({ kind: "storage.delete", key: `storage-delete:${file.storageKey}`, payload: { storageKey: file.storageKey }, maxAttempts: 10 }, tx);
      await tx.delete(storedFiles).where(and(eq(storedFiles.id, row.storedFileId!), eq(storedFiles.ownerUserId, user.id)));
    });
  } catch (error) {
    return NextResponse.json({ code: error instanceof Error && error.message === "ATTACHMENT_CHANGED" ? "ATTACHMENT_CHANGED" : "ATTACHMENT_UNAVAILABLE" }, { status: error instanceof Error && error.message === "ATTACHMENT_CHANGED" ? 409 : 503 });
  }
  return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "private, no-store" } });
}
