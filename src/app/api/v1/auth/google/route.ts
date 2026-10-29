import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { oauthFlows } from "@/modules/identity/advanced-schema";
import { googleAuthorizationUrl, googleConfig, oauthStateCookie } from "@/modules/identity/oauth";
import { createSecretToken } from "@/modules/identity/tokens";
import { getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
/** POST initiation prevents unsolicited account linking and login CSRF. */
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const config = googleConfig(); if (!config || !database) return serviceUnavailable();
  const url = new URL(request.url), locale = url.searchParams.get("locale") === "ar" ? "ar" : "fr";
  const link = url.searchParams.get("link") === "1";
  const user = link ? await getCurrentUser() : null;
  if (link && !user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const state = createSecretToken(), verifier = randomBytes(32).toString("base64url");
  await database.insert(oauthFlows).values({ stateHash: state.hash, verifier, locale, linkUserId: user?.id ?? null, expiresAt: new Date(Date.now() + 10 * 60_000) });
  const response = NextResponse.json({ url: googleAuthorizationUrl(state.token, verifier, config).toString() }, { headers: { "Cache-Control": "no-store" } });
  response.headers.append("Set-Cookie", oauthStateCookie(state.token)); return response;
}
