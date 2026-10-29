import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { sessions, users, verificationChallenges } from "@/platform/database/schema";
import { identityAuditEvents, userSecondFactors } from "@/modules/identity/advanced-schema";
import { createSecretToken, hashSecretToken } from "@/modules/identity/tokens";
import { sessionLifetimeSeconds, setSessionCookie } from "@/modules/identity/service";
import { mustUseMfa } from "@/modules/identity/totp";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
const schema = z.object({ token: z.string().min(32).max(128) });
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  if (!database) return serviceUnavailable();
  const input = schema.safeParse(await readJsonBody(request));
  if (!input.success) return NextResponse.json({ code: "INVALID_TOKEN" }, { status: 400 });
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await isRateLimited(createHash("sha256").update(`magic-consume:${address}`).digest("hex"), 15, 15 * 60_000)) return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429 });
  const raw = createSecretToken();
  try {
    const result = await database.transaction(async tx => {
      const [challenge] = await tx.select().from(verificationChallenges).where(and(eq(verificationChallenges.tokenHash, hashSecretToken(input.data.token)), eq(verificationChallenges.purpose, "magic_link"), isNull(verificationChallenges.usedAt), gt(verificationChallenges.expiresAt, new Date()))).for("update").limit(1);
      if (!challenge) throw new Error("Invalid token");
      const [user] = await tx.select().from(users).where(eq(users.id, challenge.userId)).for("update").limit(1);
      if (!user || user.status !== "active" || !user.emailVerifiedAt) throw new Error("Account unavailable");
      await tx.update(verificationChallenges).set({ usedAt: new Date() }).where(eq(verificationChallenges.id, challenge.id));
      await tx.insert(sessions).values({ id: randomUUID(), userId: user.id, tokenHash: raw.hash, expiresAt: new Date(Date.now() + sessionLifetimeSeconds * 1000) });
      await tx.insert(identityAuditEvents).values({ id: randomUUID(), userId: user.id, event: "magic_link_login" });
      const [factor] = await tx.select().from(userSecondFactors).where(eq(userSecondFactors.userId, user.id)).limit(1);
      return { locale: user.preferredLocale, status: mustUseMfa(user.role, Boolean(factor?.enabledAt)) ? "mfa_required" : "authenticated" };
    });
    const response = NextResponse.json(result, { headers: { "Cache-Control": "no-store" } }); setSessionCookie(response, raw.token); return response;
  } catch { return NextResponse.json({ code: "INVALID_TOKEN", message: "Lien invalide ou expiré / الرابط غير صالح أو منتهي" }, { status: 400 }); }
}
