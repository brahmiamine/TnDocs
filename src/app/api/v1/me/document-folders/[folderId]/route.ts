import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personalDocumentFolders, personalDocuments } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin } from "@/modules/identity/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ folderId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { folderId } = await params;
  const [folder] = await database.select({ id: personalDocumentFolders.id }).from(personalDocumentFolders).where(and(
    eq(personalDocumentFolders.id, folderId), eq(personalDocumentFolders.ownerUserId, user.id),
  )).limit(1);
  if (!folder) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  await database.transaction(async (tx) => {
    await tx.update(personalDocuments).set({ folderId: null }).where(and(
      eq(personalDocuments.folderId, folderId), eq(personalDocuments.ownerUserId, user.id),
    ));
    await tx.delete(personalDocumentFolders).where(and(
      eq(personalDocumentFolders.id, folderId), eq(personalDocumentFolders.ownerUserId, user.id),
    ));
  });
  return NextResponse.json({ id: folderId, deleted: true }, { headers: { "Cache-Control": "private, no-store" } });
}
