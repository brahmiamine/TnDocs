import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { catalogTemplateVersions, catalogTemplates, documentRevisions, personalDocuments, storedFiles, users } from "@/platform/database/schema";
import { getCurrentUser, requireDatabase, clearSessionCookie } from "@/modules/identity/service";
import { burnPasswordCheck, verifyPassword } from "@/modules/identity/password";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { hashSecretToken } from "@/modules/identity/tokens";
import { deleteStoredAttachment } from "@/modules/dossiers/file-storage";

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

  const fileObjects = await db.select({ storageKey: storedFiles.storageKey }).from(storedFiles).where(eq(storedFiles.ownerUserId, user.id));
  await db.transaction(async (tx) => {
    const ownedDocuments = await tx.select({ id: personalDocuments.id }).from(personalDocuments).where(eq(personalDocuments.ownerUserId, user.id));
    if (ownedDocuments.length) {
      await tx.delete(documentRevisions).where(inArray(documentRevisions.documentId, ownedDocuments.map((document) => document.id)));
    }
    await tx.delete(users).where(and(eq(users.id, user.id), eq(users.status, "active")));
  });
  await Promise.all(fileObjects.map(({ storageKey }) => deleteStoredAttachment(storageKey).catch(() => undefined)));

  const response = NextResponse.json({ status: "account_deleted" }, { headers: { "Cache-Control": "private, no-store" } });
  clearSessionCookie(response);
  return response;
}
