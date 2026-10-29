import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { sessions, users, verificationChallenges } from "@/platform/database/schema";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { createSecretToken, hashSecretToken } from "@/modules/identity/tokens";
import { sessionLifetimeSeconds, setSessionCookie } from "@/modules/identity/service";

const inputSchema = z.object({ token: z.string().min(32).max(128) });

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!database) return serviceUnavailable();
  const parsed = inputSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_TOKEN", message: "Ce lien de vérification est invalide ou expiré." }, { status: 400 });

  const [challenge] = await database.select().from(verificationChallenges).where(and(
    eq(verificationChallenges.tokenHash, hashSecretToken(parsed.data.token)),
    eq(verificationChallenges.purpose, "email_verification"),
    isNull(verificationChallenges.usedAt),
    gt(verificationChallenges.expiresAt, new Date()),
  )).limit(1);
  if (!challenge) return NextResponse.json({ code: "INVALID_TOKEN", message: "Ce lien de vérification est invalide ou expiré." }, { status: 400 });

  const rawSession = createSecretToken();
  try {
    await database.transaction(async (tx) => {
      const [locked] = await tx.select().from(verificationChallenges).where(and(
        eq(verificationChallenges.id, challenge.id), isNull(verificationChallenges.usedAt),
        gt(verificationChallenges.expiresAt, new Date()),
      )).for("update").limit(1);
      if (!locked) throw new Error("Challenge was already used or expired");
      await tx.update(verificationChallenges).set({ usedAt: new Date() }).where(eq(verificationChallenges.id, locked.id));
      await tx.update(users).set({ status: "active", emailVerifiedAt: new Date() }).where(eq(users.id, challenge.userId));
      await tx.insert(sessions).values({
        id: randomUUID(), userId: challenge.userId, tokenHash: rawSession.hash,
        expiresAt: new Date(Date.now() + sessionLifetimeSeconds * 1000),
      });
    });
  } catch {
    return NextResponse.json({ code: "VERIFICATION_FAILED", message: "La vérification a échoué. Réessayez." }, { status: 409 });
  }

  const response = NextResponse.json({ status: "verified" });
  setSessionCookie(response, rawSession.token);
  return response;
}
