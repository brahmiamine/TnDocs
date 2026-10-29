import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { sessions, users, verificationChallenges } from "@/platform/database/schema";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { hashPassword } from "@/modules/identity/password";
import { createSecretToken, hashSecretToken } from "@/modules/identity/tokens";
import { sessionLifetimeSeconds, setSessionCookie } from "@/modules/identity/service";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { createHash } from "node:crypto";

const inputSchema = z.object({ token: z.string().min(32).max(128), password: z.string().min(12).max(128) });

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!database) return serviceUnavailable();
  const parsed = inputSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Choisissez un mot de passe d’au moins 12 caractères et vérifiez votre lien." }, { status: 400 });
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateKey = createHash("sha256").update(`password-reset\0${address}`).digest("hex");
  if (await isRateLimited(rateKey, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429, headers: { "Retry-After": "900" } });
  }

  const [challenge] = await database.select().from(verificationChallenges).where(and(
    eq(verificationChallenges.tokenHash, hashSecretToken(parsed.data.token)),
    eq(verificationChallenges.purpose, "password_reset"),
    isNull(verificationChallenges.usedAt),
    gt(verificationChallenges.expiresAt, new Date()),
  )).limit(1);
  if (!challenge) return NextResponse.json({ code: "INVALID_TOKEN", message: "Ce lien est invalide ou expiré." }, { status: 400 });

  const passwordHash = await hashPassword(parsed.data.password);
  const session = createSecretToken();
  try {
    await database.transaction(async (tx) => {
      const [locked] = await tx.select().from(verificationChallenges).where(and(
        eq(verificationChallenges.id, challenge.id), isNull(verificationChallenges.usedAt),
        gt(verificationChallenges.expiresAt, new Date()),
      )).for("update").limit(1);
      if (!locked) throw new Error("Challenge was already used or expired");
      const [account] = await tx.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, challenge.userId)).for("update").limit(1);
      if (!account || account.status !== "active") throw new Error("Account is not active");
      await tx.update(verificationChallenges).set({ usedAt: new Date() }).where(eq(verificationChallenges.id, locked.id));
      await tx.update(verificationChallenges).set({ usedAt: new Date() }).where(and(
        eq(verificationChallenges.userId, challenge.userId), eq(verificationChallenges.purpose, "password_reset"),
        isNull(verificationChallenges.usedAt),
      ));
      await tx.update(users).set({ passwordHash }).where(eq(users.id, challenge.userId));
      await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, challenge.userId), isNull(sessions.revokedAt)));
      await tx.insert(sessions).values({
        id: randomUUID(), userId: challenge.userId, tokenHash: session.hash,
        expiresAt: new Date(Date.now() + sessionLifetimeSeconds * 1000),
      });
    });
  } catch {
    return NextResponse.json({ code: "RESET_FAILED", message: "La modification a échoué. Demandez un nouveau lien." }, { status: 409 });
  }

  const response = NextResponse.json({ status: "password_updated" });
  setSessionCookie(response, session.token);
  return response;
}
