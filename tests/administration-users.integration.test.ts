import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const testUrl = process.env.TEST_DATABASE_URL; if (testUrl) process.env.DATABASE_URL = testUrl;
const run = testUrl ? test : test.skip; let closePool: (() => Promise<void>) | null = null;
after(async () => { await closePool?.(); });
run('MariaDB user administration restricts metadata, revokes sessions and preserves the last active administrator under concurrency', async () => {
  const { database } = await import('../src/platform/database/client'); const db = database!; closePool = () => db.$client.end();
  const { and, eq, inArray } = await import('drizzle-orm');
  const { users, sessions, personProfiles } = await import('../src/platform/database/schema');
  const { systemAuditEvents, systemSettings } = await import('../src/modules/administration/db-schema');
  const { identityAuditEvents } = await import('../src/modules/identity/advanced-schema');
  const { listManagedUsers, changeManagedUserAccess, ensureAdminDeletionAllowed } = await import('../src/modules/administration/users');
  const existingAdmins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), eq(users.status, 'active')));
  assert.equal(existingAdmins.length, 0, 'Use an isolated test database without pre-existing active administrators.');
  const [settingsBefore] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'global')).limit(1);
  const alice = randomUUID(); const bob = randomUUID(); const pending = randomUUID(); const ids = [alice, bob, pending]; const profileId = randomUUID(); const sessionId = randomUUID();
  await db.insert(users).values(ids.map((id, index) => ({ id, email: `${id}@example.test`, passwordHash: 'fictive-private-hash', role: index === 0 ? 'admin' as const : 'user' as const, status: index === 2 ? 'pending_verification' as const : 'active' as const, emailVerifiedAt: index === 2 ? null : new Date() })));
  await db.insert(personProfiles).values({ id: profileId, ownerUserId: bob, relationship: 'self', authorizationBasis: 'self', authorizationConfirmedAt: new Date(), dataCiphertext: 'private-profile-fixture-not-for-admin-list', encryptionKeyVersion: 'v1' });
  await db.insert(sessions).values({ id: sessionId, userId: bob, tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'), expiresAt: new Date(Date.now() + 60_000) });
  try {
    await assert.rejects(listManagedUsers(bob), /FORBIDDEN/);
    await assert.rejects(changeManagedUserAccess(bob, alice, { expectedRole: 'admin', expectedStatus: 'active', role: 'user', status: 'active' }), /FORBIDDEN/);
    const list = await listManagedUsers(alice); const row = list.find(value => value.id === bob)!;
    assert.deepEqual(Object.keys(row).sort(), ['email', 'emailVerifiedAt', 'id', 'role', 'status']);
    assert.equal(JSON.stringify(list).includes('fictive-private-hash'), false); assert.equal(JSON.stringify(list).includes('private-profile-fixture'), false);
    await assert.rejects(changeManagedUserAccess(alice, alice, { expectedRole: 'admin', expectedStatus: 'active', role: 'admin', status: 'suspended' }), /SELF_SUSPENSION_FORBIDDEN/);
    await assert.rejects(changeManagedUserAccess(alice, alice, { expectedRole: 'admin', expectedStatus: 'active', role: 'user', status: 'active' }), /LAST_ACTIVE_ADMIN/);
    await assert.rejects(db.transaction(tx => ensureAdminDeletionAllowed(tx, alice)), /LAST_ACTIVE_ADMIN/);
    await assert.rejects(changeManagedUserAccess(alice, pending, { expectedRole: 'user', expectedStatus: 'pending_verification', role: 'user', status: 'active' }), /EMAIL_NOT_VERIFIED/);
    await changeManagedUserAccess(alice, bob, { expectedRole: 'user', expectedStatus: 'active', role: 'user', status: 'suspended' });
    const [suspended] = await db.select().from(users).where(eq(users.id, bob)); assert.equal(suspended.status, 'suspended');
    await changeManagedUserAccess(alice, bob, { expectedRole: 'user', expectedStatus: 'suspended', role: 'user', status: 'active' });
    await changeManagedUserAccess(alice, bob, { expectedRole: 'user', expectedStatus: 'active', role: 'admin', status: 'active' });
    const [revoked] = await db.select().from(sessions).where(eq(sessions.id, sessionId)); assert.ok(revoked.revokedAt);
    await assert.rejects(changeManagedUserAccess(alice, bob, { expectedRole: 'user', expectedStatus: 'active', role: 'moderator', status: 'active' }), /CONFLICT/);
    const audit = await db.select().from(systemAuditEvents).where(and(eq(systemAuditEvents.actorUserId, alice), eq(systemAuditEvents.action, 'user_changed'))); assert.equal(audit.length, 3);
    const detail = await db.select().from(identityAuditEvents).where(inArray(identityAuditEvents.id, audit.map(value => value.id))); assert.equal(detail.some(value => value.event === 'admin_role_user_to_admin'), true);
    const outcomes = await Promise.allSettled([
      changeManagedUserAccess(alice, bob, { expectedRole: 'admin', expectedStatus: 'active', role: 'user', status: 'active' }),
      changeManagedUserAccess(bob, alice, { expectedRole: 'admin', expectedStatus: 'active', role: 'user', status: 'active' }),
    ]);
    assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
    assert.equal((await db.select().from(users).where(and(eq(users.role, 'admin'), eq(users.status, 'active')))).length, 1);
  } finally {
    await db.delete(systemAuditEvents).where(inArray(systemAuditEvents.actorUserId, ids));
    await db.delete(users).where(inArray(users.id, ids));
    if (!settingsBefore) await db.delete(systemSettings).where(eq(systemSettings.key, 'global'));
  }
});
