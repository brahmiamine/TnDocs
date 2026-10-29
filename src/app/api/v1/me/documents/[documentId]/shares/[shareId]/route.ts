import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personalDocumentShareEvents, personalDocumentShares, personalDocuments } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin } from "@/modules/identity/http";
import { ShareError } from "@/modules/sharing/service";
import { shareFailure } from "@/modules/sharing/http";
export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string; shareId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    const db = database; if (!db) throw new ShareError("SERVICE_UNAVAILABLE", 503);
    const { documentId, shareId } = await params;
    await db.transaction(async (tx) => {
      const [row] = await tx.select({ share: personalDocumentShares }).from(personalDocumentShares).innerJoin(personalDocuments, eq(personalDocuments.id, personalDocumentShares.documentId)).where(and(eq(personalDocuments.id, documentId), eq(personalDocuments.ownerUserId, user.id), eq(personalDocumentShares.id, shareId))).limit(1).for("update");
      if (!row) throw new ShareError("NOT_FOUND");
      if (!row.share.revokedAt) {
        await tx.update(personalDocumentShares).set({ revokedAt: new Date() }).where(eq(personalDocumentShares.id, shareId));
        await tx.insert(personalDocumentShareEvents).values({ id: randomUUID(), shareId, eventType: "revoked" });
      }
    });
    return NextResponse.json({ id: shareId, status: "revoked" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return shareFailure(error); }
}
