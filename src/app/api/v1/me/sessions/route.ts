import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { sessions } from "@/platform/database/schema";
import { getSessionUser } from "@/modules/identity/service";
import { identityAuditEvents, oauthIdentities } from "@/modules/identity/advanced-schema";
import { googleConfig } from "@/modules/identity/oauth";
import { serviceUnavailable } from "@/modules/identity/http";
export async function GET() {
  if (!database) return serviceUnavailable();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const state = { mfaEnabled: user.mfaEnabled, mfaVerified: user.mfaVerified, mfaRequired: user.mfaRequired, googleConfigured: Boolean(googleConfig()), mfaConfigurable: Boolean(process.env.IDENTITY_ENCRYPTION_KEY_V1) };
  if (user.mfaRequired && !user.mfaVerified) return NextResponse.json({ ...state, sessions: [], events: [] }, { headers: { "Cache-Control": "no-store" } });
  const [active, events, linked] = await Promise.all([
    database.select({ id: sessions.id, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt }).from(sessions).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).orderBy(desc(sessions.createdAt)),
    database.select({ event: identityAuditEvents.event, createdAt: identityAuditEvents.createdAt }).from(identityAuditEvents).where(eq(identityAuditEvents.userId, user.id)).orderBy(desc(identityAuditEvents.createdAt)).limit(50),
    database.select({ provider: oauthIdentities.provider }).from(oauthIdentities).where(eq(oauthIdentities.userId, user.id)),
  ]);
  return NextResponse.json({ ...state, googleLinked: linked.some(row => row.provider === "google"), sessions: active.map(row => ({ ...row, current: row.id === user.sessionId })), events }, { headers: { "Cache-Control": "no-store" } });
}
