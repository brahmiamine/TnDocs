import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personalDocumentShareEvents, personalDocumentShares, personalDocuments } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin } from "@/modules/identity/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string; shareId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { documentId, shareId } = await params;
  const [document] = await database.select({ id: personalDocuments.id }).from(personalDocuments).where(and(
    eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id),
  )).limit(1);
  if (!document) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const [share] = await database.select({ id: personalDocumentShares.id }).from(personalDocumentShares).where(and(
    eq(personalDocumentShares.id, shareId), eq(personalDocumentShares.documentId, documentId), isNull(personalDocumentShares.revokedAt),
  )).limit(1);
  if (!share) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  await database.transaction(async (tx) => {
    await tx.update(personalDocumentShares).set({ revokedAt: new Date() }).where(eq(personalDocumentShares.id, shareId));
    await tx.insert(personalDocumentShareEvents).values({ id: randomUUID(), shareId, eventType: "revoked" });
  });
  return NextResponse.json({ id: shareId, status: "revoked" }, { headers: { "Cache-Control": "private, no-store" } });
}
