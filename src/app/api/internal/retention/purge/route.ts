import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { documentRevisions, personalDocuments, personalDossiers, storedFiles } from "@/platform/database/schema";
import { deleteStoredAttachment } from "@/modules/dossiers/file-storage";
import { env } from "@/platform/config/env";

const TRASH_RETENTION_DAYS = 30;
const BATCH_SIZE = 500;

function authorized(request: Request) {
  const secret = env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });

  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await database.transaction(async (tx) => {
    const expiredDocuments = await tx.select({ id: personalDocuments.id }).from(personalDocuments).where(and(
      eq(personalDocuments.status, "trash"), lt(personalDocuments.updatedAt, cutoff),
    )).limit(BATCH_SIZE).for("update");
    const expiredDossiers = await tx.select({ id: personalDossiers.id }).from(personalDossiers).where(and(
      eq(personalDossiers.status, "trash"), lt(personalDossiers.updatedAt, cutoff),
    )).limit(BATCH_SIZE).for("update");
    const dossierIds = expiredDossiers.map(({ id }) => id);
    const files = dossierIds.length ? await tx.select({ storageKey: storedFiles.storageKey }).from(storedFiles)
      .where(inArray(storedFiles.dossierId, dossierIds)) : [];

    const documentIds = expiredDocuments.map(({ id }) => id);
    if (documentIds.length) {
      await tx.delete(documentRevisions).where(inArray(documentRevisions.documentId, documentIds));
      await tx.delete(personalDocuments).where(and(
        inArray(personalDocuments.id, documentIds), eq(personalDocuments.status, "trash"), lt(personalDocuments.updatedAt, cutoff),
      ));
    }
    if (dossierIds.length) {
      await tx.delete(personalDossiers).where(and(
        inArray(personalDossiers.id, dossierIds), eq(personalDossiers.status, "trash"), lt(personalDossiers.updatedAt, cutoff),
      ));
    }
    return { documents: documentIds.length, dossiers: dossierIds.length, files };
  });

  const cleanup = await Promise.all(result.files.map(({ storageKey }) => deleteStoredAttachment(storageKey).then(() => true).catch(() => false)));
  return NextResponse.json({
    status: "purged",
    retentionDays: TRASH_RETENTION_DAYS,
    documents: result.documents,
    dossiers: result.dossiers,
    attachmentsRemoved: cleanup.filter(Boolean).length,
    attachmentCleanupFailures: cleanup.filter((removed) => !removed).length,
  }, { headers: { "Cache-Control": "no-store" } });
}
