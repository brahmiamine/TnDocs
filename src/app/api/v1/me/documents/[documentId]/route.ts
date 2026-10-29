import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { catalogTemplateVersions, catalogTemplates, documentRevisions, personalDocuments } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { decryptDocumentData } from "@/modules/documents/crypto";
import { type DocumentContent } from "@/modules/documents/schema";
import { parseFormSchema } from "@/modules/documents/form-schema";

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
  const parsed = z.object({ action: z.enum(["restore", "archive", "unarchive"]) }).safeParse(await readJsonBody(request, 8 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "A supported document action is required." }, { status: 400 });
  const { documentId } = await params;
  const allowedStatuses = parsed.data.action === "restore" ? ["trash"] as const
    : parsed.data.action === "archive" ? ["draft", "finalized"] as const : ["archived"] as const;
  const status = parsed.data.action === "restore" || parsed.data.action === "unarchive" ? "draft" : "archived";
  const updated = await db.update(personalDocuments).set({ status }).where(and(
    eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id), inArray(personalDocuments.status, [...allowedStatuses]),
  ));
  if (!updated[0].affectedRows) return NextResponse.json({ code: "NOT_FOUND", message: "Document not found in a compatible state." }, { status: 404 });
  return NextResponse.json({ id: documentId, status }, { headers: { "Cache-Control": "private, no-store" } });
}
