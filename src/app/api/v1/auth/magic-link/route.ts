import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { users, verificationChallenges } from "@/platform/database/schema";
import { sendMagicLinkEmail } from "@/modules/identity/mailer";
import { createSecretToken } from "@/modules/identity/tokens";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
const schema = z.object({ email: z.string().trim().email().max(320).transform(value => value.toLowerCase()) });
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  if (!database) return serviceUnavailable();
  const input = schema.safeParse(await readJsonBody(request));
  if (!input.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = createHash("sha256").update(`magic:${address}:${input.data.email}`).digest("hex");
  if (await isRateLimited(key, 3, 15 * 60_000)) return NextResponse.json({ status: "request_received" }, { status: 202 });
  const [user] = await database.select().from(users).where(eq(users.email, input.data.email)).limit(1);
  if (user?.status === "active" && user.emailVerifiedAt) {
    const token = createSecretToken();
    try {
      await database.transaction(async tx => {
      await tx.insert(verificationChallenges).values({ id: randomUUID(), userId: user.id, purpose: "magic_link", tokenHash: token.hash, expiresAt: new Date(Date.now() + 15 * 60_000) });
      await sendMagicLinkEmail(user.email, token.token, user.preferredLocale, user.id, tx);
      });
    } catch {
      await database.update(verificationChallenges).set({ usedAt: new Date() }).where(eq(verificationChallenges.tokenHash, token.hash));
    }
  }
  return NextResponse.json({ status: "request_received" }, { status: 202 });
}
