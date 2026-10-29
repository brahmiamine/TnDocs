import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) process.env.DATABASE_URL = testUrl;
process.env.DOCUMENT_ENCRYPTION_KEY_V1 ??= randomBytes(32).toString('base64');
const run = testUrl ? test : test.skip;
let closePool: (() => Promise<void>) | null = null;
after(async () => { await closePool?.(); });

run('community, settings, legal and notifications maintain real MariaDB ownership and transactional invariants', async () => {
  const { database } = await import('../src/platform/database/client');
  const db = database!; closePool = () => db.$client.end();
  const { users } = await import('../src/platform/database/schema');
  const { and, eq, inArray } = await import('drizzle-orm');
  const { systemSettings, systemAuditEvents, legalVersions, legalPublications } = await import('../src/modules/administration/db-schema');
  const { getSystemSettings, saveSystemSettings, createLegalVersion, actOnLegalVersion, getPublishedLegal } = await import('../src/modules/administration/service');
  const { createSubmission, listSubmissions, moderateSubmission, reviseSubmission } = await import('../src/modules/community/service');
  const { communitySubmissions } = await import('../src/modules/community/db-schema');
  const { createNotification, getPreferences, listNotifications } = await import('../src/modules/notifications/service');
  const { notificationPreferences, notifications } = await import('../src/modules/notifications/db-schema');
  const { jobs } = await import('../src/platform/jobs/schema');
  const alice = randomUUID(); const bob = randomUUID(); const admin = randomUUID();
  const owned = [alice, bob, admin]; const createdLegal: string[] = [];
  await db.insert(users).values(owned.map((id, index) => ({ id, email: `${id}@example.test`, passwordHash: 'integration-not-login', status: 'active' as const, role: index === 2 ? 'admin' as const : 'user' as const })));
  const originalSettings = await getSystemSettings();
  const [originalRow] = await db.select().from(systemSettings).where(eq(systemSettings.key, 'global')).limit(1);
  const [originalPublication] = await db.select().from(legalPublications).where(and(eq(legalPublications.slug, 'cookies'), eq(legalPublications.locale, 'fr'))).limit(1);
  try {
    const input = { quotaBytes: originalSettings.quotaBytes, featureFlags: originalSettings.featureFlags, donationUrl: originalSettings.donationUrl, partners: originalSettings.partners, expectedRevision: originalSettings.revision };
    await saveSystemSettings(admin, input);
    await assert.rejects(saveSystemSettings(admin, input), /CONFLICT/);
    const audits = await db.select().from(systemAuditEvents).where(and(eq(systemAuditEvents.actorUserId, admin), eq(systemAuditEvents.action, 'settings_changed')));
    assert.equal(audits.length, 1); assert.equal((await getSystemSettings()).revision, originalSettings.revision + 1);

    const id = await createLegalVersion(admin, { slug: 'cookies', locale: 'fr', title: 'Information fictive de test', body: 'Texte fictif vérifié uniquement dans la base de recette isolée.' }); createdLegal.push(id);
    const before = await getPublishedLegal('cookies', 'fr'); assert.notEqual(before?.id, id);
    await assert.rejects(actOnLegalVersion(admin, id, { action: 'publish', expectedStatus: 'draft', confirmation: true } as never));
    await actOnLegalVersion(admin, id, { action: 'review', expectedStatus: 'draft', confirmation: true });
    await assert.rejects(actOnLegalVersion(admin, id, { action: 'publish', expectedStatus: 'reviewed', confirmation: false } as never));
    await actOnLegalVersion(admin, id, { action: 'publish', expectedStatus: 'reviewed', confirmation: true });
    assert.equal((await getPublishedLegal('cookies', 'fr'))?.id, id);
    await assert.rejects(actOnLegalVersion(admin, id, { action: 'review', expectedStatus: 'draft', confirmation: true }), /CONFLICT/);

    const submissionId = await createSubmission(alice, 'proposal', 'fr', { title: 'Modèle fictif', body: 'Je demande {{objet}}, signé par {{nom}}.' });
    const bobSubmissionId = await createSubmission(bob, 'proposal', 'fr', { title: 'Autre modèle fictif', body: 'Demande générique de test.' });
    const aliceRows = await listSubmissions(alice); assert.equal(aliceRows.some(row => row.id === submissionId), true); assert.equal(aliceRows.some(row => row.id === bobSubmissionId), false);
    assert.equal((await listSubmissions(bob)).some(row => row.id === submissionId), false);
    await assert.rejects(reviseSubmission(submissionId, bob, 'proposal', { title: 'Forbidden change', body: 'Should not be saved.' }), /NOT_FOUND/);
    await moderateSubmission(submissionId, admin, 'submitted', 'triaged', 'Revue de test.');
    await assert.rejects(moderateSubmission(submissionId, admin, 'submitted', 'triaged', 'Stale update.'), /CONFLICT/);
    await moderateSubmission(submissionId, admin, 'triaged', 'revision_requested', 'Ajoutez une source publique.');
    await reviseSubmission(submissionId, alice, 'proposal', { title: 'Modèle corrigé', body: 'Texte générique corrigé pour recette.' });
    assert.equal((await listSubmissions(alice)).find(row => row.id === submissionId)?.status, 'submitted');
    const [encrypted] = await db.select().from(communitySubmissions).where(eq(communitySubmissions.id, submissionId)); assert.ok(!encrypted.contentCiphertext.includes('Texte générique'));

    const noticeId = await createNotification(alice, 'document_ready', `integration:${randomUUID()}`);
    const queued = await db.select().from(jobs).where(eq(jobs.ownerUserId, alice));
    assert.equal(queued.filter(row => row.payload.notificationId === noticeId).length, 2);
    assert.equal(queued.some(row => row.kind === 'notification.push' && row.payload.notificationId === noticeId), true);
    assert.equal((await listNotifications(bob, 'fr')).some(row => row.id === noticeId), false);
    await db.insert(notificationPreferences).values({ ownerUserId: alice, category: 'document', inApp: 0, email: 0, push: 0 });
    assert.equal((await listNotifications(alice, 'fr')).some(row => row.id === noticeId), false);
    assert.equal((await getPreferences(alice)).find(row => row.category === 'document')?.push, false);
    const prefsBefore = (await getPreferences(alice)).find(row => row.category === 'support'); assert.equal(prefsBefore?.push, false);
    assert.ok((await db.select().from(notifications).where(eq(notifications.ownerUserId, alice))).length >= 3);
  } finally {
    await db.delete(legalPublications).where(and(eq(legalPublications.slug, 'cookies'), eq(legalPublications.locale, 'fr')));
    if (originalPublication) await db.insert(legalPublications).values(originalPublication);
    if (createdLegal.length) await db.delete(legalVersions).where(inArray(legalVersions.id, createdLegal));
    await db.delete(systemAuditEvents).where(inArray(systemAuditEvents.actorUserId, owned));
    if (originalRow) await db.update(systemSettings).set({ revision: originalRow.revision, values: originalRow.values, updatedAt: originalRow.updatedAt }).where(eq(systemSettings.key, 'global'));
    else await db.delete(systemSettings).where(eq(systemSettings.key, 'global'));
    await db.delete(jobs).where(inArray(jobs.ownerUserId, owned));
    await db.delete(users).where(inArray(users.id, owned));
  }
});
