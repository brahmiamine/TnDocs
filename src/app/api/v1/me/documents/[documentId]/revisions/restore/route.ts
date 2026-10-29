import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { documentRevisions, personalDocuments } from "@/platform/database/schema";
import { decryptDocumentData, encryptDocumentData } from "@/modules/documents/crypto";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { restoreRevisionSchema, type DocumentContent } from "@/modules/documents/schema";

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Document service is not configured." }, { status: 503 });
  const parsed = restoreRevisionSchema.safeParse(await readJsonBody(request, 8 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "A source revision and current revision are required." }, { status: 400 });
  const { documentId } = await params;
  const { sourceRevision, expectedRevision } = parsed.data;
  const [document] = await db.select().from(personalDocuments).where(and(
    eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id), eq(personalDocuments.status, "draft"),
  )).limit(1);
  if (!document) return NextResponse.json({ code: "NOT_FOUND", message: "Editable document not found." }, { status: 404 });
  if (document.currentRevision !== expectedRevision) return NextResponse.json({ code: "REVISION_CONFLICT", message: "The document changed. Reload before restoring a revision.", currentRevision: document.currentRevision }, { status: 409 });
  const [source] = await db.select().from(documentRevisions).where(and(
    eq(documentRevisions.documentId, documentId), eq(documentRevisions.revision, sourceRevision),
  )).limit(1);
  if (!source) return NextResponse.json({ code: "REVISION_NOT_FOUND", message: "The source revision was not found." }, { status: 404 });
  if (sourceRevision === expectedRevision) return NextResponse.json({ code: "INVALID_REVISION", message: "The current revision is already active." }, { status: 409 });
  const nextRevision = expectedRevision + 1;
  try {
    const restored = decryptDocumentData<DocumentContent>(source.contentCiphertext, source.encryptionKeyVersion, user.id, documentId, source.revision);
    const title = restored.title ?? document.title;
    const content = { ...restored, title };
    const encrypted = encryptDocumentData(content, user.id, documentId, nextRevision);
    const saved = await db.transaction(async (tx) => {
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
    if (!saved) return NextResponse.json({ code: "REVISION_CONFLICT", message: "The document changed while the restore was being processed." }, { status: 409 });
    return NextResponse.json({ revision: nextRevision, content }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "RESTORE_UNAVAILABLE", message: "The selected revision could not be restored." }, { status: 503 });
  }
}
