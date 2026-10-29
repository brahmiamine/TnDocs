import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { documentRevisions, personalDocumentShareEvents, personalDocumentShares, personalDocuments } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { createSecretToken } from "@/modules/identity/tokens";
import { decryptDossierData, encryptDossierData } from "@/modules/documents/crypto";
import { env } from "@/platform/config/env";
import { recipientShareGrants, recipientShareEvents } from "@/modules/sharing/db-schema";
import { normalizeRecipientEmail, recipientEmailHash, shareCreateSchema } from "@/modules/sharing/policy";
import { ShareError } from "@/modules/sharing/service";
import { shareFailure } from "@/modules/sharing/http";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    const db = database; if (!db) throw new ShareError("SERVICE_UNAVAILABLE", 503);
    const { documentId } = await params;
    const [document] = await db.select({ id: personalDocuments.id }).from(personalDocuments).where(and(eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id))).limit(1);
    if (!document) throw new ShareError("NOT_FOUND");
    const rows = await db.select({ share: personalDocumentShares, grant: recipientShareGrants }).from(personalDocumentShares).leftJoin(recipientShareGrants, eq(recipientShareGrants.shareId, personalDocumentShares.id)).where(eq(personalDocumentShares.documentId, documentId)).orderBy(desc(personalDocumentShares.createdAt)).limit(50);
    const shares = await Promise.all(rows.map(async ({ share, grant }) => ({
      id: share.id, revision: share.revision, createdAt: share.createdAt, expiresAt: share.expiresAt, revokedAt: share.revokedAt,
      recipientEmail: grant ? decryptDossierData<{ email: string }>(grant.recipientCiphertext, grant.encryptionKeyVersion, user.id, `${share.id}:recipient`).email : null,
      permissions: grant ? { view: Boolean(grant.canView), copy: Boolean(grant.canCopy), edit: Boolean(grant.canEdit) } : null,
      legacyDisabled: !grant,
      events: await db.select({ action: recipientShareEvents.action, revision: recipientShareEvents.revision, createdAt: recipientShareEvents.createdAt }).from(recipientShareEvents).where(eq(recipientShareEvents.shareId, share.id)).orderBy(desc(recipientShareEvents.createdAt)).limit(20),
    })));
    return NextResponse.json({ shares }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return shareFailure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    const db = database; if (!db) throw new ShareError("SERVICE_UNAVAILABLE", 503);
    const input = shareCreateSchema.safeParse(await readJsonBody(request, 4096));
    if (!input.success) throw new ShareError("INVALID_INPUT", 400);
    const expiresAt = new Date(input.data.expiresAt);
    if (expiresAt <= new Date()) throw new ShareError("INVALID_EXPIRATION", 400);
    const { documentId } = await params;
    const grantId = randomUUID(), secret = createSecretToken();
    const recipientEmail = normalizeRecipientEmail(input.data.recipientEmail);
    const encrypted = encryptDossierData({ email: recipientEmail }, user.id, `${grantId}:recipient`);
    const permissions = input.data.permissions;
    const revision = await db.transaction(async (tx) => {
      const [document] = await tx.select().from(personalDocuments).where(and(eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id))).limit(1).for("update");
      if (!document || document.status === "trash") throw new ShareError("NOT_FOUND");
      if (document.currentRevision !== input.data.expectedRevision) throw new ShareError("REVISION_CONFLICT", 409);
      if (permissions.edit && document.status !== "draft") throw new ShareError("INVALID_STATE", 409);
      const [revision] = await tx.select({ id: documentRevisions.id }).from(documentRevisions).where(and(eq(documentRevisions.documentId, documentId), eq(documentRevisions.revision, document.currentRevision))).limit(1);
      if (!revision) throw new ShareError("DOCUMENT_UNAVAILABLE", 503);
      await tx.insert(personalDocumentShares).values({ id: grantId, documentId, revision: document.currentRevision, tokenHash: secret.hash, permission: permissions.copy ? "copy" : "view", expiresAt });
      await tx.insert(recipientShareGrants).values({ shareId: grantId, recipientHash: recipientEmailHash(recipientEmail), recipientCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion, canView: permissions.view ? 1 : 0, canCopy: permissions.copy ? 1 : 0, canEdit: permissions.edit ? 1 : 0 });
      await tx.insert(personalDocumentShareEvents).values({ id: randomUUID(), shareId: grantId, eventType: "created" });
      return document.currentRevision;
    });
    const url = new URL(`/${input.data.locale}/partage#${secret.token}`, env.APP_URL).toString();
    return NextResponse.json({ share: { id: grantId, revision, permissions, recipientEmail, expiresAt }, url }, { status: 201, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return shareFailure(error); }
}
