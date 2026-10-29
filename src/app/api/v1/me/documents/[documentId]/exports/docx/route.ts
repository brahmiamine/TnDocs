import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { catalogTemplateVersions, catalogTemplates, documentRevisions, personalDocuments } from "@/platform/database/schema";
import { decryptDocumentData } from "@/modules/documents/crypto";
import { getCurrentUser } from "@/modules/identity/service";
import type { DocumentContent } from "@/modules/documents/schema";
import { parseFormSchema, renderTemplateText, validateFormAnswers } from "@/modules/documents/form-schema";
import { renderDocumentDocx } from "@/modules/documents/docx-renderer";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Document service is not configured." }, { status: 503 });
  const { documentId } = await params;
  const [document] = await db.select().from(personalDocuments).where(and(
    eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id),
  )).limit(1);
  if (!document || document.status === "trash") return NextResponse.json({ code: "NOT_FOUND", message: "Document not found." }, { status: 404 });
  const [revision] = await db.select().from(documentRevisions).where(and(
    eq(documentRevisions.documentId, document.id), eq(documentRevisions.revision, document.currentRevision),
  )).limit(1);
  if (!revision) return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE", message: "The current document revision is unavailable." }, { status: 503 });
  const [template] = document.templateId ? await db.select({ documentType: catalogTemplates.documentType }).from(catalogTemplates).where(eq(catalogTemplates.id, document.templateId)).limit(1) : [undefined];
  if (template?.documentType === "official") return NextResponse.json({ code: "OFFICIAL_SOURCE_ONLY", message: "Official forms must be downloaded from their original source." }, { status: 409 });

  try {
    const content = decryptDocumentData<DocumentContent>(revision.contentCiphertext, revision.encryptionKeyVersion, user.id, document.id, revision.revision);
    const [version] = document.templateVersionId ? await db.select({ formSchema: catalogTemplateVersions.formSchema }).from(catalogTemplateVersions).where(eq(catalogTemplateVersions.id, document.templateVersionId)).limit(1) : [undefined];
    const schema = parseFormSchema(version?.formSchema ?? null);
    if (version?.formSchema && !schema) return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE", message: "The document form schema is unavailable." }, { status: 503 });
    if (!validateFormAnswers(schema, content.answers)) return NextResponse.json({ code: "INVALID_ANSWERS", message: "Complete the required fields before exporting." }, { status: 409 });
    const body = renderTemplateText(content.body, content.answers);
    const output = await renderDocumentDocx(document.title, body, content.locale);
    return new Response(new Uint8Array(output), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="tndocs-${document.id}.docx"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ code: "EXPORT_UNAVAILABLE", message: "The Word document could not be generated." }, { status: 503 });
  }
}
