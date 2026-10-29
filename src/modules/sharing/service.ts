import { randomUUID } from "node:crypto";
import { and, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { users, personalDocumentShares, personalDocuments, documentRevisions, catalogTemplates, catalogTemplateVersions } from "@/platform/database/schema";
import { decryptDocumentData, encryptDocumentData } from "@/modules/documents/crypto";
import { assertSecondarySnapshotChange } from "@/modules/documents/bilingual";
import { documentContentSchema, type DocumentContent } from "@/modules/documents/schema";
import { parseFormSchema, resolveFormAnswers } from "@/modules/documents/form-schema";
import { validateDraftAnswers } from "@/modules/documents/draft-answers";
import { getPrivateDocumentDefinition } from "@/modules/private-templates/service";
import { encryptPrivateDocumentModel } from "@/modules/private-templates/model";
import { privateDocumentModels } from "@/modules/private-templates/db-schema";
import { assertStorageQuota } from "@/platform/storage/quota";
import { hashSecretToken } from "@/modules/identity/tokens";
import { recipientShareGrants, recipientShareEvents } from "./db-schema";
import { canUseGrant, recipientEmailHash, sharedEditRevision, type ShareAction } from "./policy";

type Database = NonNullable<typeof database>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export class ShareError extends Error {
  constructor(readonly code: string, readonly status = 404) { super(code); }
}
function db() { if (!database) throw new ShareError("SERVICE_UNAVAILABLE", 503); return database; }
async function boundShare(tx: Transaction, token: string, userId: string) {
  const [user] = await tx.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.id, userId), eq(users.status, "active"), isNotNull(users.emailVerifiedAt))).limit(1);
  if (!user) throw new ShareError("VERIFIED_ACCOUNT_REQUIRED", 401);
  // The inner join deliberately disables legacy bearer links without a recipient.
  const [row] = await tx.select({ grant: recipientShareGrants, share: personalDocumentShares, document: personalDocuments, revision: documentRevisions }).from(personalDocumentShares)
    .innerJoin(recipientShareGrants, eq(recipientShareGrants.shareId, personalDocumentShares.id))
    .innerJoin(personalDocuments, eq(personalDocuments.id, personalDocumentShares.documentId))
    .innerJoin(documentRevisions, and(eq(documentRevisions.documentId, personalDocuments.id), eq(documentRevisions.revision, personalDocumentShares.revision)))
    .where(and(eq(personalDocumentShares.tokenHash, hashSecretToken(token)), eq(recipientShareGrants.recipientHash, recipientEmailHash(user.email)), isNull(personalDocumentShares.revokedAt), gt(personalDocumentShares.expiresAt, new Date()), ne(personalDocuments.status, "trash"))).limit(1).for("update");
  if (!row) throw new ShareError("SHARE_UNAVAILABLE");
  return { ...row, user };
}
type BoundShare = Awaited<ReturnType<typeof boundShare>>;
function allowed(row: BoundShare, action: ShareAction) {
  return canUseGrant({ ...row.grant, expiresAt: row.share.expiresAt, revokedAt: row.share.revokedAt }, { email: row.user.email, verified: true }, action);
}
function sharedContent(row: BoundShare): DocumentContent {
  return documentContentSchema.parse(decryptDocumentData(row.revision.contentCiphertext, row.revision.encryptionKeyVersion, row.document.ownerUserId, row.document.id, row.share.revision));
}
async function sharedDefinition(tx: Transaction, row: BoundShare) {
  const [template] = row.document.templateId ? await tx.select({ documentType: catalogTemplates.documentType }).from(catalogTemplates).where(eq(catalogTemplates.id, row.document.templateId)).limit(1) : [undefined];
  const [version] = row.document.templateVersionId ? await tx.select({ formSchema: catalogTemplateVersions.formSchema }).from(catalogTemplateVersions).where(eq(catalogTemplateVersions.id, row.document.templateVersionId)).limit(1) : [undefined];
  const privateModel = await getPrivateDocumentDefinition(row.document.id, row.document.ownerUserId, tx);
  const rawSchema = version?.formSchema ?? privateModel?.formSchema ?? null;
  const formSchema = parseFormSchema(rawSchema);
  if (rawSchema && !formSchema) throw new ShareError("DOCUMENT_UNAVAILABLE", 503);
  return { formSchema, privateModel, documentType: privateModel ? "editable" : template?.documentType ?? "informational" };
}
export async function accessNominativeShare(userId: string, token: string) {
  return db().transaction(async (tx) => {
    const row = await boundShare(tx, token, userId);
    const permissions = { view: allowed(row, "view"), copy: allowed(row, "copy"), edit: allowed(row, "edit") };
    if (!permissions.view && !permissions.copy && !permissions.edit) throw new ShareError("SHARE_UNAVAILABLE");
    const readable = permissions.view || permissions.edit;
    const definition = readable ? await sharedDefinition(tx, row) : null;
    await tx.insert(recipientShareEvents).values({ id: randomUUID(), shareId: row.share.id, actorId: userId, revision: row.share.revision, action: "viewed" });
    return { content: readable ? sharedContent(row) : null, permissions, revision: row.share.revision, formSchema: definition?.formSchema ?? null, documentType: definition?.documentType ?? null, editableCurrent: row.document.status === "draft" && row.document.currentRevision === row.share.revision };
  });
}
export async function copyNominativeShare(userId: string, token: string) {
  return db().transaction(async (tx) => {
    // All content writers lock their quota owner before document rows.
    await assertStorageQuota(tx, userId, 0);
    const row = await boundShare(tx, token, userId);
    if (!allowed(row, "copy")) throw new ShareError("SHARE_UNAVAILABLE");
    const content = sharedContent(row);
    const suffix = content.locale === "ar" ? " (نسخة)" : " (copie)";
    const title = (content.title || "Document").slice(0, 240 - suffix.length) + suffix;
    const id = randomUUID();
    const encrypted = encryptDocumentData({ ...content, title }, userId, id, 1);
    const privateModel = await getPrivateDocumentDefinition(row.document.id, row.document.ownerUserId, tx);
    const model = privateModel ? encryptPrivateDocumentModel(privateModel, userId, id) : null;
    await assertStorageQuota(tx, userId, Buffer.byteLength(encrypted.ciphertext) + (model ? Buffer.byteLength(model.ciphertext) : 0));
    await tx.insert(personalDocuments).values({ id, ownerUserId: userId, templateId: row.document.templateId, templateVersionId: row.document.templateVersionId, title, currentRevision: 1, status: "draft" });
    await tx.insert(documentRevisions).values({ id: randomUUID(), documentId: id, revision: 1, contentCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion, createdBy: userId });
    if (model) await tx.insert(privateDocumentModels).values({ documentId: id, sourceTemplateId: null, sourceVersion: 1, contentCiphertext: model.ciphertext, encryptionKeyVersion: model.keyVersion });
    await tx.insert(recipientShareEvents).values({ id: randomUUID(), shareId: row.share.id, actorId: userId, revision: row.share.revision, action: "copied" });
    return { id, title };
  });
}
export async function editNominativeShare(userId: string, token: string, input: { expectedRevision: number; title: string; content: DocumentContent }) {
  return db().transaction(async (tx) => {
    // Discover only the lock target without locking a document first; then the
    // full grant is rechecked under lock. This follows owner-save quota ordering.
    const [actor] = await tx.select({ email: users.email }).from(users).where(and(eq(users.id, userId), eq(users.status, "active"), isNotNull(users.emailVerifiedAt))).limit(1);
    if (!actor) throw new ShareError("VERIFIED_ACCOUNT_REQUIRED", 401);
    const [target] = await tx.select({ ownerId: personalDocuments.ownerUserId }).from(personalDocumentShares)
      .innerJoin(recipientShareGrants, eq(recipientShareGrants.shareId, personalDocumentShares.id))
      .innerJoin(personalDocuments, eq(personalDocuments.id, personalDocumentShares.documentId))
      .where(and(eq(personalDocumentShares.tokenHash, hashSecretToken(token)), eq(recipientShareGrants.recipientHash, recipientEmailHash(actor.email)))).limit(1);
    if (!target) throw new ShareError("SHARE_UNAVAILABLE");
    await assertStorageQuota(tx, target.ownerId, 0);
    const row = await boundShare(tx, token, userId);
    if (!allowed(row, "edit")) throw new ShareError("SHARE_UNAVAILABLE");
    let next: number;
    try { next = sharedEditRevision({ expectedRevision: input.expectedRevision, pinnedRevision: row.share.revision, currentRevision: row.document.currentRevision, status: row.document.status }); }
    catch (error) { throw new ShareError(error instanceof Error ? error.message : "REVISION_CONFLICT", 409); }
    const definition = await sharedDefinition(tx, row);
    if (!validateDraftAnswers(definition.formSchema, input.content.answers)) throw new ShareError("INVALID_ANSWERS", 400);
    const previous = sharedContent(row);
    try { assertSecondarySnapshotChange(previous, input.content, definition.documentType === "editable"); }
    catch (error) { throw new ShareError(error instanceof Error ? error.message : "BILINGUAL_SNAPSHOT_CHANGED", 400); }
    if (input.content.locale !== previous.locale) throw new ShareError("DOCUMENT_LOCALE_MISMATCH", 400);
    if (definition.documentType !== "editable" && (input.content.body !== previous.body || JSON.stringify(input.content.richDocument) !== JSON.stringify(previous.richDocument))) throw new ShareError("READ_ONLY_CONTENT", 400);
    const encrypted = encryptDocumentData({ ...input.content, title: input.title, answers: resolveFormAnswers(definition.formSchema, input.content.answers) }, row.document.ownerUserId, row.document.id, next);
    await assertStorageQuota(tx, row.document.ownerUserId, Buffer.byteLength(encrypted.ciphertext));
    const [updated] = await tx.update(personalDocuments).set({ currentRevision: next, title: input.title }).where(and(eq(personalDocuments.id, row.document.id), eq(personalDocuments.ownerUserId, row.document.ownerUserId), eq(personalDocuments.currentRevision, input.expectedRevision), eq(personalDocuments.status, "draft")));
    if (!updated.affectedRows) throw new ShareError("REVISION_CONFLICT", 409);
    await tx.insert(documentRevisions).values({ id: randomUUID(), documentId: row.document.id, revision: next, contentCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion, createdBy: userId });
    // Advance only this editing grant; other shares remain pinned to their immutable revision.
    const [advanced] = await tx.update(personalDocumentShares).set({ revision: next }).where(and(eq(personalDocumentShares.id, row.share.id), eq(personalDocumentShares.revision, input.expectedRevision), isNull(personalDocumentShares.revokedAt), gt(personalDocumentShares.expiresAt, new Date())));
    if (!advanced.affectedRows) throw new ShareError("SHARE_UNAVAILABLE");
    await tx.insert(recipientShareEvents).values({ id: randomUUID(), shareId: row.share.id, actorId: userId, revision: next, action: "edited" });
    return { revision: next };
  });
}
