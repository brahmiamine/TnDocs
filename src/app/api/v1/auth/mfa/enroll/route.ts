import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { getSessionUser } from "@/modules/identity/service";
import { requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { userSecondFactors, identityAuditEvents } from "@/modules/identity/advanced-schema";
import { encryptTotpSecret, newTotpSecret } from "@/modules/identity/totp";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  if (!database) return serviceUnavailable();
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (user.mfaEnabled) return NextResponse.json({ code: "MFA_ALREADY_ENABLED" }, { status: 409 });
  if (Date.now() - user.sessionCreatedAt.getTime() > 10 * 60_000) return NextResponse.json({ code: "REAUTHENTICATION_REQUIRED" }, { status: 403 });
  try {
    const secret = newTotpSecret();
    const secretCiphertext = encryptTotpSecret(user.id, secret);
    await database.transaction(async tx => {
      // The user row serializes enrollment with enabling/replacing another pending secret.
      const { users } = await import("@/platform/database/schema");
      await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
      const [current] = await tx.select().from(userSecondFactors).where(eq(userSecondFactors.userId, user.id)).for("update").limit(1);
      if (current?.enabledAt) throw new Error("Already enabled");
      await tx.insert(userSecondFactors).values({ userId: user.id, secretCiphertext }).onDuplicateKeyUpdate({ set: { secretCiphertext, lastUsedStep: -1 } });
      await tx.insert(identityAuditEvents).values({ id: randomUUID(), userId: user.id, event: "mfa_enrollment_started" });
    });
    const uri = new URL(`otpauth://totp/${encodeURIComponent(`TnDocs:${user.email}`)}`);
    uri.searchParams.set("secret", secret); uri.searchParams.set("issuer", "TnDocs"); uri.searchParams.set("algorithm", "SHA1"); uri.searchParams.set("digits", "6"); uri.searchParams.set("period", "30");
    return NextResponse.json({ secret, uri: uri.toString() }, { headers: { "Cache-Control": "no-store" } });
  } catch { return serviceUnavailable(); }
}
