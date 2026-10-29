import { isFeatureEnabled } from '@/modules/administration/service';
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { and, eq } from 'drizzle-orm';
import { database } from '@/platform/database/client';
import { env } from '@/platform/config/env';
import { notifications, notificationDeliveries, pushSubscriptions } from './db-schema';
import { notificationDeliveryContext, decodeSubscription } from './service';

export function pushConfigured() { return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT); }
/** Queue worker entry: at-least-once push; browser tag coalesces retries of the same notification. */
export async function deliverWebPush(notificationId: string) {
  if (!database) throw new Error('UNAVAILABLE');
  if (!await isFeatureEnabled('push')) return { delivered: 0, skipped: true };
  const db = database; const context = await notificationDeliveryContext(notificationId);
  if (!context || !context.preference.push || !context.preference.pushConsent) return { delivered: 0, skipped: true };
  if (!pushConfigured()) throw new Error('PUSH_NOT_CONFIGURED');
  const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.ownerUserId, context.user.id));
  let delivered = 0; let failed = false;
  for (const row of subscriptions) {
    const [previous] = await db.select().from(notificationDeliveries).where(and(eq(notificationDeliveries.notificationId, notificationId), eq(notificationDeliveries.subscriptionId, row.id))).limit(1);
    if (previous) continue;
    try {
      await webpush.sendNotification(decodeSubscription(row), JSON.stringify({ title: context.message.title, body: context.message.body, url: context.path, tag: notificationId }), {
        TTL: 60 * 60, timeout: 10_000,
        vapidDetails: { subject: process.env.VAPID_SUBJECT!, publicKey: process.env.VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! },
      });
      await db.insert(notificationDeliveries).values({ notificationId, subscriptionId: row.id }).onDuplicateKeyUpdate({ set: { deliveredAt: new Date() } }); delivered++;
    } catch (error) {
      const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : null;
      if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id));
      else failed = true;
    }
  }
  if (failed) throw new Error('PUSH_TEMPORARILY_UNAVAILABLE');
  return { delivered, skipped: false };
}
/** Queue worker entry: only fixed generic notices, with a link to the authenticated app. */
export async function deliverNotificationEmail(notificationId: string) {
  if (!database) throw new Error('UNAVAILABLE');
  const context = await notificationDeliveryContext(notificationId);
  if (!context || !context.preference.email || context.notification.emailDeliveredAt) return { skipped: true };
  if (!env.SMTP_HOST) throw new Error('SMTP_NOT_CONFIGURED');
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined });
  await transport.sendMail({ from: env.SMTP_FROM, to: context.user.email, subject: context.message.title, text: `${context.message.body}\n${new URL(context.path, env.APP_URL)}`, messageId: `<tndocs-notification-${notificationId}@${new URL(env.APP_URL).hostname}>` });
  await database.update(notifications).set({ emailDeliveredAt: new Date() }).where(eq(notifications.id, notificationId));
  return { skipped: false };
}
