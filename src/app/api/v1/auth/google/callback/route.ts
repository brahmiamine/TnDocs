import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/platform/config/env";
import { database } from "@/platform/database/client";
import { sessions, users } from "@/platform/database/schema";
import { oauthFlows, oauthIdentities, userSecondFactors, identityAuditEvents } from "@/modules/identity/advanced-schema";
import { googleVerifiedIdentity, oauthStateMatches, oauthCookieName, oauthStateCookie } from "@/modules/identity/oauth";
import { createSecretToken, hashSecretToken } from "@/modules/identity/tokens";
import { hashPassword } from "@/modules/identity/password";
import { sessionLifetimeSeconds, setSessionCookie } from "@/modules/identity/service";
import { mustUseMfa } from "@/modules/identity/totp";

export async function GET(request: Request) {
  let locale = "fr";
  const failure = () => { const response = NextResponse.redirect(new URL(`/${locale}/connexion?error=google`, env.APP_URL)); response.headers.append("Set-Cookie", oauthStateCookie("", true)); response.headers.set("Cache-Control", "no-store"); return response; };
  if (!database) return failure();
  const url = new URL(request.url), state = url.searchParams.get("state"), code = url.searchParams.get("code");
  const browserState = (await cookies()).get(oauthCookieName)?.value;
  if (!oauthStateMatches(state, browserState) || !code || code.length > 4096) return failure();
  try {
    // Consume the state before exchanging the code; a callback cannot be replayed.
    const flow = await database.transaction(async tx => {
      const [row] = await tx.select().from(oauthFlows).where(and(eq(oauthFlows.stateHash, hashSecretToken(state!)), isNull(oauthFlows.usedAt), gt(oauthFlows.expiresAt, new Date()))).for("update").limit(1);
      if (!row) throw new Error("Invalid OAuth flow");
      await tx.update(oauthFlows).set({ usedAt: new Date(), verifier: "consumed" }).where(eq(oauthFlows.stateHash, row.stateHash)); return row;
    });
    locale = flow.locale === "ar" ? "ar" : "fr";
    const identity = await googleVerifiedIdentity(code, flow.verifier);
    const session = createSecretToken();
    // New OAuth accounts receive an unknowable password. Password reset allows adding one.
    const generatedHash = await hashPassword(randomBytes(48).toString("base64url"));
    const result = await database.transaction(async tx => {
      const [linked] = await tx.select().from(oauthIdentities).where(and(eq(oauthIdentities.provider, "google"), eq(oauthIdentities.subject, identity.subject))).for("update").limit(1);
      let userId = linked?.userId;
      if (flow.linkUserId) {
        if (linked && linked.userId !== flow.linkUserId) throw new Error("Identity already linked");
        const [account] = await tx.select().from(users).where(eq(users.id, flow.linkUserId)).for("update").limit(1);
        if (!account || account.status !== "active") throw new Error("Account unavailable");
        if (!linked) await tx.insert(oauthIdentities).values({ provider: "google", subject: identity.subject, userId: account.id });
        userId = account.id;
      } else if (!userId) {
        const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, identity.email)).limit(1);
        // Do not auto-link by email. An existing user must link Google from their authenticated security page.
        if (existing) throw new Error("Explicit linking required");
        userId = randomUUID();
        await tx.insert(users).values({ id: userId, email: identity.email, passwordHash: generatedHash, status: "active", emailVerifiedAt: new Date(), preferredLocale: locale === "ar" ? "ar" : "fr" });
        await tx.insert(oauthIdentities).values({ provider: "google", subject: identity.subject, userId });
      }
      if (!userId) throw new Error("Account unavailable");
      const [account] = await tx.select().from(users).where(eq(users.id, userId)).for("update").limit(1);
      if (!account || account.status !== "active") throw new Error("Account unavailable");
      const [factor] = await tx.select().from(userSecondFactors).where(eq(userSecondFactors.userId, userId)).limit(1);
      await tx.insert(sessions).values({ id: randomUUID(), userId, tokenHash: session.hash, expiresAt: new Date(Date.now() + sessionLifetimeSeconds * 1000) });
      await tx.insert(identityAuditEvents).values({ id: randomUUID(), userId, event: flow.linkUserId ? "google_linked" : "google_login" });
      return { needsMfa: mustUseMfa(account.role, Boolean(factor?.enabledAt)) };
    });
    const response = NextResponse.redirect(new URL(`/${locale}/${result.needsMfa || flow.linkUserId ? "securite" : "mes-documents"}`, env.APP_URL));
    setSessionCookie(response, session.token); response.headers.append("Set-Cookie", oauthStateCookie("", true)); response.headers.set("Cache-Control", "no-store"); return response;
  } catch { return failure(); }
}
