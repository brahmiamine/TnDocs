import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { users } from "@/platform/database/schema";
import { emailChangeChallenges, identityAuditEvents } from "@/modules/identity/advanced-schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { createSecretToken, hashSecretToken } from "@/modules/identity/tokens";
import { verifyPassword } from "@/modules/identity/password";
import { sendEmailChangeConfirmation } from "@/modules/identity/mailer";
const schema = z.object({ email: z.string().trim().email().max(320).transform(value => value.toLowerCase()), password: z.string().min(1).max(128) });
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  if (!database) return serviceUnavailable();
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const input = schema.safeParse(await readJsonBody(request)); if (!input.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  if (await isRateLimited(hashSecretToken(`change-email:${user.id}`), 5, 15 * 60_000)) return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429 });
  const [account] = await database.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!account || !await verifyPassword(input.data.password, account.passwordHash)) return NextResponse.json({ code: "INVALID_CREDENTIALS" }, { status: 401 });
  const token = createSecretToken();
  try {
    await database.transaction(async tx => {
    await tx.insert(emailChangeChallenges).values({ userId: user.id, tokenHash: token.hash, newEmail: input.data.email, expiresAt: new Date(Date.now() + 30 * 60_000) });
    await sendEmailChangeConfirmation(input.data.email, token.token, user.preferredLocale, user.id, tx);
    await tx.insert(identityAuditEvents).values({ id: randomUUID(), userId: user.id, event: "email_change_requested" });
    });
  } catch {
    await database.update(emailChangeChallenges).set({ usedAt: new Date() }).where(eq(emailChangeChallenges.tokenHash, token.hash));
    return serviceUnavailable();
  }
  return NextResponse.json({ status: "confirmation_sent" }, { status: 202 });
}
