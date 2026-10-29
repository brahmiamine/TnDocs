import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { loginAttemptLimits, sessions, users } from "@/platform/database/schema";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { burnPasswordCheck, verifyPassword } from "@/modules/identity/password";
import { createSecretToken } from "@/modules/identity/tokens";
import { sessionLifetimeSeconds, setSessionCookie } from "@/modules/identity/service";
import { identityAuditEvents, userSecondFactors } from "@/modules/identity/advanced-schema";
import { mustUseMfa } from "@/modules/identity/totp";
import { isRateLimited } from "@/modules/identity/rate-limit";

const inputSchema = z.object({ email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()), password: z.string().min(1).max(128) });
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!database) return serviceUnavailable();
  const parsed = inputSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Adresse email ou mot de passe incorrect." }, { status: 400 });

  const { email, password } = parsed.data;
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limitKey = createHash("sha256").update(`${address}\0${email}`).digest("hex");
  if (await isRateLimited(limitKey, MAX_ATTEMPTS, WINDOW_MS)) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429, headers: { "Retry-After": "900" } });
  }

  const [user] = await database.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = user ? await verifyPassword(password, user.passwordHash) : (await burnPasswordCheck(password), false);
  if (!user || !valid || user.status !== "active") {
    return NextResponse.json({ code: "INVALID_CREDENTIALS", message: "Adresse email ou mot de passe incorrect." }, { status: 401 });
  }

  await database.delete(loginAttemptLimits).where(eq(loginAttemptLimits.keyHash, limitKey));
  const session = createSecretToken();
  await database.transaction(async tx => {
  await tx.insert(sessions).values({
    id: randomUUID(), userId: user.id, tokenHash: session.hash,
    expiresAt: new Date(Date.now() + sessionLifetimeSeconds * 1000),
  });
  await tx.insert(identityAuditEvents).values({ id: randomUUID(), userId: user.id, event: "password_login" });
  });
  const [factor] = await database.select({ enabledAt: userSecondFactors.enabledAt }).from(userSecondFactors).where(eq(userSecondFactors.userId, user.id)).limit(1);
  const response = NextResponse.json({ status: mustUseMfa(user.role, Boolean(factor?.enabledAt)) ? "mfa_required" : "authenticated", locale: user.preferredLocale });
  setSessionCookie(response, session.token);
  return response;
}
