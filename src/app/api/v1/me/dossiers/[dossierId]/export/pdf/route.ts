import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { database } from "@/platform/database/client";
import { personalDossierItems, personalDossiers, storedFiles } from "@/platform/database/schema";
import { decryptAttachment } from "@/modules/dossiers/file-crypto";
import { readEncryptedAttachment } from "@/modules/dossiers/file-storage";
import { getCurrentUser } from "@/modules/identity/service";

const MAX_MERGE_BYTES = 50 * 1024 * 1024;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const IMAGE_MARGIN = 36;

export async function GET(_request: Request, { params }: { params: Promise<{ dossierId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { dossierId } = await params;
  const [dossier] = await database.select({ id: personalDossiers.id }).from(personalDossiers).where(and(
    eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"),
  )).limit(1);
  if (!dossier) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  try {
    const items = await database.select().from(personalDossierItems).where(eq(personalDossierItems.dossierId, dossierId)).orderBy(personalDossierItems.createdAt);
    const fileIds = items.flatMap((item) => item.storedFileId ? [item.storedFileId] : []);
    if (!fileIds.length) return NextResponse.json({ code: "NO_ATTACHMENTS" }, { status: 409 });
    const files = await database.select().from(storedFiles).where(and(
      inArray(storedFiles.id, fileIds), eq(storedFiles.ownerUserId, user.id), eq(storedFiles.dossierId, dossierId),
    ));
    const fileById = new Map(files.map((file) => [file.id, file]));
    const output = await PDFDocument.create();
    let totalBytes = 0;
    let includedPages = 0;

    for (const item of items) {
      const file = item.storedFileId ? fileById.get(item.storedFileId) : undefined;
      if (!file) continue;
      if (file.scanStatus !== "clean") return NextResponse.json({ code: "ATTACHMENT_NOT_SCANNED" }, { status: 409 });
      totalBytes += file.byteSize;
      if (totalBytes > MAX_MERGE_BYTES) return NextResponse.json({ code: "MERGE_TOO_LARGE" }, { status: 413 });
      const ciphertext = await readEncryptedAttachment(file.storageKey);
      const data = decryptAttachment(ciphertext, file.encryptionKeyVersion, user.id, file.id);
      if (data.byteLength !== file.byteSize || createHash("sha256").update(data).digest("hex") !== file.sha256) {
        throw new Error("Attachment integrity check failed");
      }

      if (file.mimeType === "application/pdf") {
        let source: PDFDocument;
        try { source = await PDFDocument.load(data, { updateMetadata: false }); }
        catch { return NextResponse.json({ code: "INVALID_PDF_ATTACHMENT" }, { status: 422 }); }
        const pages = await output.copyPages(source, source.getPageIndices());
        for (const page of pages) { output.addPage(page); includedPages += 1; }
      } else {
        const image = file.mimeType === "image/jpeg" ? await output.embedJpg(data) : await output.embedPng(data);
        const scale = Math.min((A4_WIDTH - IMAGE_MARGIN * 2) / image.width, (A4_HEIGHT - IMAGE_MARGIN * 2) / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        const page = output.addPage([A4_WIDTH, A4_HEIGHT]);
        page.drawImage(image, { x: (A4_WIDTH - width) / 2, y: (A4_HEIGHT - height) / 2, width, height });
        includedPages += 1;
      }
    }

    if (!includedPages) return NextResponse.json({ code: "NO_ATTACHMENTS" }, { status: 409 });
    const pdf = await output.save({ useObjectStreams: true });
    return new NextResponse(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tndocs-dossier-${dossierId}.pdf"`,
      "Content-Length": String(pdf.byteLength), "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Referrer-Policy": "no-referrer",
    } });
  } catch {
    return NextResponse.json({ code: "PDF_EXPORT_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
