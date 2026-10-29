import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { documentRevisions, personalDocuments } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { encryptDocumentData } from "@/modules/documents/crypto";
import { saveRevisionSchema } from "@/modules/documents/schema";

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Document service is not configured." }, { status: 503 });
  const parsed = saveRevisionSchema.safeParse(await readJsonBody(request, 96 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Check the title and document fields.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { documentId } = await params;
  const { expectedRevision, title, content } = parsed.data;
  const nextRevision = expectedRevision + 1;
  try {
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
    if (!saved) {
      const [document] = await db.select({ id: personalDocuments.id, currentRevision: personalDocuments.currentRevision, status: personalDocuments.status })
        .from(personalDocuments).where(and(eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id))).limit(1);
      if (!document) return NextResponse.json({ code: "NOT_FOUND", message: "Document not found." }, { status: 404 });
      if (document.status !== "draft") return NextResponse.json({ code: "INVALID_STATE", message: "Only draft documents can be edited." }, { status: 409 });
      return NextResponse.json({ code: "REVISION_CONFLICT", message: "The document changed. Reload the latest revision before saving.", currentRevision: document.currentRevision }, { status: 409 });
    }
    return NextResponse.json({ id: documentId, revision: nextRevision }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE", message: "The document revision could not be saved." }, { status: 503 });
  }
}
