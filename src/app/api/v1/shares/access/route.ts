import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { documentRevisions, personalDocumentShareEvents, personalDocumentShares, personalDocuments } from "@/platform/database/schema";
import { decryptDocumentData } from "@/modules/documents/crypto";
import { documentContentSchema } from "@/modules/documents/schema";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { hashSecretToken } from "@/modules/identity/tokens";

const accessSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const parsed = accessSchema.safeParse(await readJsonBody(request, 1024));
  if (!parsed.success) return NextResponse.json({ code: "SHARE_UNAVAILABLE" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const [shared] = await database.select({
    shareId: personalDocumentShares.id, documentId: personalDocuments.id, ownerId: personalDocuments.ownerUserId,
    permission: personalDocumentShares.permission,
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
      inArray(personalDocumentShares.permission, ["view", "copy"]), isNull(personalDocumentShares.revokedAt),
      gt(personalDocumentShares.expiresAt, new Date()), ne(personalDocuments.status, "trash"),
    )).limit(1);
  if (!shared) return NextResponse.json({ code: "SHARE_UNAVAILABLE" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const content = documentContentSchema.parse(decryptDocumentData<unknown>(
      shared.ciphertext, shared.encryptionKeyVersion, shared.ownerId, shared.documentId, shared.revision,
    ));
    await database.insert(personalDocumentShareEvents).values({ id: randomUUID(), shareId: shared.shareId, eventType: "accessed" });
    return NextResponse.json({ content, permission: shared.permission }, { headers: { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" } });
  } catch {
    return NextResponse.json({ code: "SHARE_UNAVAILABLE" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
