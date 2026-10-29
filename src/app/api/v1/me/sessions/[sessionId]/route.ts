import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { sessions } from "@/platform/database/schema";
import { identityAuditEvents } from "@/modules/identity/advanced-schema";
import { clearSessionCookie, getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
export async function DELETE(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  if (!database) return serviceUnavailable();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { sessionId } = await params;
  const [owned] = await database.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id), isNull(sessions.revokedAt))).limit(1);
  if (!owned) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  await database.transaction(async tx => {
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)));
    await tx.insert(identityAuditEvents).values({ id: randomUUID(), userId: user.id, event: "session_revoked" });
  });
  const response = NextResponse.json({ status: "revoked" });
  if (sessionId === user.sessionId) clearSessionCookie(response);
  return response;
}
