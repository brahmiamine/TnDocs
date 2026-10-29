import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { users, verificationChallenges } from "@/platform/database/schema";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { sendPasswordResetEmail } from "@/modules/identity/mailer";
import { createSecretToken } from "@/modules/identity/tokens";

const inputSchema = z.object({ email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()) });

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!database) return serviceUnavailable();
  const parsed = inputSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Entrez une adresse email valide." }, { status: 400 });

  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const keyHash = createHash("sha256").update(`reset\0${address}\0${parsed.data.email}`).digest("hex");
  if (await isRateLimited(keyHash, 3, 15 * 60 * 1000)) {
    return NextResponse.json({ status: "request_received" }, { status: 202 });
  }

  const [user] = await database.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (user?.status === "active") {
    const challenge = createSecretToken();
    try {
      await database.update(verificationChallenges).set({ usedAt: new Date() }).where(and(
        eq(verificationChallenges.userId, user.id), eq(verificationChallenges.purpose, "password_reset"),
        isNull(verificationChallenges.usedAt),
      ));
      await database.insert(verificationChallenges).values({
        id: randomUUID(), userId: user.id, purpose: "password_reset", tokenHash: challenge.hash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      await sendPasswordResetEmail(user.email, challenge.token, user.preferredLocale);
    } catch {
      // The response stays generic; never reveal account state or email contents in logs.
      await database.update(verificationChallenges).set({ usedAt: new Date() }).where(eq(verificationChallenges.tokenHash, challenge.hash));
    }
  }

  return NextResponse.json({ status: "request_received" }, { status: 202 });
}
