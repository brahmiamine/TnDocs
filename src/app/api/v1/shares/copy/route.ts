import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { documentRevisions, personalDocumentShareEvents, personalDocumentShares, personalDocuments } from "@/platform/database/schema";
import { decryptDocumentData, encryptDocumentData } from "@/modules/documents/crypto";
import { documentContentSchema } from "@/modules/documents/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { hashSecretToken } from "@/modules/identity/tokens";

const copySchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const parsed = copySchema.safeParse(await readJsonBody(request, 1024));
  if (!parsed.success) return NextResponse.json({ code: "SHARE_UNAVAILABLE" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  const [source] = await database.select({
    shareId: personalDocumentShares.id, documentId: personalDocuments.id, ownerId: personalDocuments.ownerUserId,
    templateId: personalDocuments.templateId, templateVersionId: personalDocuments.templateVersionId,
    revision: documentRevisions.revision, ciphertext: documentRevisions.contentCiphertext,
    encryptionKeyVersion: documentRevisions.encryptionKeyVersion,
  }).from(personalDocumentShares)
    .innerJoin(personalDocuments, eq(personalDocuments.id, personalDocumentShares.documentId))
    .innerJoin(documentRevisions, and(
      eq(documentRevisions.documentId, personalDocumentShares.documentId),
      eq(documentRevisions.revision, personalDocumentShares.revision),
    ))
    .where(and(
      eq(personalDocumentShares.tokenHash, hashSecretToken(parsed.data.token)),
      eq(personalDocumentShares.permission, "copy"), isNull(personalDocumentShares.revokedAt),
      gt(personalDocumentShares.expiresAt, new Date()), ne(personalDocuments.status, "trash"),
    )).limit(1);
  if (!source) return NextResponse.json({ code: "SHARE_UNAVAILABLE" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  try {
    const content = documentContentSchema.parse(decryptDocumentData<unknown>(
      source.ciphertext, source.encryptionKeyVersion, source.ownerId, source.documentId, source.revision,
    ));
    const suffix = content.locale === "ar" ? " (نسخة)" : " (copie)";
    const title = `${content.title || "Document"}`.slice(0, 240 - suffix.length) + suffix;
    const copyId = randomUUID();
    const encrypted = encryptDocumentData({ ...content, title }, user.id, copyId, 1);
    await database.transaction(async (tx) => {
      await tx.insert(personalDocuments).values({
        id: copyId, ownerUserId: user.id, templateId: source.templateId, templateVersionId: source.templateVersionId,
        title, status: "draft", currentRevision: 1,
      });
      await tx.insert(documentRevisions).values({
        id: randomUUID(), documentId: copyId, revision: 1,
        contentCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion, createdBy: user.id,
      });
      await tx.insert(personalDocumentShareEvents).values({ id: randomUUID(), shareId: source.shareId, eventType: "accessed" });
    });
    return NextResponse.json({ id: copyId, title }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "SHARE_UNAVAILABLE" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
