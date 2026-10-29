import { randomUUID } from 'node:crypto';
import { and, desc, eq, ne } from 'drizzle-orm';
import { database } from '@/platform/database/client';
import { decryptDocumentData, encryptDocumentData } from '@/modules/documents/crypto';
import { createNotification } from '@/modules/notifications/service';
import { communitySubmissions, communitySubmissionEvents } from './db-schema';
import { canTransition, type SubmissionStatus } from './schema';

type Content = { title: string; body: string; sourceUrl?: string };
export async function createSubmission(ownerId: string, kind: 'support' | 'template_request' | 'proposal' | 'report', locale: 'fr' | 'ar', content: Content) {
  if (!database) throw new Error('UNAVAILABLE');
  const id = randomUUID();
  const encrypted = encryptDocumentData(content, ownerId, `community:${id}`, 1);
  await database.transaction(async tx => {
    await tx.insert(communitySubmissions).values({ id, ownerUserId: ownerId, kind, locale, contentCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion, privacyConfirmedAt: new Date() });
    await tx.insert(communitySubmissionEvents).values({ id: randomUUID(), submissionId: id, actorUserId: ownerId, status: 'submitted' });
  });
  return id;
}
export async function listSubmissions(ownerId: string | null, support = false) {
  if (!database) throw new Error('UNAVAILABLE');
  const rows = await database.select().from(communitySubmissions).where(and(
    ownerId ? eq(communitySubmissions.ownerUserId, ownerId) : undefined,
    support ? eq(communitySubmissions.kind, 'support') : ne(communitySubmissions.kind, 'support'),
  )).orderBy(desc(communitySubmissions.updatedAt)).limit(100);
  const db = database;
  return Promise.all(rows.map(async row => {
    const events = await db.select().from(communitySubmissionEvents).where(eq(communitySubmissionEvents.submissionId, row.id)).orderBy(communitySubmissionEvents.createdAt);
    return {
      id: row.id, kind: row.kind, locale: row.locale, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt,
      ...decryptDocumentData<Content>(row.contentCiphertext, row.encryptionKeyVersion, row.ownerUserId, `community:${row.id}`, 1),
      events: events.map(event => ({ id: event.id, status: event.status, createdAt: event.createdAt,
        comment: event.commentCiphertext ? decryptDocumentData<string>(event.commentCiphertext, event.encryptionKeyVersion!, row.ownerUserId, `community-event:${event.id}`, 1) : null,
      })),
    };
  }));
}
export async function moderateSubmission(submissionId: string, actorId: string, expectedStatus: SubmissionStatus, status: SubmissionStatus, comment: string) {
  if (!database) throw new Error('UNAVAILABLE');
  if (!canTransition(expectedStatus, status) || status === 'submitted') throw new Error('INVALID_TRANSITION');
  await database.transaction(async tx => {
    const [row] = await tx.select().from(communitySubmissions).where(eq(communitySubmissions.id, submissionId)).limit(1).for('update');
    if (!row) throw new Error('NOT_FOUND');
    if (row.status !== expectedStatus) throw new Error('CONFLICT');
    // Acceptance is a moderation decision only. Catalogue publication has its own review gates.
    if (row.kind === 'support' && status === 'accepted') throw new Error('INVALID_TRANSITION');
    const id = randomUUID();
    const encrypted = encryptDocumentData(comment, row.ownerUserId, `community-event:${id}`, 1);
    await tx.update(communitySubmissions).set({ status, updatedAt: new Date() }).where(eq(communitySubmissions.id, submissionId));
    await tx.insert(communitySubmissionEvents).values({ id, submissionId, actorUserId: actorId, status, commentCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion });
    await createNotification(row.ownerUserId, row.kind === 'support' ? 'support_replied' : 'contribution_reviewed', `community-event:${id}`, undefined, tx);
  });
}
export async function reviseSubmission(submissionId: string, ownerId: string, kind: string, content: Content) {
  if (!database) throw new Error('UNAVAILABLE');
  await database.transaction(async tx => {
    const [row] = await tx.select().from(communitySubmissions).where(and(eq(communitySubmissions.id, submissionId), eq(communitySubmissions.ownerUserId, ownerId))).limit(1).for('update');
    if (!row || row.kind === 'support') throw new Error('NOT_FOUND');
    if (row.status !== 'revision_requested' || row.kind !== kind) throw new Error('CONFLICT');
    const encrypted = encryptDocumentData(content, ownerId, `community:${submissionId}`, 1);
    await tx.update(communitySubmissions).set({ status: 'submitted', contentCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion, updatedAt: new Date() }).where(eq(communitySubmissions.id, submissionId));
    await tx.insert(communitySubmissionEvents).values({ id: randomUUID(), submissionId, actorUserId: ownerId, status: 'submitted' });
  });
}
