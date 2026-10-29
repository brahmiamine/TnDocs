import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/platform/config/env";
export const oauthCookieName = process.env.NODE_ENV === "production" ? "__Host-tndocs_oauth" : "tndocs_oauth";
export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: new URL("/api/v1/auth/google/callback", env.APP_URL).toString() };
}
export function oauthStateMatches(state: string | null, browserState: string | undefined) {
  if (!state || !browserState || !/^[A-Za-z0-9_-]{32,128}$/.test(state) || state.length !== browserState.length) return false;
  return timingSafeEqual(Buffer.from(state), Buffer.from(browserState));
}
export function pkceChallenge(verifier: string) { return createHash("sha256").update(verifier).digest("base64url"); }
export function oauthStateCookie(value: string, clear = false) {
  return `${oauthCookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 600}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function googleAuthorizationUrl(state: string, verifier: string, config: NonNullable<ReturnType<typeof googleConfig>>) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const params = { client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: "openid email", state, code_challenge: pkceChallenge(verifier), code_challenge_method: "S256", prompt: "select_account" };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value)); return url;
}
export async function googleVerifiedIdentity(code: string, verifier: string) {
  const config = googleConfig(); if (!config) throw new Error("Google OAuth unavailable");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code", code_verifier: verifier }), signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!response.ok) throw new Error("OAuth token exchange failed");
  const token: unknown = await response.json();
  if (!token || typeof token !== "object" || !("access_token" in token) || typeof token.access_token !== "string") throw new Error("Invalid OAuth response");
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!info.ok) throw new Error("OAuth userinfo failed");
  const user = z.object({ sub: z.string().min(1).max(255), email: z.string().email().max(320), email_verified: z.literal(true) }).safeParse(await info.json());
  if (!user.success) throw new Error("Verified email required");
  return { subject: user.data.sub, email: user.data.email.toLowerCase() };
}
