import { z } from 'zod';
export const categories = ['security', 'document', 'catalogue', 'reminder', 'support'] as const;
export type NotificationCategory = typeof categories[number];
export const eventCategories = { security_changed: 'security', document_ready: 'document', publication_updated: 'catalogue', reminder_due: 'reminder', support_replied: 'support', contribution_reviewed: 'support' } as const satisfies Record<string, NotificationCategory>;
export type NotificationEvent = keyof typeof eventCategories;
export const notificationEventSchema = z.enum(['security_changed', 'document_ready', 'publication_updated', 'reminder_due', 'support_replied', 'contribution_reviewed']);
export const preferenceSchema = z.object({ category: z.enum(categories), inApp: z.boolean(), email: z.boolean(), push: z.boolean(), pushConsent: z.boolean() }).strict().superRefine((value, ctx) => {
  if (value.push && !value.pushConsent) ctx.addIssue({ code: 'custom', path: ['pushConsent'], message: 'Explicit push consent is required.' });
  if (value.category === 'security' && (!value.inApp || !value.email)) ctx.addIssue({ code: 'custom', path: ['category'], message: 'Security notices cannot be disabled.' });
});
export function isSupportedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    return ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname) || url.hostname.endsWith('.push.apple.com') || url.hostname.endsWith('.notify.windows.com');
  } catch { return false; }
}
const base64url = (size: number) => z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/).refine(value => Buffer.from(value, 'base64url').length === size);
export const subscriptionSchema = z.object({
  endpoint: z.string().max(4096).refine(isSupportedPushEndpoint, 'Unsupported push provider.'),
  keys: z.object({ p256dh: base64url(65).refine(value => Buffer.from(value, 'base64url')[0] === 4), auth: base64url(16) }).strict(),
}).strict();
const copy = {
  security_changed: { fr: { title: 'Activité de sécurité', body: 'Consultez votre compte pour vérifier cette activité.' }, ar: { title: 'نشاط أمني', body: 'راجع حسابك للتحقق من هذا النشاط.' } },
  document_ready: { fr: { title: 'Votre document est prêt', body: 'Ouvrez votre espace privé pour le consulter.' }, ar: { title: 'وثيقتك جاهزة', body: 'افتح مساحتك الخاصة للاطلاع عليها.' } },
  publication_updated: { fr: { title: 'Mise à jour du catalogue', body: 'Une information publiée a été mise à jour.' }, ar: { title: 'تحديث الكتالوج', body: 'تم تحديث معلومة منشورة.' } },
  reminder_due: { fr: { title: 'Rappel demandé', body: 'Consultez votre espace pour vérifier votre rappel.' }, ar: { title: 'تذكير مطلوب', body: 'راجع مساحتك للاطلاع على تذكيرك.' } },
  contribution_reviewed: { fr: { title: 'Votre contribution a été examinée', body: 'Consultez le suivi de vos contributions.' }, ar: { title: 'تمت مراجعة مساهمتك', body: 'راجع متابعة مساهماتك.' } },
  support_replied: { fr: { title: 'Votre demande a été mise à jour', body: 'Consultez le suivi dans votre espace.' }, ar: { title: 'تم تحديث طلبك', body: 'راجع متابعة الطلب في مساحتك.' } },
} as const;
export function messageFor(event: NotificationEvent, locale: 'fr' | 'ar') { return copy[event][locale]; }
export function safeNotificationPath(locale: 'fr' | 'ar', event: NotificationEvent, resourceId: string | null) {
  if (event === 'document_ready' && resourceId && z.string().uuid().safeParse(resourceId).success) return `/${locale}/mes-documents/${resourceId}`;
  if (event === 'contribution_reviewed') return `/${locale}/contributions`;
  if (event === 'support_replied') return `/${locale}/contact`;
  if (event === 'publication_updated') return `/${locale}/catalogue`;
  if (event === 'security_changed') return `/${locale}/securite`;
  return `/${locale}/notifications`;
}
