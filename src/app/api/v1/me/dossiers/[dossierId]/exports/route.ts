import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { catalogTemplates, documentRevisions, personalDocuments, personalDossierItems, personalDossiers, storedFiles } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { decryptDossierData } from "@/modules/documents/crypto";
import { loadExportDocument } from "@/modules/documents/export-service";
import { renderDocumentDocx } from "@/modules/documents/docx-renderer";
import { renderDocumentPdf } from "@/modules/documents/pdf-renderer";
import { decryptAttachment } from "@/modules/dossiers/file-crypto";
import { readEncryptedAttachment } from "@/modules/dossiers/file-storage";
import { buildDossierZip, mergeDossierPdf, type ExportItem } from "@/modules/dossiers/export";

export const runtime = "nodejs";
const input = z.object({ format: z.enum(["zip", "pdf"]) }).strict();
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request, { params }: { params: Promise<{ dossierId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const parsed = input.safeParse(await readJsonBody(request, 2048));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  const { dossierId } = await params;
  const [dossier] = await db.select().from(personalDossiers).where(and(eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"))).limit(1);
  if (!dossier) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  try {
    const rows = await db.select().from(personalDossierItems).where(eq(personalDossierItems.dossierId, dossierId)).orderBy(personalDossierItems.createdAt, personalDossierItems.id);
    const items: ExportItem[] = [];
    const exportedDocuments = new Map<string, number>();
    let totalBytes = 0;
    const maxBytes = Number(process.env.DOSSIER_EXPORT_MAX_BYTES ?? 100 * 1024 * 1024);
    const maxPages = Number(process.env.DOSSIER_EXPORT_MAX_PAGES ?? 200);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isSafeInteger(maxPages) || maxPages < 1) throw new Error("INVALID_EXPORT_BUDGET");
    for (const row of rows) {
      const label = decryptDossierData<string>(row.labelCiphertext, row.encryptionKeyVersion, user.id, row.id);
      const base: ExportItem = { id: row.id, label, status: row.status, required: row.required === 1 };
      if (row.storedFileId) {
        const [file] = await db.select().from(storedFiles).where(and(eq(storedFiles.id, row.storedFileId), eq(storedFiles.ownerUserId, user.id), eq(storedFiles.dossierId, dossierId), eq(storedFiles.scanStatus, "clean"))).limit(1);
        if (file) {
          totalBytes += file.byteSize;
          if (totalBytes > maxBytes) throw new Error("EXPORT_BYTE_LIMIT");
          const data = decryptAttachment(await readEncryptedAttachment(file.storageKey), file.encryptionKeyVersion, user.id, file.id);
          if (data.byteLength !== file.byteSize || createHash("sha256").update(data).digest("hex") !== file.sha256) throw new Error("ATTACHMENT_UNAVAILABLE");
          base.file = { mimeType: file.mimeType, data };
        } else base.omittedReason = "source_unavailable";
      }
      if (row.linkedDocumentId) {
        const linked: ExportItem = row.storedFileId ? { ...base, id: `${row.id}-document`, file: undefined } : base;
        const [document] = await db.select().from(personalDocuments).where(and(eq(personalDocuments.id, row.linkedDocumentId), eq(personalDocuments.ownerUserId, user.id))).limit(1);
        if (!document || document.status === "trash") linked.omittedReason = "document_unavailable";
        else {
          const [template] = document.templateId ? await db.select({ kind: catalogTemplates.documentType }).from(catalogTemplates).where(eq(catalogTemplates.id, document.templateId)).limit(1) : [];
          if (template?.kind === "official") linked.omittedReason = "official_source_only";
          else {
            const [revision] = await db.select().from(documentRevisions).where(and(eq(documentRevisions.documentId, document.id), eq(documentRevisions.revision, document.currentRevision))).limit(1);
            if (!revision) throw new Error("DOCUMENT_UNAVAILABLE");
            const loaded = await loadExportDocument(user.id, document.id, revision.revision);
            const { content, body, answers } = loaded;
            const title = content.title ?? document.title;
            const data = parsed.data.format === "pdf" ? await renderDocumentPdf(title, body, content.locale, content.richDocument, answers, content.secondary) : await renderDocumentDocx(title, body, content.locale, content.richDocument, answers, content.secondary);
            totalBytes += data.byteLength;
            if (totalBytes > maxBytes) throw new Error("EXPORT_BYTE_LIMIT");
            exportedDocuments.set(document.id, document.currentRevision);
            linked.omittedReason = undefined;
            linked.file = { mimeType: parsed.data.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data };
          }
        }
        if (row.storedFileId) items.push(linked);
      }
      items.push(base);
    }
    // Recheck current references after file I/O and rendering. A removed/revoked piece
    // must not be sent from an export started before its removal.
    const [stillOpen] = await db.select({ id: personalDossiers.id }).from(personalDossiers).where(and(eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"))).limit(1);
    const currentRows = await db.select({ id: personalDossierItems.id, storedFileId: personalDossierItems.storedFileId, linkedDocumentId: personalDossierItems.linkedDocumentId }).from(personalDossierItems).where(eq(personalDossierItems.dossierId, dossierId));
    if (!stillOpen || currentRows.length !== rows.length || rows.some((row) => !currentRows.some((current) => current.id === row.id && current.storedFileId === row.storedFileId && current.linkedDocumentId === row.linkedDocumentId))) throw new Error("DOSSIER_CHANGED");
    for (const [documentId, revision] of exportedDocuments) {
      const [document] = await db.select({ status: personalDocuments.status, currentRevision: personalDocuments.currentRevision }).from(personalDocuments).where(and(eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id))).limit(1);
      if (!document || document.status === "trash" || document.currentRevision !== revision) throw new Error("DOSSIER_CHANGED");
    }
    const title = decryptDossierData<string>(dossier.titleCiphertext, dossier.encryptionKeyVersion, user.id, dossier.id);
    if (parsed.data.format === "pdf" && items.some((item) => item.omittedReason && item.omittedReason !== "missing")) throw new Error("INCOMPLETE_DOSSIER");
    const output = parsed.data.format === "zip" ? await buildDossierZip(title, items, { maxBytes }) : await mergeDossierPdf(items.flatMap((item) => item.file ? [item.file] : []), { maxBytes, maxPages });
    return new NextResponse(new Uint8Array(output), { headers: { ...privateHeaders, "Content-Type": parsed.data.format === "zip" ? "application/zip" : "application/pdf", "Content-Disposition": `attachment; filename="tndocs-dossier-${dossierId}.${parsed.data.format}"` } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXPORT_UNAVAILABLE";
    const clientCodes = ["EXPORT_BYTE_LIMIT", "EXPORT_PAGE_LIMIT", "NO_COMPATIBLE_FILES", "INCOMPATIBLE_PDF", "UNSAFE_PDF", "IMAGE_TYPE", "IMAGE_DIMENSIONS", "INCOMPLETE_DOCUMENT", "INCOMPLETE_DOSSIER", "DOSSIER_CHANGED"];
    return NextResponse.json({ code: clientCodes.includes(code) ? code : "EXPORT_UNAVAILABLE" }, { status: clientCodes.includes(code) ? 409 : 503, headers: privateHeaders });
  }
}
