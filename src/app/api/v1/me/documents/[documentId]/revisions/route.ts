import { assertStorageQuota } from "@/platform/storage/quota";
import { getPrivateDocumentDefinition } from "@/modules/private-templates/service";
import { validateDraftAnswers } from "@/modules/documents/draft-answers";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { catalogTemplateVersions, catalogTemplates, documentRevisions, personalDocuments } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { decryptDocumentData, encryptDocumentData } from "@/modules/documents/crypto";
import { assertSecondarySnapshotChange } from "@/modules/documents/bilingual";
import { saveRevisionSchema, documentContentSchema } from "@/modules/documents/schema";
import { parseFormSchema, resolveDraftFormAnswers } from "@/modules/documents/form-schema";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Document service is not configured." }, { status: 503 });
  const { documentId } = await params;
  const [document] = await db.select({ id: personalDocuments.id }).from(personalDocuments).where(and(
    eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id), eq(personalDocuments.status, "draft"),
  )).limit(1);
  if (!document) return NextResponse.json({ code: "NOT_FOUND", message: "Editable document not found." }, { status: 404 });
  const revisions = await db.select({ revision: documentRevisions.revision, createdAt: documentRevisions.createdAt })
    .from(documentRevisions).where(eq(documentRevisions.documentId, documentId)).orderBy(desc(documentRevisions.revision)).limit(100);
  return NextResponse.json({ revisions }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Document service is not configured." }, { status: 503 });
  const parsed = saveRevisionSchema.safeParse(await readJsonBody(request, 1024 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Check the title and document fields.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { documentId } = await params;
  const { expectedRevision, title, content } = parsed.data;
  const nextRevision = expectedRevision + 1;
  try {
    const [document] = await db.select().from(personalDocuments).where(and(eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id))).limit(1);
    if (!document || document.status === "trash") return NextResponse.json({ code: "NOT_FOUND", message: "Document not found." }, { status: 404 });
    const [template] = document.templateId ? await db.select({ documentType: catalogTemplates.documentType }).from(catalogTemplates).where(eq(catalogTemplates.id, document.templateId)).limit(1) : [undefined];
    const [version] = document.templateVersionId ? await db.select({ formSchema: catalogTemplateVersions.formSchema }).from(catalogTemplateVersions).where(eq(catalogTemplateVersions.id, document.templateVersionId)).limit(1) : [undefined];
    const privateModel = await getPrivateDocumentDefinition(document.id, user.id);
    const schema = parseFormSchema(version?.formSchema ?? privateModel?.formSchema ?? null);
    if (version?.formSchema && !schema) return NextResponse.json({ code: "TEMPLATE_SCHEMA_INVALID", message: "The saved template form is unavailable." }, { status: 409 });
    if (!validateDraftAnswers(schema, content.answers)) return NextResponse.json({ code: "INVALID_ANSWERS", message: "Complete the required fields and use only the available options." }, { status: 400 });
    const [current] = await db.select().from(documentRevisions).where(and(eq(documentRevisions.documentId, documentId), eq(documentRevisions.revision, expectedRevision))).limit(1);
    if (!current) return NextResponse.json({ code: "REVISION_CONFLICT", message: "Reload the latest document revision before saving." }, { status: 409 });
    const currentContent = documentContentSchema.parse(decryptDocumentData(current.contentCiphertext,current.encryptionKeyVersion,user.id,documentId,expectedRevision));
    const editable = template?.documentType === "editable" || Boolean(privateModel);
    assertSecondarySnapshotChange(currentContent,content,editable);
    if (!editable && (content.body !== currentContent.body || JSON.stringify(content.richDocument) !== JSON.stringify(currentContent.richDocument))) return NextResponse.json({ code: "READ_ONLY_CONTENT", message: "Text editing is only available for editable templates." }, { status: 400 });
    const encrypted = encryptDocumentData({ ...content, title, answers: resolveDraftFormAnswers(schema, content.answers) }, user.id, documentId, nextRevision);
    const saved = await db.transaction(async (tx) => {
      await assertStorageQuota(tx, user.id, Buffer.byteLength(encrypted.ciphertext));
      const changed = await tx.update(personalDocuments).set({ title, currentRevision: nextRevision }).where(and(
        eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id),
        eq(personalDocuments.currentRevision, expectedRevision), eq(personalDocuments.status, "draft"),
      ));
      if (!changed[0].affectedRows) return false;
      await tx.insert(documentRevisions).values({
        id: randomUUID(), documentId, revision: nextRevision, contentCiphertext: encrypted.ciphertext,
        encryptionKeyVersion: encrypted.keyVersion, createdBy: user.id,
      });
      return true;
    });
    if (!saved) {
      const [document] = await db.select({ id: personalDocuments.id, currentRevision: personalDocuments.currentRevision, status: personalDocuments.status })
        .from(personalDocuments).where(and(eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id))).limit(1);
      if (!document) return NextResponse.json({ code: "NOT_FOUND", message: "Document not found." }, { status: 404 });
      if (document.status !== "draft") return NextResponse.json({ code: "INVALID_STATE", message: "Only draft documents can be edited." }, { status: 409 });
      return NextResponse.json({ code: "REVISION_CONFLICT", message: "The document changed. Reload the latest revision before saving.", currentRevision: document.currentRevision }, { status: 409 });
    }
    return NextResponse.json({ id: documentId, revision: nextRevision }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if(error instanceof Error && error.message === "BILINGUAL_SNAPSHOT_CHANGED") return NextResponse.json({code:error.message,message:"The draft must keep its pinned document languages."},{status:409});
    if(error instanceof Error && error.message === "READ_ONLY_CONTENT") return NextResponse.json({code:error.message,message:"Text editing is only available for editable templates."},{status:400});
    if (error instanceof Error && error.message === "STORAGE_QUOTA_EXCEEDED") return NextResponse.json({ code: "STORAGE_QUOTA_EXCEEDED", message: "The account storage quota is reached." }, { status: 413 });
    return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE", message: "The document revision could not be saved." }, { status: 503 });
  }
}
