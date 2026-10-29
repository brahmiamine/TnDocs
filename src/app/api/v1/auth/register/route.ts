import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { users, verificationChallenges } from "@/platform/database/schema";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { hashPassword } from "@/modules/identity/password";
import { sendVerificationEmail } from "@/modules/identity/mailer";
import { createSecretToken } from "@/modules/identity/tokens";
import { isRateLimited } from "@/modules/identity/rate-limit";

const inputSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  locale: z.enum(["fr", "ar"]).default("fr"),
});

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!database) return serviceUnavailable();

  const parsed = inputSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Vérifiez votre adresse email et choisissez un mot de passe d’au moins 12 caractères.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { email, password, locale } = parsed.data;
  const clientAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const registrationKey = createHash("sha256").update(`register\0${clientAddress}`).digest("hex");
  if (await isRateLimited(registrationKey, 5, 15 * 60 * 1000)) {
    return NextResponse.json({ code: "RATE_LIMITED", message: "Trop de demandes. Réessayez dans quelques minutes." }, { status: 429, headers: { "Retry-After": "900" } });
  }
  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  const verification = createSecretToken();

  try {
    await database.transaction(async tx => {
      await tx.insert(users).values({ id, email, passwordHash, preferredLocale: locale });
      await tx.insert(verificationChallenges).values({ id: randomUUID(), userId: id, purpose: "email_verification", tokenHash: verification.hash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
      await sendVerificationEmail(email, verification.token, locale, id, tx);
    });
  } catch (error) {
    const detail = typeof error === "object" && error !== null && "cause" in error ? error.cause : error;
    if (typeof detail === "object" && detail !== null && "code" in detail && detail.code === "ER_DUP_ENTRY") return NextResponse.json({ status: "verification_sent" }, { status: 202 });
    return serviceUnavailable();
  }
  return NextResponse.json({ status: "verification_sent" }, { status: 202 });
}
