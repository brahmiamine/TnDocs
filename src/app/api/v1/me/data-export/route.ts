import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import {
  documentRevisions,
  personProfiles,
  personalDocuments,
  personalDossierItems,
  personalDossiers,
  personalDocumentShareEvents,
  personalDocumentShares,
  storedFiles,
} from "@/platform/database/schema";
import { decryptDocumentData, decryptDossierData } from "@/modules/documents/crypto";
import { decryptProfileData } from "@/modules/profiles/crypto";
import type { DocumentContent } from "@/modules/documents/schema";
import type { ProfileData } from "@/modules/profiles/schema";
import { getCurrentUser } from "@/modules/identity/service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Account data is not configured." }, { status: 503 });
  try {
    const [profileRows, documentRows, dossierRows] = await Promise.all([
      db.select().from(personProfiles).where(eq(personProfiles.ownerUserId, user.id)).orderBy(asc(personProfiles.createdAt)),
      db.select().from(personalDocuments).where(eq(personalDocuments.ownerUserId, user.id)).orderBy(asc(personalDocuments.createdAt)),
      db.select().from(personalDossiers).where(eq(personalDossiers.ownerUserId, user.id)).orderBy(asc(personalDossiers.createdAt)),
    ]);
    const [revisionRows, dossierItemRows, shareRows, fileRows] = await Promise.all([
      documentRows.length ? db.select().from(documentRevisions).where(inArray(documentRevisions.documentId, documentRows.map(({ id }) => id))).orderBy(asc(documentRevisions.createdAt)) : [],
      dossierRows.length ? db.select().from(personalDossierItems).where(inArray(personalDossierItems.dossierId, dossierRows.map(({ id }) => id))).orderBy(asc(personalDossierItems.createdAt)) : [],
      documentRows.length ? db.select().from(personalDocumentShares).where(inArray(personalDocumentShares.documentId, documentRows.map(({ id }) => id))).orderBy(asc(personalDocumentShares.createdAt)) : [],
      dossierRows.length ? db.select().from(storedFiles).where(and(
        eq(storedFiles.ownerUserId, user.id), inArray(storedFiles.dossierId, dossierRows.map(({ id }) => id)),
      )).orderBy(asc(storedFiles.createdAt)) : [],
    ]);
    const shareEvents = shareRows.length ? await db.select().from(personalDocumentShareEvents)
      .where(inArray(personalDocumentShareEvents.shareId, shareRows.map(({ id }) => id)))
      .orderBy(asc(personalDocumentShareEvents.createdAt)) : [];
    const fileById = new Map(fileRows.map((file) => [file.id, file]));
    const exported = {
      generatedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, preferredLocale: user.preferredLocale },
      profiles: profileRows.map((row) => ({
        id: row.id, relationship: row.relationship, authorizationBasis: row.authorizationBasis,
        authorizationConfirmedAt: row.authorizationConfirmedAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
        data: decryptProfileData<ProfileData>(row.dataCiphertext, row.encryptionKeyVersion, user.id, row.id),
      })),
      documents: documentRows.map((document) => ({
        id: document.id, templateId: document.templateId, templateVersionId: document.templateVersionId,
        title: document.title, status: document.status, currentRevision: document.currentRevision,
        createdAt: document.createdAt, updatedAt: document.updatedAt,
        revisions: revisionRows.filter((revision) => revision.documentId === document.id).map((revision) => ({
          revision: revision.revision, createdAt: revision.createdAt,
          content: decryptDocumentData<DocumentContent>(revision.contentCiphertext, revision.encryptionKeyVersion, user.id, document.id, revision.revision),
        })),
        shares: shareRows.filter((share) => share.documentId === document.id).map((share) => ({
          id: share.id, revision: share.revision, permission: share.permission, createdAt: share.createdAt,
          expiresAt: share.expiresAt, revokedAt: share.revokedAt,
          events: shareEvents.filter((event) => event.shareId === share.id).map((event) => ({ type: event.eventType, createdAt: event.createdAt })),
        })),
      })),
      dossiers: dossierRows.map((dossier) => ({
        id: dossier.id, status: dossier.status, createdAt: dossier.createdAt, updatedAt: dossier.updatedAt,
        title: decryptDossierData<string>(dossier.titleCiphertext, dossier.encryptionKeyVersion, user.id, dossier.id),
        items: dossierItemRows.filter((item) => item.dossierId === dossier.id).map((item) => ({
          id: item.id, linkedDocumentId: item.linkedDocumentId, kind: item.kind, status: item.status,
          required: item.required === 1, createdAt: item.createdAt, updatedAt: item.updatedAt,
          label: decryptDossierData<string>(item.labelCiphertext, item.encryptionKeyVersion, user.id, item.id),
          attachment: item.storedFileId && fileById.has(item.storedFileId) ? {
            mimeType: fileById.get(item.storedFileId)!.mimeType,
            byteSize: fileById.get(item.storedFileId)!.byteSize,
            scanStatus: fileById.get(item.storedFileId)!.scanStatus,
            createdAt: fileById.get(item.storedFileId)!.createdAt,
          } : null,
        })),
      })),
    };
    return new Response(JSON.stringify(exported, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="tndocs-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ code: "EXPORT_UNAVAILABLE", message: "The account data export could not be prepared." }, { status: 503 });
  }
}
