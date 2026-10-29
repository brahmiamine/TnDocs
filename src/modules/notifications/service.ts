import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { database } from '@/platform/database/client';
import { users } from '@/platform/database/schema';
import { hashSecretToken } from '@/modules/identity/tokens';
import { encryptDocumentData, decryptDocumentData } from '@/modules/documents/crypto';
import { enqueueJob, type JobTransaction } from '@/platform/jobs/queue';
import { notifications, notificationPreferences, pushSubscriptions } from './db-schema';
import { categories, eventCategories, messageFor, safeNotificationPath, subscriptionSchema, type NotificationCategory, type NotificationEvent } from './schema';

export function defaultPreference(category: NotificationCategory) { return { category, inApp: true, email: category === 'security', push: false, pushConsent: false }; }
export async function getPreferences(ownerId: string) {
  if (!database) throw new Error('UNAVAILABLE');
  const rows = await database.select().from(notificationPreferences).where(eq(notificationPreferences.ownerUserId, ownerId));
  return categories.map(category => {
    const value = rows.find(row => row.category === category);
    return value ? { category, inApp: !!value.inApp, email: !!value.email, push: !!value.push, pushConsent: !!value.pushConsentedAt } : defaultPreference(category);
  });
}
export async function createNotification(ownerId: string, event: NotificationEvent, dedupeKey: string, resourceId?: string, transaction?: JobTransaction) {
  if (!database) throw new Error('UNAVAILABLE');
  if (!dedupeKey || dedupeKey.length > 180) throw new Error('INVALID_DEDUPE_KEY');
  const persist = async (tx: JobTransaction) => {
    const id = randomUUID();
    // Fixed event code and opaque ID only; insert + worker outbox are one transaction.
    await tx.insert(notifications).values({ id, ownerUserId: ownerId, event, dedupeKey, resourceId: resourceId ?? null }).onDuplicateKeyUpdate({ set: { dedupeKey } });
    const [row] = await tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.ownerUserId, ownerId), eq(notifications.dedupeKey, dedupeKey))).limit(1);
    for (const channel of ['push', 'email']) await enqueueJob({ kind: `notification.${channel}`, key: `notification:${channel}:${row.id}`, ownerUserId: ownerId, payload: { notificationId: row.id } }, tx);
    return row.id;
  };
  return transaction ? persist(transaction) : database.transaction(persist);
}
export async function listNotifications(ownerId: string, locale: 'fr' | 'ar') {
  if (!database) throw new Error('UNAVAILABLE');
  const preferences = await getPreferences(ownerId);
  const visibleEvents = (Object.keys(eventCategories) as NotificationEvent[]).filter(event => preferences.find(value => value.category === eventCategories[event])?.inApp);
  if (!visibleEvents.length) return [];
  const rows = await database.select().from(notifications).where(and(eq(notifications.ownerUserId, ownerId), inArray(notifications.event, visibleEvents))).orderBy(desc(notifications.createdAt)).limit(100);
  return rows.map(row => ({ id: row.id, event: row.event, readAt: row.readAt, createdAt: row.createdAt, ...messageFor(row.event, locale), href: safeNotificationPath(locale, row.event, row.resourceId) }));
}
export async function savePushSubscription(ownerId: string, value: unknown) {
  if (!database) throw new Error('UNAVAILABLE');
  const subscription = subscriptionSchema.parse(value);
  const endpointHash = hashSecretToken(subscription.endpoint);
  const digest = hashSecretToken(`push:${ownerId}:${endpointHash}`);
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const encrypted = encryptDocumentData(subscription, ownerId, `push:${id}`, 1);
  await database.insert(pushSubscriptions).values({ id, ownerUserId: ownerId, endpointHash, subscriptionCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion, consentedAt: new Date() })
    .onDuplicateKeyUpdate({ set: { subscriptionCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion, consentedAt: new Date() } });
  return id;
}
export async function notificationDeliveryContext(notificationId: string) {
  if (!database) throw new Error('UNAVAILABLE');
  const [row] = await database.select({ notification: notifications, user: { id: users.id, email: users.email, locale: users.preferredLocale, status: users.status } }).from(notifications).innerJoin(users, eq(users.id, notifications.ownerUserId)).where(eq(notifications.id, notificationId)).limit(1);
  if (!row || row.user.status !== 'active') return null;
  const preference = (await getPreferences(row.user.id)).find(value => value.category === eventCategories[row.notification.event])!;
  return { ...row, preference, message: messageFor(row.notification.event, row.user.locale), path: safeNotificationPath(row.user.locale, row.notification.event, row.notification.resourceId) };
}
export function decodeSubscription(row: typeof pushSubscriptions.$inferSelect) {
  return subscriptionSchema.parse(decryptDocumentData(row.subscriptionCiphertext, row.encryptionKeyVersion, row.ownerUserId, `push:${row.id}`, 1));
}
