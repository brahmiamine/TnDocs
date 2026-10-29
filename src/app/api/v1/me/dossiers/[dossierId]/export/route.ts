import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { strToU8, zipSync } from "fflate";
import { database } from "@/platform/database/client";
import { personalDossierItems, personalDossiers, storedFiles } from "@/platform/database/schema";
import { decryptDossierData } from "@/modules/documents/crypto";
import { decryptAttachment } from "@/modules/dossiers/file-crypto";
import { readEncryptedAttachment } from "@/modules/dossiers/file-storage";
import { getCurrentUser } from "@/modules/identity/service";

const MAX_EXPORT_BYTES = 100 * 1024 * 1024;

export async function GET(_request: Request, { params }: { params: Promise<{ dossierId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { dossierId } = await params;
  const [dossier] = await database.select().from(personalDossiers).where(and(
    eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"),
  )).limit(1);
  if (!dossier) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  try {
    const items = await database.select().from(personalDossierItems).where(eq(personalDossierItems.dossierId, dossierId)).orderBy(personalDossierItems.createdAt);
    const fileIds = items.flatMap((item) => item.storedFileId ? [item.storedFileId] : []);
    const files = fileIds.length ? await database.select().from(storedFiles).where(and(
      inArray(storedFiles.id, fileIds), eq(storedFiles.ownerUserId, user.id), eq(storedFiles.dossierId, dossierId),
    )) : [];
    const fileById = new Map(files.map((file) => [file.id, file]));
    const archive: Record<string, Uint8Array> = {};
    const checklist: Array<Record<string, unknown>> = [];
    let totalBytes = 0;
    for (const [index, item] of items.entries()) {
      const label = decryptDossierData<string>(item.labelCiphertext, item.encryptionKeyVersion, user.id, item.id);
      const file = item.storedFileId ? fileById.get(item.storedFileId) : undefined;
      let attachmentPath: string | null = null;
      if (file && file.scanStatus === "clean") {
        totalBytes += file.byteSize;
        if (totalBytes > MAX_EXPORT_BYTES) return NextResponse.json({ code: "EXPORT_TOO_LARGE" }, { status: 413 });
        const ciphertext = await readEncryptedAttachment(file.storageKey);
        const data = decryptAttachment(ciphertext, file.encryptionKeyVersion, user.id, file.id);
        if (data.byteLength !== file.byteSize || createHash("sha256").update(data).digest("hex") !== file.sha256) {
          throw new Error("Attachment integrity check failed");
        }
        const extension = file.mimeType === "application/pdf" ? "pdf" : file.mimeType === "image/png" ? "png" : "jpg";
        attachmentPath = `pieces/${String(index + 1).padStart(2, "0")}-${item.id}.${extension}`;
        archive[attachmentPath] = data;
      }
      checklist.push({
        position: index + 1, label, required: item.required === 1, status: item.status,
        linkedDocumentId: item.linkedDocumentId, attachment: attachmentPath,
      });
    }

    archive["checklist.json"] = strToU8(JSON.stringify({
      dossierId: dossier.id,
      title: decryptDossierData<string>(dossier.titleCiphertext, dossier.encryptionKeyVersion, user.id, dossier.id),
      exportedAt: new Date().toISOString(),
      items: checklist,
    }, null, 2));
    const zip = zipSync(archive, { level: 1 });
    return new NextResponse(new Uint8Array(zip), { headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="tndocs-dossier-${dossierId}.zip"`,
      "Content-Length": String(zip.byteLength), "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    } });
  } catch {
    return NextResponse.json({ code: "EXPORT_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
