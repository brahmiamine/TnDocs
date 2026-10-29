import test from "node:test";
import assert from "node:assert/strict";
import { googleAuthorizationUrl, googleConfig, googleVerifiedIdentity, oauthStateCookie, oauthStateMatches, pkceChallenge } from "../src/modules/identity/oauth";

test("OAuth state is browser-bound and PKCE follows RFC 7636 vector", () => {
  assert.equal(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const state = "a".repeat(43);
  assert.equal(oauthStateMatches(state, state), true);
  assert.equal(oauthStateMatches(state, "b".repeat(43)), false);
  assert.equal(oauthStateMatches(state, "a"), false);
  assert.equal(oauthStateMatches(null, state), false);
  assert.equal(oauthStateMatches("é".repeat(43), "a".repeat(43)), false);
  assert.match(oauthStateCookie(state), /HttpOnly; SameSite=Lax/);
  const url = googleAuthorizationUrl(state, "verifier", { clientId: "test-client", clientSecret: "test-secret", redirectUri: "https://example.org/callback" });
  assert.equal(url.hostname, "accounts.google.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), pkceChallenge("verifier"));
  assert.equal(url.searchParams.has("client_secret"), false);
});
test("Google identity requires server code exchange and verified email, rejects malformed upstream data", async () => {
  const original = global.fetch;
  process.env.GOOGLE_CLIENT_ID = "test-client"; process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  assert.ok(googleConfig());
  let verified: unknown = true;
  global.fetch = (async (raw, init) => {
    if (String(raw).includes("/token")) {
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("client_id"), "test-client"); assert.equal(body.get("client_secret"), "test-secret"); assert.equal(body.get("code_verifier"), "verifier"); assert.equal(body.get("code"), "code");
      return Response.json({ access_token: "opaque-google-token" });
    }
    assert.equal(raw, "https://openidconnect.googleapis.com/v1/userinfo");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer opaque-google-token");
    return Response.json({ sub: "google-subject", email: "TEST@example.org", email_verified: verified });
  }) as typeof fetch;
  try {
    assert.deepEqual(await googleVerifiedIdentity("code", "verifier"), { subject: "google-subject", email: "test@example.org" });
    verified = false; await assert.rejects(googleVerifiedIdentity("code", "verifier"));
    verified = "true"; await assert.rejects(googleVerifiedIdentity("code", "verifier"));
  } finally { global.fetch = original; delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; }
});
