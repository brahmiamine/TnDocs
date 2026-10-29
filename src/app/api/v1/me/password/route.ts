import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { sessions, users } from "@/platform/database/schema";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/modules/identity/password";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { clearSessionCookie, getCurrentUser } from "@/modules/identity/service";
import { hashSecretToken } from "@/modules/identity/tokens";

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
}).refine((value) => value.currentPassword !== value.newPassword);

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!database) return serviceUnavailable();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (await isRateLimited(hashSecretToken(`password-change:${user.id}`), 5, 15 * 60 * 1000)) {
    return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429 });
  }
  const parsed = passwordChangeSchema.safeParse(await readJsonBody(request, 2 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  const [account] = await database.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!account || !(await verifyPassword(parsed.data.currentPassword, account.passwordHash))) {
    if (!account) await burnPasswordCheck(parsed.data.currentPassword);
    return NextResponse.json({ code: "INVALID_CREDENTIALS" }, { status: 403 });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const now = new Date();
  await database.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
  });
  const response = NextResponse.json({ status: "password_changed" }, { headers: { "Cache-Control": "private, no-store" } });
  clearSessionCookie(response);
  return response;
}
