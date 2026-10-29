'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { categories, type NotificationCategory } from './schema';

type Preference = { category: NotificationCategory; inApp: boolean; email: boolean; push: boolean; pushConsent: boolean };
type Notice = { id: string; title: string; body: string; href: string; readAt: string | null; createdAt: string };
function applicationKey(value: string) { const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(decoded, character => character.charCodeAt(0)); }
export function NotificationCenter({ locale }: { locale: 'fr' | 'ar' }) {
  const ar = locale === 'ar'; const [notifications, setNotifications] = useState<Notice[]>([]); const [preferences, setPreferences] = useState<Preference[]>([]); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [pushEnabled, setPushEnabled] = useState(false); const [consent, setConsent] = useState(false);
  const names = ar ? { security: 'الأمان', document: 'الوثائق', catalogue: 'الكتالوج', reminder: 'التذكيرات', support: 'المساعدة والمساهمات' } : { security: 'Sécurité', document: 'Documents', catalogue: 'Catalogue', reminder: 'Rappels', support: 'Assistance et contributions' };
  async function load() {
    const response = await fetch(`/api/v1/me/notifications?locale=${locale}`, { cache: 'no-store' }); if (!response.ok) throw new Error(); const data = await response.json(); setNotifications(data.notifications); setPreferences(data.preferences);
  }
  useEffect(() => { let active = true; fetch(`/api/v1/me/notifications?locale=${locale}`, { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => { if (active) { setNotifications(data.notifications); setPreferences(data.preferences); } }).catch(() => { if (active) setMessage(ar ? 'تعذر تحميل الإشعارات.' : 'Chargement des notifications impossible.'); });
    if ('serviceWorker' in navigator && 'PushManager' in window) navigator.serviceWorker.ready.then(registration => registration.pushManager.getSubscription()).then(subscription => { if (active) setPushEnabled(!!subscription); }).catch(() => {});
    return () => { active = false; };
  }, [ar, locale]);
  async function save(preference: Preference) {
    setBusy(true); setMessage('');
    try { const response = await fetch('/api/v1/me/notifications/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...preference, pushConsent: preference.push ? consent : false }) }); if (!response.ok) throw new Error(); await load(); setMessage(ar ? 'تم حفظ التفضيلات.' : 'Préférences enregistrées.'); } catch { setMessage(ar ? 'تعذر الحفظ. وافق صراحة لتفعيل الدفع.' : 'Enregistrement impossible. Un accord explicite est requis pour le push.'); } finally { setBusy(false); }
  }
  async function markRead(id: string) { try { const response = await fetch(`/api/v1/me/notifications/${id}`, { method: 'PATCH' }); if (!response.ok) throw new Error(); await load(); } catch { setMessage(ar ? 'تعذر تحديث الإشعار.' : 'Mise à jour impossible.'); } }
  async function enablePush() {
    setBusy(true); setMessage('');
    try {
      if (!consent || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error();
      const configResponse = await fetch('/api/v1/me/notifications/push', { cache: 'no-store' }); const config = await configResponse.json(); if (!configResponse.ok || !config.configured) { setMessage(ar ? 'إشعارات الدفع غير مهيأة على الخادم.' : 'Le serveur ne dispose pas encore de la configuration push.'); return; }
      const permission = await Notification.requestPermission(); if (permission !== 'granted') { setMessage(ar ? 'لم تمنح صلاحية الإشعارات. تبقى رسائل المركز متاحة.' : 'Permission refusée. Le centre de notifications reste disponible.'); return; }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(config.publicKey) });
      const response = await fetch('/api/v1/me/notifications/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, subscription: { endpoint: subscription.endpoint, keys: subscription.toJSON().keys } }) });
      if (!response.ok) throw new Error(); setPushEnabled(true); setMessage(ar ? 'تم تسجيل الجهاز. اختر الفئات واحفظ تفضيلاتها أدناه.' : 'Appareil enregistré. Choisissez les catégories et enregistrez leurs préférences ci-dessous.');
    } catch { setMessage(ar ? 'تعذر تفعيل الدفع. تحقق من دعم المتصفح وإعداداته.' : 'Activation impossible. Vérifiez la prise en charge et les paramètres du navigateur.'); } finally { setBusy(false); }
  }
  async function disablePush() {
    setBusy(true);
    try {
      const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (!subscription) { setPushEnabled(false); setMessage(ar ? 'لا يوجد اشتراك على هذا الجهاز.' : 'Aucun abonnement sur cet appareil.'); return; }
      const response = await fetch('/api/v1/me/notifications/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      if (!response.ok) throw new Error(); await subscription?.unsubscribe(); setPushEnabled(false); setMessage(ar ? 'تم إلغاء اشتراك الدفع. يمكنك تعطيل الفئات أيضًا.' : 'Abonnement push retiré. Vous pouvez aussi désactiver les catégories.');
    } catch { setMessage(ar ? 'تعذر إلغاء الاشتراك. حاول مجددًا.' : 'Désinscription impossible. Réessayez.'); } finally { setBusy(false); }
  }
  return <div>{message && <p role="status">{message}</p>}<section className="detail-section"><h2>{ar ? 'إشعارات هذا الجهاز' : 'Notifications sur cet appareil'}</h2><p>{ar ? 'لا تتضمن الإشعارات نص الوثائق أو بيانات الهوية. قد تتطلب أجهزة iOS تثبيت التطبيق على الشاشة الرئيسية. يظل مركز الإشعارات متاحًا إذا رُفض الدفع.' : 'Les notifications ne contiennent ni texte de document ni données d’identité. Sur iOS, l’installation sur l’écran d’accueil peut être nécessaire. Le centre reste accessible si le push est refusé.'}</p><label className="consent-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />{ar ? 'أوافق على إشعارات الدفع للفئات التي أختارها.' : 'J’accepte les notifications push pour les catégories que je choisis.'}</label><p><button className="button" disabled={busy || !consent} onClick={enablePush}>{ar ? 'تفعيل الجهاز' : 'Activer cet appareil'}</button> <button className="text-link" disabled={busy} onClick={disablePush}>{ar ? 'إلغاء اشتراك الدفع' : 'Retirer l’abonnement push'}</button></p><p>{pushEnabled ? ar ? 'الجهاز مسجل في المتصفح؛ يتطلب حسابك موافقة صريحة.' : 'Le navigateur possède un abonnement ; votre compte exige un accord explicite.' : ar ? 'الجهاز غير مسجل.' : 'Cet appareil n’est pas enregistré.'}</p></section>
    <h2>{ar ? 'التفضيلات حسب الفئة' : 'Préférences par catégorie'}</h2>{categories.map(category => { const preference = preferences.find(value => value.category === category); if (!preference) return null; return <fieldset key={category} className="detail-section"><legend>{names[category]}</legend>{(['inApp', 'email', 'push'] as const).map(channel => <label key={channel} style={{ display: 'inline-flex', gap: 8, marginInlineEnd: 20 }}><input type="checkbox" disabled={category === 'security' && channel !== 'push'} checked={preference[channel]} onChange={event => setPreferences(values => values.map(value => value.category === category ? { ...value, [channel]: event.target.checked } : value))} />{channel === 'inApp' ? ar ? 'داخل التطبيق' : 'Dans l’application' : channel === 'email' ? ar ? 'البريد' : 'Email' : ar ? 'دفع' : 'Push'}</label>)}<button className="text-link" disabled={busy} onClick={() => save(preference)}>{ar ? 'حفظ' : 'Enregistrer'}</button>{category === 'security' && <p>{ar ? 'لا يمكن تعطيل إشعارات الأمان الأساسية.' : 'Les avis essentiels de sécurité restent actifs.'}</p>}</fieldset>; })}
    <h2>{ar ? 'آخر الإشعارات' : 'Dernières notifications'}</h2><button className="text-link" onClick={() => load().catch(() => setMessage(ar ? 'تعذر التحديث.' : 'Actualisation impossible.'))}>{ar ? 'تحديث' : 'Actualiser'}</button>{notifications.length === 0 && <p>{ar ? 'لا توجد إشعارات للفئات المفعلة.' : 'Aucune notification pour les catégories actives.'}</p>}{notifications.map(notice => <article className="detail-section" key={notice.id}><h3>{notice.title}</h3><p>{notice.body}</p><p><time dateTime={notice.createdAt}>{new Date(notice.createdAt).toLocaleString(locale)}</time>{!notice.readAt && <span> — {ar ? 'غير مقروء' : 'Non lu'}</span>}</p><Link href={notice.href}>{ar ? 'فتح' : 'Consulter'}</Link> {!notice.readAt && <button className="text-link" onClick={() => markRead(notice.id)}>{ar ? 'تحديد كمقروء' : 'Marquer comme lu'}</button>}</article>)}</div>;
}
