import { and, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { catalogTemplateVersions, catalogTemplates, documentRevisions, personalDocumentFolders, personalDocuments } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { decryptDocumentData } from "@/modules/documents/crypto";
import { type DocumentContent } from "@/modules/documents/schema";
import { parseFormSchema, validateFormAnswers } from "@/modules/documents/form-schema";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Document service is not configured." }, { status: 503 });
  const { documentId } = await params;
  const [document] = await db.select().from(personalDocuments).where(and(eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id))).limit(1);
  if (!document || document.status === "trash") return NextResponse.json({ code: "NOT_FOUND", message: "Document not found." }, { status: 404 });
  const [revision] = await db.select().from(documentRevisions).where(and(
    eq(documentRevisions.documentId, document.id), eq(documentRevisions.revision, document.currentRevision),
  )).limit(1);
  if (!revision) return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE", message: "The current document revision is unavailable." }, { status: 503 });
  const [templateVersion] = document.templateVersionId ? await db.select({ formSchema: catalogTemplateVersions.formSchema }).from(catalogTemplateVersions)
    .where(eq(catalogTemplateVersions.id, document.templateVersionId)).limit(1) : [undefined];
  const [template] = document.templateId ? await db.select({ documentType: catalogTemplates.documentType }).from(catalogTemplates).where(eq(catalogTemplates.id, document.templateId)).limit(1) : [undefined];
  const schema = parseFormSchema(templateVersion?.formSchema ?? null);
  if (templateVersion?.formSchema && !schema) return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE", message: "The saved template schema is unavailable." }, { status: 503 });
  try {
    const content = decryptDocumentData<DocumentContent>(revision.contentCiphertext, revision.encryptionKeyVersion, user.id, document.id, revision.revision);
    return NextResponse.json({ document: { id: document.id, title: content.title ?? document.title, status: document.status, documentType: template?.documentType ?? "informational", revision: revision.revision, formSchema: schema, content } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE", message: "The document is temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Document service is not configured." }, { status: 503 });
  const { documentId } = await params;
  const result = await database.update(personalDocuments).set({ status: "trash" }).where(and(
    eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id),
  ));
  if (!result[0].affectedRows) return NextResponse.json({ code: "NOT_FOUND", message: "Document not found." }, { status: 404 });
  return NextResponse.json({ id: documentId, status: "trash" }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Document service is not configured." }, { status: 503 });
  const parsed = z.object({
    action: z.enum(["restore", "archive", "unarchive", "favorite", "unfavorite", "move", "finalize", "reopen"]),
    folderId: z.string().uuid().nullable().optional(),
    expectedRevision: z.number().int().positive().optional(),
  })
    .refine((value) => value.action !== "move" || value.folderId !== undefined)
    .refine((value) => value.action !== "finalize" || value.expectedRevision !== undefined)
    .safeParse(await readJsonBody(request, 8 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "A supported document action is required." }, { status: 400 });
  const { documentId } = await params;
  if (parsed.data.action === "finalize") {
    const [document] = await db.select().from(personalDocuments).where(and(
      eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id), eq(personalDocuments.status, "draft"),
      eq(personalDocuments.currentRevision, parsed.data.expectedRevision!),
    )).limit(1);
    if (!document) return NextResponse.json({ code: "REVISION_CONFLICT", message: "Rechargez la dernière version avant de finaliser." }, { status: 409 });
    const [revision] = await db.select().from(documentRevisions).where(and(
      eq(documentRevisions.documentId, documentId), eq(documentRevisions.revision, document.currentRevision),
    )).limit(1);
    if (!revision) return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE" }, { status: 503 });
    try {
      const content = decryptDocumentData<DocumentContent>(revision.contentCiphertext, revision.encryptionKeyVersion, user.id, documentId, revision.revision);
      const [templateVersion] = document.templateVersionId ? await db.select({ formSchema: catalogTemplateVersions.formSchema })
        .from(catalogTemplateVersions).where(eq(catalogTemplateVersions.id, document.templateVersionId)).limit(1) : [undefined];
      const schema = parseFormSchema(templateVersion?.formSchema ?? null);
      if (templateVersion?.formSchema && !schema) return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE" }, { status: 503 });
      if (!validateFormAnswers(schema, content.answers)) return NextResponse.json({ code: "INVALID_ANSWERS", message: "Complétez les champs obligatoires avant de finaliser." }, { status: 409 });
      const result = await db.update(personalDocuments).set({ status: "finalized" }).where(and(
        eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id),
        eq(personalDocuments.status, "draft"), eq(personalDocuments.currentRevision, parsed.data.expectedRevision!),
      ));
      if (!result[0].affectedRows) return NextResponse.json({ code: "REVISION_CONFLICT" }, { status: 409 });
      return NextResponse.json({ id: documentId, status: "finalized", revision: document.currentRevision }, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
      return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE" }, { status: 503 });
    }
  }
  if (parsed.data.action === "reopen") {
    const result = await db.update(personalDocuments).set({ status: "draft" }).where(and(
      eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id), eq(personalDocuments.status, "finalized"),
    ));
    if (!result[0].affectedRows) return NextResponse.json({ code: "INVALID_STATE" }, { status: 409 });
    return NextResponse.json({ id: documentId, status: "draft" }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (parsed.data.action === "move") {
    if (parsed.data.folderId) {
      const [folder] = await db.select({ id: personalDocumentFolders.id }).from(personalDocumentFolders).where(and(
        eq(personalDocumentFolders.id, parsed.data.folderId), eq(personalDocumentFolders.ownerUserId, user.id),
      )).limit(1);
      if (!folder) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    }
    const result = await db.update(personalDocuments).set({ folderId: parsed.data.folderId }).where(and(
      eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id), ne(personalDocuments.status, "trash"),
    ));
    if (!result[0].affectedRows) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ id: documentId, folderId: parsed.data.folderId }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (parsed.data.action === "favorite" || parsed.data.action === "unfavorite") {
    const result = await db.update(personalDocuments).set({ isFavorite: parsed.data.action === "favorite" ? 1 : 0 }).where(and(
      eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id), ne(personalDocuments.status, "trash"),
    ));
    if (!result[0].affectedRows) return NextResponse.json({ code: "NOT_FOUND", message: "Document not found." }, { status: 404 });
    return NextResponse.json({ id: documentId, isFavorite: parsed.data.action === "favorite" }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const allowedStatuses = parsed.data.action === "restore" ? ["trash"] as const
    : parsed.data.action === "archive" ? ["draft", "finalized"] as const : ["archived"] as const;
  const status = parsed.data.action === "restore" || parsed.data.action === "unarchive" ? "draft" : "archived";
  const updated = await db.update(personalDocuments).set({ status }).where(and(
    eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id), inArray(personalDocuments.status, [...allowedStatuses]),
  ));
  if (!updated[0].affectedRows) return NextResponse.json({ code: "NOT_FOUND", message: "Document not found in a compatible state." }, { status: 404 });
  return NextResponse.json({ id: documentId, status }, { headers: { "Cache-Control": "private, no-store" } });
}
