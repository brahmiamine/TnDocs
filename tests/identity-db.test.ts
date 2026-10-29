import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(url && /\/tndocs_verify\w*(?:\?|$)/.test(url));
test("MariaDB: magic links and MFA codes are consumed once under concurrent requests", { skip: !enabled }, async () => {
  process.env.DATABASE_URL = url;
  const appUrl=process.env.APP_URL ?? "http://localhost:3000";
  process.env.IDENTITY_ENCRYPTION_KEY_V1 = Buffer.alloc(32, 27).toString("base64");
  const [{ database }, schema, advanced, tokens, totp, { verifySecondFactor }, { POST }] = await Promise.all([
    import("../src/platform/database/client"), import("../src/platform/database/schema"), import("../src/modules/identity/advanced-schema"), import("../src/modules/identity/tokens"), import("../src/modules/identity/totp"), import("../src/modules/identity/mfa"), import("../src/app/api/v1/auth/magic-link/consume/route"),
  ]);
  const { eq, and } = await import("drizzle-orm");
  assert.ok(database);
  const userId = randomUUID(), sessionA = randomUUID(), sessionB = randomUUID(), secret = totp.newTotpSecret();
  try {
    await database.insert(schema.users).values({ id: userId, email: `${userId}@identity.example.test`, passwordHash: "unusable-test-password", status: "active", emailVerifiedAt: new Date() });
    const link = tokens.createSecretToken();
    await database.insert(schema.verificationChallenges).values({ id: randomUUID(), userId, purpose: "magic_link", tokenHash: link.hash, expiresAt: new Date(Date.now() + 60_000) });
    const request = () => new Request(`${appUrl}/api/v1/auth/magic-link/consume`, { method: "POST", headers: { Origin: appUrl, "Content-Type": "application/json", "x-forwarded-for": userId }, body: JSON.stringify({ token: link.token }) });
    const responses = await Promise.all([POST(request()), POST(request())]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
    const authenticated = responses.find(response => response.status === 200)!;
    assert.match(authenticated.headers.get("set-cookie") ?? "", /HttpOnly; SameSite=Strict/);
    const createdSessions = await database.select().from(schema.sessions).where(eq(schema.sessions.userId, userId));
    assert.equal(createdSessions.length, 1);
    assert.equal(createdSessions[0].tokenHash.length, 64);
    await database.insert(schema.sessions).values([sessionA, sessionB].map(id => ({ id, userId, tokenHash: tokens.createSecretToken().hash, expiresAt: new Date(Date.now() + 60_000) })));
    await database.insert(advanced.userSecondFactors).values({ userId, secretCiphertext: totp.encryptTotpSecret(userId, secret), enabledAt: new Date() });
    const step = Math.floor(Date.now() / 30_000), code = totp.totpCode(secret, step);
    const attempts = await Promise.all([verifySecondFactor(userId, sessionA, code), verifySecondFactor(userId, sessionB, code)]);
    assert.equal(attempts.filter(result => result.verified).length, 1);
    const factors = await database.select().from(advanced.sessionFactors).where(and(eq(advanced.sessionFactors.sessionId, sessionA)));
    const other = await database.select().from(advanced.sessionFactors).where(eq(advanced.sessionFactors.sessionId, sessionB));
    assert.equal(factors.length + other.length, 1);
    const recovery = totp.newRecoveryCodes()[0];
    await database.insert(advanced.recoveryCodes).values({ userId, codeHash: totp.recoveryCodeHash(userId, recovery) });
    const recoveries = await Promise.all([verifySecondFactor(userId, sessionA, recovery), verifySecondFactor(userId, sessionB, recovery)]);
    assert.equal(recoveries.filter(result => result.verified).length, 1);
    const protectedLink = tokens.createSecretToken();
    await database.insert(schema.verificationChallenges).values({ id: randomUUID(), userId, purpose: "magic_link", tokenHash: protectedLink.hash, expiresAt: new Date(Date.now() + 60_000) });
    const protectedResponse = await POST(new Request(`${appUrl}/api/v1/auth/magic-link/consume`, { method: "POST", headers: { Origin: appUrl, "Content-Type": "application/json", "x-forwarded-for": userId }, body: JSON.stringify({ token: protectedLink.token }) }));
    assert.equal(protectedResponse.status, 200);
    assert.equal((await protectedResponse.json()).status, "mfa_required");
    const { jobs } = await import("../src/platform/jobs/schema");
    const { sendMagicLinkEmail, performIdentityMail } = await import("../src/modules/identity/mailer");
    const mailToken = tokens.createSecretToken();
    await database.transaction(async tx => {
      await tx.insert(schema.verificationChallenges).values({ id: randomUUID(), userId, purpose: "magic_link", tokenHash: mailToken.hash, expiresAt: new Date(Date.now() + 60_000) });
      await sendMagicLinkEmail(`${userId}@identity.example.test`, mailToken.token, "fr", userId, tx);
    });
    const [queued] = await database.select().from(jobs).where(eq(jobs.deduplicationKey, `identity-mail:magic_link:${mailToken.hash}`));
    assert.equal(queued.status, "pending");
    assert.equal(JSON.stringify(queued.payload).includes(mailToken.token), false);
    assert.equal(JSON.stringify(queued.payload).includes(`${userId}@identity.example.test`), false);
    let sends = 0;
    const simulatedOutage = async () => { sends++; throw new Error("SMTP_SIMULATED_OUTAGE"); };
    await assert.rejects(performIdentityMail(queued, simulatedOutage), /SMTP_SIMULATED_OUTAGE/);
    assert.equal(sends, 1);
    const [retryable] = await database.select().from(jobs).where(eq(jobs.id, queued.id));
    assert.equal(retryable.status, "pending");
    await database.update(schema.verificationChallenges).set({ usedAt: new Date() }).where(eq(schema.verificationChallenges.tokenHash, mailToken.hash));
    assert.deepEqual(await performIdentityMail(queued, simulatedOutage), { skipped: true });
    assert.equal(sends, 1);
    const rolledBack = tokens.createSecretToken();
    await assert.rejects(database.transaction(async tx => { await sendMagicLinkEmail(`${userId}@identity.example.test`, rolledBack.token, "fr", userId, tx); throw new Error("ROLLBACK_FIXTURE"); }), /ROLLBACK_FIXTURE/);
    const rolledBackJobs = await database.select().from(jobs).where(eq(jobs.deduplicationKey, `identity-mail:magic_link:${rolledBack.hash}`));
    assert.equal(rolledBackJobs.length, 0);
    const { POST: verifyEmail } = await import("../src/app/api/v1/auth/verify-email/route");
    const activation = tokens.createSecretToken();
    await database.insert(schema.verificationChallenges).values({ id: randomUUID(), userId, purpose: "email_verification", tokenHash: activation.hash, expiresAt: new Date(Date.now() + 60_000) });
    await database.update(schema.users).set({ status: "suspended" }).where(eq(schema.users.id, userId));
    const suspended = await verifyEmail(new Request(`${appUrl}/api/v1/auth/verify-email`, { method: "POST", headers: { Origin: appUrl, "Content-Type": "application/json", "x-forwarded-for": userId }, body: JSON.stringify({ token: activation.token }) }));
    assert.equal(suspended.status, 409);
    const [account] = await database.select().from(schema.users).where(eq(schema.users.id, userId));
    assert.equal(account.status, "suspended");
  } finally {
    await database.delete(schema.loginAttemptLimits).where(eq(schema.loginAttemptLimits.keyHash, tokens.hashSecretToken(`magic-consume:${userId}`)));
    await database.delete(schema.loginAttemptLimits).where(eq(schema.loginAttemptLimits.keyHash, tokens.hashSecretToken(`email-verification\0${userId}`)));
    const { jobs: cleanupJobs } = await import("../src/platform/jobs/schema");
    await database.delete(cleanupJobs).where(eq(cleanupJobs.ownerUserId, userId));
    await database.delete(schema.users).where(eq(schema.users.id, userId));
    const pool = (database as unknown as { $client: { end(): Promise<void> } }).$client;
    await pool.end();
  }
});
