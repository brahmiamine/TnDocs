import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { database } from "@/platform/database/client";
import { sessions, users } from "@/platform/database/schema";
import { createSecretToken, hashSecretToken } from "./tokens";

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

export async function getCurrentUser() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token || !database) return null;
  const [row] = await database.select({
    user: { id: users.id, email: users.email, preferredLocale: users.preferredLocale },
  }).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(
      eq(sessions.tokenHash, hashSecretToken(token)),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
      eq(users.status, "active"),
    )).limit(1);
  return row?.user ?? null;
}

export function setSessionCookie(response: Response, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionLifetimeSeconds}${secure}`);
}

export function clearSessionCookie(response: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}
