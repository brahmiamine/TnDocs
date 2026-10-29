import {after} from 'node:test';
after(async()=>{if(process.env.DATABASE_URL&&/^tndocs_verify\d+$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1))){const {database}=await import('../../src/platform/database/client');await database?.$client.end();}});
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
let enabled = false;
try { enabled = Boolean(process.env.DATABASE_URL && /^tndocs_verify\d+$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1))); } catch { /* Never mutate a non-test database. */ }

test("MariaDB procedure dossiers pin approved checklist versions and nominative shares never reveal new or removed pieces", { skip: !enabled }, async () => {
  const previousKey = process.env.DOCUMENT_ENCRYPTION_KEY_V1;
  if (!previousKey) process.env.DOCUMENT_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64");
  const { database } = await import("../../src/platform/database/client");
  const { users, personalDossiers, personalDossierItems, personalDocuments, documentRevisions, storedFiles } = await import("../../src/platform/database/schema");
  const { registeredSources, sourceObservations } = await import("../../src/modules/sources/db-schema");
  const { procedureGuides } = await import("../../src/modules/procedures/db-schema");
  const { dossierShareGrants } = await import("../../src/modules/dossiers/db-schema");
  const { publishGuide } = await import("../../src/modules/procedures/service");
  const { createDossierFromProcedure, getDossierProcedure } = await import("../../src/modules/dossiers/procedures");
  const { createDossierShare, accessDossierShare, revokeDossierShare, exportDossierShare, readDossierSharedAttachment } = await import("../../src/modules/dossiers/sharing");
  const { encryptDocumentData, decryptDossierData } = await import("../../src/modules/documents/crypto");
  const { eq, inArray } = await import("drizzle-orm");
  const db = database!;
  const owner = randomUUID(), recipient = randomUUID(), stranger = randomUUID(), unverified = randomUUID();
  const source1 = randomUUID(), source2 = randomUUID(), documentId = randomUUID(), fileId = randomUUID();
  const recipientEmail = `recipient-${recipient}@example.test`;
  const label = { fr: "Checklist fictive", ar: "قائمة افتراضية" };
  let guideId: string | undefined;
  const dossierIds: string[] = [];
  try {
    await db.insert(users).values([
      { id: owner, email: `owner-${owner}@example.test`, passwordHash: "fixture", status: "active", emailVerifiedAt: new Date(), role: "admin" },
      { id: recipient, email: recipientEmail, passwordHash: "fixture", status: "active", emailVerifiedAt: new Date() },
      { id: stranger, email: `stranger-${stranger}@example.test`, passwordHash: "fixture", status: "active", emailVerifiedAt: new Date() },
      { id: unverified, email: `unverified-${unverified}@example.test`, passwordHash: "fixture", status: "active" },
    ]);
    for (const source of [source1, source2]) {
      const hash = createHash("sha256").update(source).digest("hex");
      await db.insert(registeredSources).values({ id: source, name: "Fiction fixture", url: `https://example.test/${source}`, canonicalUrlHash: hash, reusePermission: "allowed", approved: source === source1 ? 1 : 0, active: 1, checkedAt: new Date(), latestHash: hash, createdBy: owner });
      await db.insert(sourceObservations).values({ id: randomUUID(), sourceId: source, sha256: hash, mimeType: "text/plain", byteSize: 1, textPreview: "fixture", status: "approved", reviewedBy: owner });
    }
    const content = { title: label, summary: label, countries: ["TN"], aliases: [], start: "result", nodes: [{ id: "result", kind: "recommendation" as const, label, sourceIds: [source1], checklist: [{ id: "photo", label: { fr: "Photo fictive", ar: "صورة افتراضية" }, required: true, sourceIds: [source2] }, { id: "letter", label: { fr: "Lettre fictive", ar: "رسالة افتراضية" }, required: false, sourceIds: [source1] }] }] };
    await assert.rejects(() => publishGuide({ expectedVersion: 0, content, verifiedAt: new Date() }, owner), /SOURCE_NOT_VERIFIED/);
    await db.update(registeredSources).set({ approved: 1 }).where(eq(registeredSources.id, source2));
    const published = await publishGuide({ expectedVersion: 0, content, verifiedAt: new Date() }, owner); guideId = published.id;
    const input = { guideId, expectedVersion: 1, nodeId: "result", country: "TN", locale: "fr" as const, confirmation: true as const };
    await assert.rejects(() => createDossierFromProcedure(owner, { ...input, country: "FR" }), /COUNTRY_NOT_SUPPORTED/);
    const dossier = await createDossierFromProcedure(owner, input); dossierIds.push(dossier.id);
    const firstItems = await db.select().from(personalDossierItems).where(eq(personalDossierItems.dossierId, dossier.id));
    assert.equal(firstItems.length, 2); assert.equal((await getDossierProcedure(dossier.id))?.version, 1);
    const photo = firstItems.find(item => decryptDossierData<string>(item.labelCiphertext, item.encryptionKeyVersion, owner, item.id) === "Photo fictive")!;
    const letter = firstItems.find(item => item.id !== photo.id)!;
    await publishGuide({ id: guideId, expectedVersion: 1, content: { ...content, nodes: [{ ...content.nodes[0], checklist: [{ ...content.nodes[0].checklist[0], label: { fr: "Nouvelle photo", ar: "صورة جديدة" } }] }] }, verifiedAt: new Date() }, owner);
    assert.equal((await getDossierProcedure(dossier.id))?.version, 1);
    await assert.rejects(() => createDossierFromProcedure(owner, input), /PROCEDURE_VERSION_UNAVAILABLE/);
    assert.equal(decryptDossierData<string>(photo.labelCiphertext, photo.encryptionKeyVersion, owner, photo.id), "Photo fictive");
    await db.insert(storedFiles).values({ id: fileId, ownerUserId: owner, dossierId: dossier.id, storageKey: `${owner}/${fileId}.enc`, mimeType: "application/pdf", byteSize: 10, sha256: "0".repeat(64), encryptionKeyVersion: "v1", scanStatus: "clean" });
    await db.update(personalDossierItems).set({ storedFileId: fileId, kind: "file", status: "added" }).where(eq(personalDossierItems.id, photo.id));
    await db.insert(personalDocuments).values({ id: documentId, ownerUserId: owner, title: "Pinned fictional document" });
    const encrypted = encryptDocumentData({ title: "Pinned fictional document", locale: "fr", body: "Version one", answers: {} }, owner, documentId, 1);
    await db.insert(documentRevisions).values({ id: randomUUID(), documentId, revision: 1, contentCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion, createdBy: owner });
    await db.update(personalDossierItems).set({ linkedDocumentId: documentId, kind: "document", status: "added" }).where(eq(personalDossierItems.id, letter.id));
    const grant = await createDossierShare(owner, dossier.id, { recipientEmail, expiresAt: new Date(Date.now() + 3600000).toISOString(), allowDownload: true, locale: "fr" });
    const view = await accessDossierShare(recipient, grant.token); assert.equal(view.items.length, 2); assert.equal(view.items.find(item => item.id === letter.id)?.document?.body, "Version one");
    await assert.rejects(() => accessDossierShare(stranger, grant.token), /SHARE_UNAVAILABLE/);
    await assert.rejects(() => accessDossierShare(unverified, grant.token), /VERIFIED_ACCOUNT_REQUIRED/);
    const second = encryptDocumentData({ title: "Pinned fictional document", locale: "fr", body: "Version two", answers: {} }, owner, documentId, 2);
    await db.insert(documentRevisions).values({ id: randomUUID(), documentId, revision: 2, contentCiphertext: second.ciphertext, encryptionKeyVersion: second.keyVersion, createdBy: owner });
    await db.update(personalDocuments).set({ currentRevision: 2 }).where(eq(personalDocuments.id, documentId));
    assert.equal((await accessDossierShare(recipient, grant.token)).items.find(item => item.id === letter.id)?.document?.body, "Version one");
    const denied = await createDossierShare(owner, dossier.id, { recipientEmail, expiresAt: new Date(Date.now() + 3600000).toISOString(), allowDownload: false, locale: "ar" });
    await assert.rejects(() => readDossierSharedAttachment(recipient, denied.token, photo.id), /SHARE_UNAVAILABLE/);
    await assert.rejects(() => exportDossierShare(recipient, denied.token), /SHARE_UNAVAILABLE/);
    // Remove the file DB reference, without ever creating or deleting a real file.
    await db.update(personalDossierItems).set({ storedFileId: null, kind: "checklist" }).where(eq(personalDossierItems.id, photo.id));
    await db.delete(storedFiles).where(eq(storedFiles.id, fileId));
    const newId = randomUUID();
    await db.insert(personalDossierItems).values({ id: newId, dossierId: dossier.id, labelCiphertext: "not-shared", encryptionKeyVersion: "v1", required: 0 });
    const afterRemoval = await accessDossierShare(recipient, grant.token);
    assert.equal(afterRemoval.omittedCount, 1); assert.equal(afterRemoval.items.some(item => item.id === newId), false);
    await assert.rejects(() => readDossierSharedAttachment(recipient, grant.token, photo.id), /NOT_FOUND/);
    const zip = unzipSync(await exportDossierShare(recipient, grant.token));
    const manifest = JSON.parse(strFromU8(zip["manifest.json"]));
    assert.equal(manifest.items.length, 1); assert.equal(manifest.items[0].id, `${letter.id}-document`);
    await db.update(personalDocuments).set({ status: "trash" }).where(eq(personalDocuments.id, documentId));
    const noDocument = unzipSync(await exportDossierShare(recipient, grant.token));
    assert.equal(Object.keys(noDocument).filter(key => key.endsWith(".docx")).length, 0);
    await revokeDossierShare(owner, dossier.id, grant.id);
    await assert.rejects(() => accessDossierShare(recipient, grant.token), /SHARE_UNAVAILABLE/);
    await db.update(dossierShareGrants).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(dossierShareGrants.id, denied.id));
    await assert.rejects(() => accessDossierShare(recipient, denied.token), /SHARE_UNAVAILABLE/);
    // A changed latest source must block new checklists even if its old observation was approved.
    await db.update(registeredSources).set({ latestHash: "f".repeat(64) }).where(eq(registeredSources.id, source2));
    await assert.rejects(() => createDossierFromProcedure(owner, { ...input, expectedVersion: 2 }), /PROCEDURE_SOURCE_UNAVAILABLE/);
  } finally {
    if (dossierIds.length) await db.delete(personalDossiers).where(inArray(personalDossiers.id, dossierIds));
    await db.delete(users).where(inArray(users.id, [owner, recipient, stranger, unverified]));
    if (guideId) await db.delete(procedureGuides).where(eq(procedureGuides.id, guideId));
    await db.delete(registeredSources).where(inArray(registeredSources.id, [source1, source2]));
    if (previousKey === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY_V1;
  }
});
