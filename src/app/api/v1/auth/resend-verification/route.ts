import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { users, verificationChallenges } from "@/platform/database/schema";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { createSecretToken, hashSecretToken } from "@/modules/identity/tokens";
import { sendVerificationEmail } from "@/modules/identity/mailer";
import { isRateLimited } from "@/modules/identity/rate-limit";
const schema = z.object({ email: z.string().trim().email().max(320).transform(value => value.toLowerCase()) });
export async function POST(request: Request) {
  const error = requireSameOrigin(request); if (error) return error;
  if (!database) return serviceUnavailable();
  const input = schema.safeParse(await readJsonBody(request)); if (!input.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await isRateLimited(hashSecretToken(`resend-verification:${address}:${input.data.email}`), 3, 15 * 60_000)) return NextResponse.json({ status: "request_received" }, { status: 202 });
  const [user] = await database.select().from(users).where(eq(users.email, input.data.email)).limit(1);
  if (user?.status === "pending_verification") {
    const token = createSecretToken();
    try {
      await database.transaction(async tx => {
        await tx.update(verificationChallenges).set({ usedAt: new Date() }).where(and(eq(verificationChallenges.userId, user.id), eq(verificationChallenges.purpose, "email_verification"), isNull(verificationChallenges.usedAt)));
        await tx.insert(verificationChallenges).values({ id: randomUUID(), userId: user.id, purpose: "email_verification", tokenHash: token.hash, expiresAt: new Date(Date.now() + 30 * 60_000) });
        await sendVerificationEmail(user.email, token.token, user.preferredLocale, user.id, tx);
      });
    } catch { /* Generic response never discloses account existence. */ }
  }
  return NextResponse.json({ status: "request_received" }, { status: 202 });
}
