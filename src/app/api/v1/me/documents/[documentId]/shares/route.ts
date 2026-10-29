import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { documentRevisions, personalDocumentShareEvents, personalDocumentShares, personalDocuments } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { createSecretToken } from "@/modules/identity/tokens";
import { env } from "@/platform/config/env";

const createShareSchema = z.object({ expiresInDays: z.number().int().min(1).max(30), locale: z.enum(["fr", "ar"]), permission: z.enum(["view", "copy"]) });

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { documentId } = await params;
  const [document] = await database.select({ id: personalDocuments.id }).from(personalDocuments).where(and(
    eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id),
  )).limit(1);
  if (!document) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const shares = await database.select({
    id: personalDocumentShares.id, revision: personalDocumentShares.revision,
    permission: personalDocumentShares.permission,
    createdAt: personalDocumentShares.createdAt, expiresAt: personalDocumentShares.expiresAt,
    revokedAt: personalDocumentShares.revokedAt,
  }).from(personalDocumentShares).where(eq(personalDocumentShares.documentId, documentId))
    .orderBy(desc(personalDocumentShares.createdAt)).limit(20);
  return NextResponse.json({ shares }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const parsed = createShareSchema.safeParse(await readJsonBody(request, 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  const { documentId } = await params;
  const [document] = await database.select().from(personalDocuments).where(and(
    eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id),
  )).limit(1);
  if (!document || document.status === "trash") return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const [revision] = await database.select({ id: documentRevisions.id }).from(documentRevisions).where(and(
    eq(documentRevisions.documentId, document.id), eq(documentRevisions.revision, document.currentRevision),
  )).limit(1);
  if (!revision) return NextResponse.json({ code: "DOCUMENT_UNAVAILABLE" }, { status: 503 });

  const grantId = randomUUID();
  const secret = createSecretToken();
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);
  await database.transaction(async (tx) => {
    await tx.insert(personalDocumentShares).values({
      id: grantId, documentId, revision: document.currentRevision,
      tokenHash: secret.hash, permission: parsed.data.permission, expiresAt,
    });
    await tx.insert(personalDocumentShareEvents).values({ id: randomUUID(), shareId: grantId, eventType: "created" });
  });
  const url = new URL(`/${parsed.data.locale}/partage#${secret.token}`, env.APP_URL).toString();
  return NextResponse.json({ share: { id: grantId, revision: document.currentRevision, permission: parsed.data.permission, expiresAt }, url }, {
    status: 201, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}
