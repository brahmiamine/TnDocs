import { assertStorageQuota } from "@/platform/storage/quota";
import { copyPrivateDocumentDefinition } from "@/modules/private-templates/service";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { documentRevisions, personalDocuments } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin } from "@/modules/identity/http";
import { decryptDocumentData, encryptDocumentData } from "@/modules/documents/crypto";
import { documentContentSchema } from "@/modules/documents/schema";

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Document service is not configured." }, { status: 503 });

  const { documentId } = await params;
  const [source] = await database.select().from(personalDocuments).where(and(
    eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id),
  )).limit(1);
  if (!source || source.status === "trash") return NextResponse.json({ code: "NOT_FOUND", message: "Document not found." }, { status: 404 });

  const [revision] = await database.select().from(documentRevisions).where(and(
    eq(documentRevisions.documentId, source.id), eq(documentRevisions.revision, source.currentRevision),
  )).limit(1);
  if (!revision) return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE", message: "The current document revision is unavailable." }, { status: 503 });

  try {
    const contentResult = documentContentSchema.safeParse(decryptDocumentData<unknown>(
      revision.contentCiphertext, revision.encryptionKeyVersion, user.id, source.id, revision.revision,
    ));
    if (!contentResult.success) throw new Error("Invalid encrypted document content");
    const suffix = contentResult.data.locale === "ar" ? " (نسخة)" : " (copie)";
    const title = `${contentResult.data.title || source.title}`.slice(0, 240 - suffix.length) + suffix;
    const content = { ...contentResult.data, title };
    const duplicateId = randomUUID();
    const encrypted = encryptDocumentData(content, user.id, duplicateId, 1);
    await database.transaction(async (tx) => {
      await assertStorageQuota(tx, user.id, Buffer.byteLength(encrypted.ciphertext));
      await tx.insert(personalDocuments).values({
        id: duplicateId, ownerUserId: user.id, templateId: source.templateId, templateVersionId: source.templateVersionId,
        title, status: "draft", currentRevision: 1,
      });
      await tx.insert(documentRevisions).values({
        id: randomUUID(), documentId: duplicateId, revision: 1,
        contentCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion, createdBy: user.id,
      });
      await copyPrivateDocumentDefinition(source.id, duplicateId, user.id, tx);
    });
    return NextResponse.json({ id: duplicateId, title, revision: 1 }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "STORAGE_QUOTA_EXCEEDED") return NextResponse.json({ code: "STORAGE_QUOTA_EXCEEDED", message: "The account storage quota is reached." }, { status: 413 });
    return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE", message: "The document could not be duplicated." }, { status: 503 });
  }
}
