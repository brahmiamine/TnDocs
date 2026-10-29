import { eq, sql } from "drizzle-orm";
import { documentRevisions, personalDocuments, personalDossiers, personalDossierItems, personProfiles, storedFiles, users } from "@/platform/database/schema";
import type { JobTransaction } from "@/platform/jobs/queue";
import { privateTemplates, privateTemplateVersions, privateDocumentModels } from "@/modules/private-templates/db-schema";
import { signatureAssets,signatureParticipants,signatureRequests } from "@/modules/signatures/db-schema";
import { dossierShareGrants } from "@/modules/dossiers/db-schema";
import { getSystemSettings } from "@/modules/administration/service";
import { accountStorageQuota, canStoreBytes } from "@/platform/retention/policy";

export async function configuredStorageQuota(tx?: JobTransaction) {
  if (process.env.ACCOUNT_STORAGE_QUOTA_BYTES !== undefined) return accountStorageQuota();
  return (await getSystemSettings(tx)).quotaBytes;
}

export async function lockStorageOwner(tx: JobTransaction, ownerId: string) {
  const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, ownerId)).for("update").limit(1);
  if (!owner) throw new Error("OWNER_NOT_FOUND");
}

/** Call inside the same transaction as the new storage reference. All writers
 * serialize on the owner row, so parallel uploads cannot both pass an old sum. */
export async function assertStorageQuota(tx: JobTransaction, ownerId: string, incoming: number, replacement = 0) {
  await lockStorageOwner(tx, ownerId);
  const [attachments] = await tx.select({ bytes: sql<number>`coalesce(sum(${storedFiles.byteSize}), 0)` }).from(storedFiles).where(eq(storedFiles.ownerUserId, ownerId));
  const [documents] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${documentRevisions.contentCiphertext})), 0)` }).from(documentRevisions).innerJoin(personalDocuments, eq(personalDocuments.id, documentRevisions.documentId)).where(eq(personalDocuments.ownerUserId, ownerId));
  const [profiles] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${personProfiles.dataCiphertext})), 0)` }).from(personProfiles).where(eq(personProfiles.ownerUserId, ownerId));
  const [templates] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${privateTemplateVersions.contentCiphertext})), 0)` }).from(privateTemplateVersions).innerJoin(privateTemplates, eq(privateTemplates.id, privateTemplateVersions.templateId)).where(eq(privateTemplates.ownerUserId, ownerId));
  const [snapshots] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${privateDocumentModels.contentCiphertext})), 0)` }).from(privateDocumentModels).innerJoin(personalDocuments, eq(personalDocuments.id, privateDocumentModels.documentId)).where(eq(personalDocuments.ownerUserId, ownerId));
  const [signatureImages] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${signatureAssets.dataCiphertext})), 0)` }).from(signatureAssets).where(eq(signatureAssets.ownerUserId, ownerId));
  const [participantImages] = await tx.select({ bytes: sql<number>`coalesce(sum(coalesce(octet_length(${signatureParticipants.signatureCiphertext}), 0) + octet_length(${signatureParticipants.emailCiphertext})), 0)` }).from(signatureParticipants).innerJoin(signatureRequests, eq(signatureRequests.id, signatureParticipants.requestId)).where(eq(signatureRequests.ownerUserId, ownerId));
  const [dossiers] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${personalDossiers.titleCiphertext})), 0)` }).from(personalDossiers).where(eq(personalDossiers.ownerUserId, ownerId));
  const [items] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${personalDossierItems.labelCiphertext})), 0)` }).from(personalDossierItems).innerJoin(personalDossiers, eq(personalDossiers.id, personalDossierItems.dossierId)).where(eq(personalDossiers.ownerUserId, ownerId));
  const [shares] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${dossierShareGrants.snapshotCiphertext}) + octet_length(${dossierShareGrants.recipientCiphertext})), 0)` }).from(dossierShareGrants).innerJoin(personalDossiers, eq(personalDossiers.id, dossierShareGrants.dossierId)).where(eq(personalDossiers.ownerUserId, ownerId));
  const used = Number(dossiers?.bytes ?? 0) + Number(items?.bytes ?? 0) + Number(shares?.bytes ?? 0) + Number(signatureImages?.bytes ?? 0) + Number(participantImages?.bytes ?? 0) + Number(templates?.bytes ?? 0) + Number(snapshots?.bytes ?? 0) + Number(attachments?.bytes ?? 0) + Number(documents?.bytes ?? 0) + Number(profiles?.bytes ?? 0);
  const quota = await configuredStorageQuota(tx);
  if (!canStoreBytes({ used, incoming, replacement, quota })) throw new Error("STORAGE_QUOTA_EXCEEDED");
  return { used, quota };
}
