import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { database } from '@/platform/database/client';
import { sessions, users } from '@/platform/database/schema';
import { identityAuditEvents } from '@/modules/identity/advanced-schema';
import { defaultSettings } from './schema';
import { systemSettings, systemAuditEvents } from './db-schema';
import type { JobTransaction } from '@/platform/jobs/queue';
import { userAccessSchema, validateUserAccessChange } from './user-policy';
import type { z } from 'zod';
function db() { if (!database) throw new Error('UNAVAILABLE'); return database; }
export async function lockAdministratorChanges(tx: JobTransaction) {
  await tx.insert(systemSettings).values({ key: 'global', revision: 1, values: defaultSettings }).onDuplicateKeyUpdate({ set: { key: 'global' } });
  await tx.select({ key: systemSettings.key }).from(systemSettings).where(eq(systemSettings.key, 'global')).limit(1).for('update');
}
/** Call before locking/deleting the account row, in the same transaction. */
export async function ensureAdminDeletionAllowed(tx: JobTransaction, userId: string) {
  await lockAdministratorChanges(tx);
  const [target] = await tx.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, userId)).limit(1).for('update');
  if (target?.role === 'admin' && target.status === 'active') {
    const administrators = await tx.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), eq(users.status, 'active'))).for('update');
    if (administrators.length <= 1) throw new Error('LAST_ACTIVE_ADMIN');
  }
}
export async function listManagedUsers(actorId: string, beforeId?: string) {
  const store = db(); const [actor] = await store.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, actorId)).limit(1);
  if (actor?.role !== 'admin' || actor.status !== 'active') throw new Error('FORBIDDEN');
  // Deliberate allowlist: no hashes, profiles, documents, factor secrets or session tokens.
  return store.select({ id: users.id, email: users.email, role: users.role, status: users.status, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(beforeId ? lt(users.id, beforeId) : undefined).orderBy(desc(users.id)).limit(100);
}
export async function changeManagedUserAccess(actorId: string, targetId: string, value: z.infer<typeof userAccessSchema>) {
  const input = userAccessSchema.parse(value); const store = db();
  return store.transaction(async tx => {
    // All role/status writers serialize here before locking users. Prevents two admins demoting each other concurrently.
    await lockAdministratorChanges(tx);
    const [actor] = await tx.select({ id: users.id, role: users.role, status: users.status }).from(users).where(eq(users.id, actorId)).limit(1).for('update');
    if (actor?.role !== 'admin' || actor.status !== 'active') throw new Error('FORBIDDEN');
    const [target] = await tx.select({ id: users.id, role: users.role, status: users.status, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, targetId)).limit(1).for('update');
    if (!target) throw new Error('NOT_FOUND');
    if (target.role !== input.expectedRole || target.status !== input.expectedStatus) throw new Error('CONFLICT');
    if (target.role === input.role && target.status === input.status) return { changed: false, sessionsRevoked: false };
    const activeAdmins = await tx.select({ id: users.id }).from(users).where(and(eq(users.role, 'admin'), eq(users.status, 'active'))).for('update');
    const refusal = validateUserAccessChange(actorId, target, input, activeAdmins.length); if (refusal) throw new Error(refusal);
    await tx.update(users).set({ role: input.role, status: input.status, updatedAt: new Date() }).where(and(eq(users.id, targetId), eq(users.role, input.expectedRole), eq(users.status, input.expectedStatus)));
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, targetId), isNull(sessions.revokedAt)));
    const events: string[] = [];
    if (target.role !== input.role) events.push(`admin_role_${target.role}_to_${input.role}`);
    if (target.status !== input.status) events.push(`admin_status_${target.status}_to_${input.status}`);
    for (const event of events) {
      const id = randomUUID();
      // Shared ID correlates the actor in the system audit with the target + non-PII access change in identity audit.
      await tx.insert(systemAuditEvents).values({ id, actorUserId: actorId, action: 'user_changed', resourceId: targetId, revision: 1 });
      await tx.insert(identityAuditEvents).values({ id, userId: targetId, event });
    }
    return { changed: true, sessionsRevoked: true };
  });
}
