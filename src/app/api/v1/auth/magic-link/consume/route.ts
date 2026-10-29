import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { sessions, users, verificationChallenges } from "@/platform/database/schema";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { sessionLifetimeSeconds, setSessionCookie } from "@/modules/identity/service";
import { createSecretToken, hashSecretToken } from "@/modules/identity/tokens";

const inputSchema = z.object({ token: z.string().min(32).max(128) });

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!database) return serviceUnavailable();
  const parsed = inputSchema.safeParse(await readJsonBody(request, 2 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_TOKEN" }, { status: 400 });
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateKey = hashSecretToken(`magic-link-consume\0${address}`);
  if (await isRateLimited(rateKey, 20, 15 * 60 * 1000)) return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "900" } });

  const [challenge] = await database.select().from(verificationChallenges).where(and(
    eq(verificationChallenges.tokenHash, hashSecretToken(parsed.data.token)),
    eq(verificationChallenges.purpose, "magic_link"), isNull(verificationChallenges.usedAt), gt(verificationChallenges.expiresAt, new Date()),
  )).limit(1);
  if (!challenge) return NextResponse.json({ code: "INVALID_TOKEN" }, { status: 400 });

  const rawSession = createSecretToken();
  try {
    await database.transaction(async (tx) => {
      const [locked] = await tx.select().from(verificationChallenges).where(and(
        eq(verificationChallenges.id, challenge.id), isNull(verificationChallenges.usedAt), gt(verificationChallenges.expiresAt, new Date()),
      )).for("update").limit(1);
      if (!locked) throw new Error("Challenge was already used or expired");
      const [account] = await tx.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, locked.userId)).for("update").limit(1);
      if (!account || account.status !== "active") throw new Error("Account is not active");
      await tx.update(verificationChallenges).set({ usedAt: new Date() }).where(eq(verificationChallenges.id, locked.id));
      await tx.insert(sessions).values({
        id: randomUUID(), userId: account.id, tokenHash: rawSession.hash,
        expiresAt: new Date(Date.now() + sessionLifetimeSeconds * 1000),
      });
    });
  } catch {
    return NextResponse.json({ code: "INVALID_TOKEN" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const response = NextResponse.json({ status: "authenticated" }, { headers: { "Cache-Control": "private, no-store" } });
  setSessionCookie(response, rawSession.token);
  return response;
}
