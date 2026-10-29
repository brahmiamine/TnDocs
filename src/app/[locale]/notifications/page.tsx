import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/identity/service';
import { PageShell } from '@/modules/community/PageShell';
import { NotificationCenter } from '@/modules/notifications/NotificationCenter';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== 'fr' && locale !== 'ar') notFound();
  if (!await getCurrentUser()) redirect(`/${locale}/connexion?next=${encodeURIComponent(`/${locale}/notifications`)}`);
  return <PageShell locale={locale} title={locale === 'ar' ? 'مركز الإشعارات' : 'Centre de notifications'}><NotificationCenter locale={locale} /></PageShell>;
}
