import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { sessions, users } from "@/platform/database/schema";
import { emailChangeChallenges, identityAuditEvents } from "@/modules/identity/advanced-schema";
import { getCurrentUser, clearSessionCookie } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { hashSecretToken } from "@/modules/identity/tokens";
const schema = z.object({ token: z.string().min(32).max(128) });
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  if (!database) return serviceUnavailable();
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const input = schema.safeParse(await readJsonBody(request)); if (!input.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  try {
    await database.transaction(async tx => {
      const [challenge] = await tx.select().from(emailChangeChallenges).where(and(eq(emailChangeChallenges.tokenHash, hashSecretToken(input.data.token)), eq(emailChangeChallenges.userId, user.id), isNull(emailChangeChallenges.usedAt), gt(emailChangeChallenges.expiresAt, new Date()))).for("update").limit(1);
      if (!challenge) throw new Error("Invalid challenge");
      const [account] = await tx.select().from(users).where(eq(users.id, user.id)).for("update").limit(1);
      if (!account || account.status !== "active") throw new Error("Account unavailable");
      await tx.update(users).set({ email: challenge.newEmail, emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
      await tx.update(emailChangeChallenges).set({ usedAt: new Date() }).where(and(eq(emailChangeChallenges.userId, user.id), isNull(emailChangeChallenges.usedAt)));
      await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
      await tx.insert(identityAuditEvents).values({ id: randomUUID(), userId: user.id, event: "email_changed" });
    });
    const response = NextResponse.json({ status: "email_updated_signed_out" }); clearSessionCookie(response); return response;
  } catch { return NextResponse.json({ code: "INVALID_OR_UNAVAILABLE_EMAIL", message: "Confirmation impossible / تعذر التأكيد" }, { status: 409 }); }
}
