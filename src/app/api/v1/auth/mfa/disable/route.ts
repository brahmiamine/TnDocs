import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { users, sessions } from "@/platform/database/schema";
import { userSecondFactors, recoveryCodes, identityAuditEvents } from "@/modules/identity/advanced-schema";
import { getCurrentUser } from "@/modules/identity/service";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { hashSecretToken } from "@/modules/identity/tokens";
import { verifyPassword } from "@/modules/identity/password";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
const inputSchema = z.object({ password: z.string().min(1).max(128) });
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  if (!database) return serviceUnavailable();
  const user = await getCurrentUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ code: "MFA_REQUIRED" }, { status: 403 });
  if (process.env.NODE_ENV === "production" && user.role !== "user") return NextResponse.json({ code: "MFA_MANDATORY" }, { status: 403 });
  if (await isRateLimited(hashSecretToken(`mfa-disable:${user.id}`), 5, 15 * 60_000)) return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429 });
  const input = inputSchema.safeParse(await readJsonBody(request));
  if (!input.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  const [account] = await database.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!account || !await verifyPassword(input.data.password, account.passwordHash)) return NextResponse.json({ code: "INVALID_CREDENTIALS" }, { status: 401 });
  await database.transaction(async tx => {
    await tx.delete(userSecondFactors).where(eq(userSecondFactors.userId, user.id));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
    await tx.insert(identityAuditEvents).values({ id: randomUUID(), userId: user.id, event: "mfa_disabled" });
  });
  return NextResponse.json({ status: "disabled_signed_out" });
}
