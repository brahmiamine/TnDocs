import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { documentRevisions, personalDocuments, personalDossierItems, personalDossiers, storedFiles, users } from "@/platform/database/schema";
import { decryptDocumentData, decryptDossierData, encryptDossierData } from "@/modules/documents/crypto";
import { documentContentSchema, type DocumentContent } from "@/modules/documents/schema";
import { createSecretToken, hashSecretToken } from "@/modules/identity/tokens";
import { canUseGrant, normalizeRecipientEmail, recipientEmailHash } from "@/modules/sharing/policy";
import { assertStorageQuota, lockStorageOwner } from "@/platform/storage/quota";
import { dossierShareEvents, dossierShareGrants } from "./db-schema";
import { createDossierShareSchema, snapshotItemMatches, snapshotSchema } from "./policy";
import { decryptAttachment } from "./file-crypto";
import { readEncryptedAttachment } from "./file-storage";
import type { z } from "zod";

type Transaction = Parameters<Parameters<NonNullable<typeof database>["transaction"]>[0]>[0];
export class DossierShareError extends Error { constructor(readonly code: string, readonly status = 404) { super(code); } }
function db() { if (!database) throw new DossierShareError("SERVICE_UNAVAILABLE", 503); return database; }
export async function createDossierShare(ownerId: string, dossierId: string, raw: z.infer<typeof createDossierShareSchema>) {
  const input = createDossierShareSchema.parse(raw), secret = createSecretToken(), id = randomUUID();
  const expiresAt = new Date(input.expiresAt);
  if (expiresAt <= new Date()) throw new DossierShareError("INVALID_EXPIRATION", 400);
  const recipientEmail = normalizeRecipientEmail(input.recipientEmail);
  await db().transaction(async tx => {
    await lockStorageOwner(tx, ownerId);
    const [dossier] = await tx.select().from(personalDossiers).where(and(eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, ownerId), eq(personalDossiers.status, "open"))).for("update").limit(1);
    if (!dossier) throw new DossierShareError("NOT_FOUND");
    const rows = await tx.select().from(personalDossierItems).where(eq(personalDossierItems.dossierId, dossierId)).for("update");
    const items = [];
    for (const row of rows) {
      const [document] = row.linkedDocumentId ? await tx.select({ revision: personalDocuments.currentRevision }).from(personalDocuments).where(and(eq(personalDocuments.id, row.linkedDocumentId), eq(personalDocuments.ownerUserId, ownerId), ne(personalDocuments.status, "trash"))).limit(1) : [];
      items.push({ id: row.id, label: decryptDossierData<string>(row.labelCiphertext, row.encryptionKeyVersion, ownerId, row.id), required: Boolean(row.required), storedFileId: row.storedFileId, documentId: row.linkedDocumentId, revision: document?.revision ?? null });
    }
    const snapshot = snapshotSchema.parse({ version: 1, title: decryptDossierData<string>(dossier.titleCiphertext, dossier.encryptionKeyVersion, ownerId, dossierId), items });
    const encrypted = encryptDossierData(snapshot, ownerId, id), recipient = encryptDossierData({ email: recipientEmail }, ownerId, `${id}:recipient`);
    await assertStorageQuota(tx, ownerId, Buffer.byteLength(encrypted.ciphertext) + Buffer.byteLength(recipient.ciphertext));
    await tx.insert(dossierShareGrants).values({ id, dossierId, tokenHash: secret.hash, recipientHash: recipientEmailHash(recipientEmail), recipientCiphertext: recipient.ciphertext, snapshotCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion, canDownload: input.allowDownload ? 1 : 0, expiresAt });
    await tx.insert(dossierShareEvents).values({ id: randomUUID(), shareId: id, actorId: ownerId, action: "created" });
  });
  return { id, token: secret.token, expiresAt, recipientEmail, allowDownload: input.allowDownload };
}
export async function listDossierShares(ownerId: string, dossierId: string) {
  const [dossier] = await db().select({ id: personalDossiers.id }).from(personalDossiers).where(and(eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, ownerId))).limit(1);
  if (!dossier) throw new DossierShareError("NOT_FOUND");
  const rows = await db().select().from(dossierShareGrants).where(eq(dossierShareGrants.dossierId, dossierId)).orderBy(desc(dossierShareGrants.createdAt));
  return rows.map(row => ({ id: row.id, recipientEmail: decryptDossierData<{ email: string }>(row.recipientCiphertext, row.encryptionKeyVersion, ownerId, `${row.id}:recipient`).email, expiresAt: row.expiresAt, revokedAt: row.revokedAt, allowDownload: Boolean(row.canDownload), createdAt: row.createdAt }));
}
export async function revokeDossierShare(ownerId: string, dossierId: string, shareId: string) {
  return db().transaction(async tx => {
    const [dossier] = await tx.select({ id: personalDossiers.id }).from(personalDossiers).where(and(eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, ownerId))).for("update").limit(1);
    if (!dossier) throw new DossierShareError("NOT_FOUND");
    const [share] = await tx.select().from(dossierShareGrants).where(and(eq(dossierShareGrants.id, shareId), eq(dossierShareGrants.dossierId, dossierId))).for("update").limit(1);
    if (!share) throw new DossierShareError("NOT_FOUND");
    if (!share.revokedAt) {
      await tx.update(dossierShareGrants).set({ revokedAt: new Date() }).where(eq(dossierShareGrants.id, shareId));
      await tx.insert(dossierShareEvents).values({ id: randomUUID(), shareId, actorId: ownerId, action: "revoked" });
    }
    return true;
  });
}
async function boundDossier(tx: Transaction, principalId: string, token: string, download = false) {
  const [user] = await tx.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.id, principalId), eq(users.status, "active"), isNotNull(users.emailVerifiedAt))).limit(1);
  if (!user) throw new DossierShareError("VERIFIED_ACCOUNT_REQUIRED", 401);
  const [row] = await tx.select({ share: dossierShareGrants, dossier: personalDossiers }).from(dossierShareGrants).innerJoin(personalDossiers, eq(personalDossiers.id, dossierShareGrants.dossierId)).where(and(eq(dossierShareGrants.tokenHash, hashSecretToken(token)), eq(dossierShareGrants.recipientHash, recipientEmailHash(user.email)), isNull(dossierShareGrants.revokedAt), gt(dossierShareGrants.expiresAt, new Date()), eq(personalDossiers.status, "open"))).for("update").limit(1);
  if (!row || !canUseGrant({ recipientHash: row.share.recipientHash, canView: 1, canCopy: row.share.canDownload, canEdit: 0, expiresAt: row.share.expiresAt, revokedAt: row.share.revokedAt }, { email: user.email, verified: true }, download ? "copy" : "view")) throw new DossierShareError("SHARE_UNAVAILABLE");
  const snapshot = snapshotSchema.parse(decryptDossierData(row.share.snapshotCiphertext, row.share.encryptionKeyVersion, row.dossier.ownerUserId, row.share.id));
  const current = await tx.select().from(personalDossierItems).where(eq(personalDossierItems.dossierId, row.dossier.id));
  const items = snapshot.items.filter(item => snapshotItemMatches(item, current.find(current => current.id === item.id)));
  return { ...row, snapshot, items, current };
}
export async function accessDossierShare(principalId: string, token: string) {
  return db().transaction(async tx => {
    const row = await boundDossier(tx, principalId, token);
    const items = [];
    for (const item of row.items) {
      let content: DocumentContent | null = null;
      if (item.documentId && item.revision) {
        const [revision] = await tx.select({ revision: documentRevisions }).from(personalDocuments).innerJoin(documentRevisions, and(eq(documentRevisions.documentId, personalDocuments.id), eq(documentRevisions.revision, item.revision))).where(and(eq(personalDocuments.id, item.documentId), eq(personalDocuments.ownerUserId, row.dossier.ownerUserId), ne(personalDocuments.status, "trash"))).limit(1);
        if (revision) content = documentContentSchema.parse(decryptDocumentData(revision.revision.contentCiphertext, revision.revision.encryptionKeyVersion, row.dossier.ownerUserId, item.documentId, item.revision));
      }
      const [file] = item.storedFileId ? await tx.select({ id: storedFiles.id }).from(storedFiles).where(and(eq(storedFiles.id, item.storedFileId), eq(storedFiles.ownerUserId, row.dossier.ownerUserId), eq(storedFiles.dossierId, row.dossier.id), eq(storedFiles.scanStatus, "clean"))).limit(1) : [];
      items.push({ id: item.id, label: item.label, required: item.required, status: row.current.find(current => current.id === item.id)!.status, hasAttachment: Boolean(file), document: content, revision: item.revision });
    }
    await tx.insert(dossierShareEvents).values({ id: randomUUID(), shareId: row.share.id, actorId: principalId, action: "viewed" });
    return { title: row.snapshot.title, allowDownload: Boolean(row.share.canDownload), expiresAt: row.share.expiresAt, items, omittedCount: row.snapshot.items.length - items.length };
  });
}
export async function readDossierSharedAttachment(principalId: string, token: string, itemId: string) {
  const file = await db().transaction(async tx => {
    const row = await boundDossier(tx, principalId, token, true);
    const item = row.items.find(item => item.id === itemId);
    if (!item?.storedFileId) throw new DossierShareError("NOT_FOUND");
    const [file] = await tx.select().from(storedFiles).where(and(eq(storedFiles.id, item.storedFileId), eq(storedFiles.ownerUserId, row.dossier.ownerUserId), eq(storedFiles.dossierId, row.dossier.id), eq(storedFiles.scanStatus, "clean"))).limit(1);
    if (!file) throw new DossierShareError("NOT_FOUND");
    return file;
  });
  const data = decryptAttachment(await readEncryptedAttachment(file.storageKey), file.encryptionKeyVersion, file.ownerUserId, file.id);
  if (data.byteLength !== file.byteSize || createHash("sha256").update(data).digest("hex") !== file.sha256) throw new DossierShareError("ATTACHMENT_UNAVAILABLE", 503);
  // File I/O may race revocation, replacement or removal. Rebind before release.
  await db().transaction(async tx => {
    const current = await boundDossier(tx, principalId, token, true);
    if (!current.items.some(item => item.id === itemId && item.storedFileId === file.id)) throw new DossierShareError("SHARE_UNAVAILABLE");
    await tx.insert(dossierShareEvents).values({ id: randomUUID(), shareId: current.share.id, actorId: principalId, itemId, action: "downloaded" });
  });
  return { data, mimeType: file.mimeType };
}
/** Downloads deliberately reuse only live, pinned membership. New dossier pieces
 * never become public to an old grant; removed/replaced pieces are omitted. */
export async function exportDossierShare(principalId: string, token: string) {
  const view = await accessDossierShare(principalId, token);
  if (!view.allowDownload) throw new DossierShareError("SHARE_UNAVAILABLE");
  const { buildDossierZip } = await import("./export");
  const { renderDocumentDocx } = await import("@/modules/documents/docx-renderer");
  const { loadExportDocument } = await import("@/modules/documents/export-service");
  const outputItems: import("./export").ExportItem[] = [];
  for (const item of view.items) {
    if (item.hasAttachment) {
      const file = await readDossierSharedAttachment(principalId, token, item.id);
      outputItems.push({ id: item.id, label: item.label, status: item.status, required: item.required, file: { mimeType: file.mimeType, data: file.data } });
    }
    if (item.document) {
      const reference = await db().transaction(async tx => {
        const row = await boundDossier(tx, principalId, token, true);
        const pinned = row.items.find(pinned => pinned.id === item.id);
        if (!pinned?.documentId || !pinned.revision) throw new DossierShareError("DOSSIER_CHANGED", 409);
        return { ownerId: row.dossier.ownerUserId, documentId: pinned.documentId, revision: pinned.revision };
      });
      const { content, body, answers } = await loadExportDocument(reference.ownerId, reference.documentId, reference.revision);
      const bytes = await renderDocumentDocx(content.title ?? item.label, body, content.locale, content.richDocument, answers, content.secondary);
      outputItems.push({ id: `${item.id}-document`, label: item.label, status: item.status, required: item.required, file: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", data: bytes } });
    }
    if (!item.document && !item.hasAttachment) outputItems.push({ id: item.id, label: item.label, status: item.status, required: item.required });
  }
  const output = await buildDossierZip(view.title, outputItems);
  // Recheck membership after all conversions, immediately before sending bytes.
  const final = await accessDossierShare(principalId, token);
  if (!final.allowDownload || final.items.length !== view.items.length || view.items.some(item => !final.items.some(current => current.id === item.id && current.hasAttachment === item.hasAttachment && Boolean(current.document) === Boolean(item.document)))) throw new DossierShareError("DOSSIER_CHANGED", 409);
  await db().transaction(async tx => {
    const current = await boundDossier(tx, principalId, token, true);
    await tx.insert(dossierShareEvents).values({ id: randomUUID(), shareId: current.share.id, actorId: principalId, action: "exported" });
  });
  return output;
}
