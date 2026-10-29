import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { database } from "@/platform/database/client";
import { sessions, users } from "@/platform/database/schema";
import { createSecretToken, hashSecretToken } from "./tokens";
import { sessionFactors, userSecondFactors } from "./advanced-schema";
import { mustUseMfa } from "./totp";

export const sessionCookieName = process.env.NODE_ENV === "production" ? "__Host-tndocs_session" : "tndocs_session";
export const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

export function requireDatabase() {
  if (!database) throw new Error("Database is not configured");
  return database;
}

export async function createSession(userId: string) {
  const rawToken = createSecretToken();
  await requireDatabase().insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash: rawToken.hash,
    expiresAt: new Date(Date.now() + sessionLifetimeSeconds * 1000),
  });
  return rawToken.token;
}

export async function getSessionUser() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token || !database) return null;
  const [row] = await database.select({
    user: { id: users.id, email: users.email, preferredLocale: users.preferredLocale, role: users.role },
    sessionId: sessions.id, sessionCreatedAt: sessions.createdAt,
  }).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(
      eq(sessions.tokenHash, hashSecretToken(token)),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
      eq(users.status, "active"),
    )).limit(1);
  if (!row) return null;
  const [factor] = await database.select({ enabledAt: userSecondFactors.enabledAt }).from(userSecondFactors).where(eq(userSecondFactors.userId, row.user.id)).limit(1);
  const [verified] = await database.select().from(sessionFactors).where(eq(sessionFactors.sessionId, row.sessionId)).limit(1);
  const mfaEnabled = Boolean(factor?.enabledAt);
  return { ...row.user, sessionId: row.sessionId, sessionCreatedAt: row.sessionCreatedAt, mfaEnabled, mfaVerified: Boolean(verified), mfaRequired: mustUseMfa(row.user.role, mfaEnabled) };
}

export async function getCurrentUser() {
  const user = await getSessionUser();
  return user && (!user.mfaRequired || user.mfaVerified) ? user : null;
}

export function setSessionCookie(response: Response, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetimeSeconds}${secure}`);
}

export function clearSessionCookie(response: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}
