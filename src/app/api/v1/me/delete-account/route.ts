import { ensureAdminDeletionAllowed } from "@/modules/administration/users";
import { artifactReservations } from "@/platform/jobs/artifacts-schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { catalogTemplateVersions, catalogTemplates, documentRevisions, personalDocuments, storedFiles, users } from "@/platform/database/schema";
import { getCurrentUser, requireDatabase, clearSessionCookie } from "@/modules/identity/service";
import { burnPasswordCheck, verifyPassword } from "@/modules/identity/password";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { hashSecretToken } from "@/modules/identity/tokens";
import { lockStorageOwner } from "@/platform/storage/quota";
import { enqueueJob } from "@/platform/jobs/queue";
import { jobs } from "@/platform/jobs/schema";

const deletionSchema = z.object({ password: z.string().min(1).max(256), confirmation: z.literal(true) });

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!database) return serviceUnavailable();

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  if (await isRateLimited(hashSecretToken(`account-delete:${user.id}`), 5, 15 * 60 * 1000)) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = deletionSchema.safeParse(await readJsonBody(request, 2 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_REQUEST", message: "Confirm the deletion and enter your password." }, { status: 400 });

  const db = requireDatabase();
  const [account] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!account || !(await verifyPassword(parsed.data.password, account.passwordHash))) {
    if (!account) await burnPasswordCheck(parsed.data.password);
    return NextResponse.json({ code: "INVALID_CREDENTIALS", message: "The password is incorrect." }, { status: 403 });
  }

  const [templateContribution] = await db.select({ id: catalogTemplates.id }).from(catalogTemplates).where(eq(catalogTemplates.createdBy, user.id)).limit(1);
  const [versionContribution] = await db.select({ id: catalogTemplateVersions.id }).from(catalogTemplateVersions).where(eq(catalogTemplateVersions.createdBy, user.id)).limit(1);
  if (templateContribution || versionContribution) {
    return NextResponse.json({ code: "ACCOUNT_HAS_CATALOG_CONTRIBUTIONS", message: "This account owns catalog records and must be transferred before deletion." }, { status: 409 });
  }

  try {
  await db.transaction(async (tx) => {
    await ensureAdminDeletionAllowed(tx, user.id);
    await lockStorageOwner(tx, user.id);
    const fileObjects = await tx.select({ storageKey: storedFiles.storageKey }).from(storedFiles).where(eq(storedFiles.ownerUserId, user.id));
    const ownedDocuments = await tx.select({ id: personalDocuments.id }).from(personalDocuments).where(eq(personalDocuments.ownerUserId, user.id));
    if (ownedDocuments.length) {
      await tx.delete(documentRevisions).where(inArray(documentRevisions.documentId, ownedDocuments.map((document) => document.id)));
    }
    const artifacts = await tx.select().from(jobs).where(and(eq(jobs.ownerUserId, user.id), or(eq(jobs.kind, "document.export"), eq(jobs.kind, "signature.export"), eq(jobs.kind, "attachment.upload")))).for("update");
    for (const file of fileObjects) await enqueueJob({ kind: "storage.delete", key: `storage-delete:${file.storageKey}`, payload: { storageKey: file.storageKey }, maxAttempts: 10 }, tx);
    for (const artifact of artifacts) {
      const key = typeof artifact.result?.storageKey === "string" ? artifact.result.storageKey : typeof artifact.payload.storageKey === "string" ? artifact.payload.storageKey : `${user.id}/${artifact.id}.enc`;
      const cleanup = await enqueueJob({ kind: "storage.delete", key: `storage-delete:${key}`, payload: { storageKey: key }, maxAttempts: 10 }, tx);
      // A renderer already running may still be stopping. Delete after its old
      // lease ends, while fencing prevents it from publishing a new result.
      if (artifact.leaseExpiresAt) await tx.update(jobs).set({ availableAt: new Date(Math.max(Date.now(), artifact.leaseExpiresAt.getTime() + 60000)) }).where(eq(jobs.id, cleanup.id));
      await tx.delete(artifactReservations).where(eq(artifactReservations.storageKey, key));
      await tx.update(jobs).set({ status: "cancelled", leaseToken: null, leaseExpiresAt: null, result: { expired: true } }).where(eq(jobs.id, artifact.id));
    }
    await tx.delete(users).where(and(eq(users.id, user.id), eq(users.status, "active")));
  });
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_ACTIVE_ADMIN") return NextResponse.json({ code: "LAST_ACTIVE_ADMIN", message: "Transfer administrator access to another verified active account before deleting this account." }, { status: 409 });
    return NextResponse.json({ code: "ACCOUNT_DELETION_UNAVAILABLE", message: "The account could not be deleted. Try again later." }, { status: 503 });
  }

  const response = NextResponse.json({ status: "account_deleted" }, { headers: { "Cache-Control": "private, no-store" } });
  clearSessionCookie(response);
  return response;
}
