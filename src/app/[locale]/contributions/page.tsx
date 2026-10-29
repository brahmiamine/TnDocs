import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/modules/identity/service';
import { PageShell } from '@/modules/community/PageShell';
import { SubmissionPanel } from '@/modules/community/SubmissionPanel';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function ContributionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== 'fr' && locale !== 'ar') notFound();
  if (!await getCurrentUser()) redirect(`/${locale}/connexion?next=${encodeURIComponent(`/${locale}/contributions`)}`);
  return <PageShell locale={locale} title={locale === 'ar' ? 'اقتراح نموذج أو بلاغ' : 'Contributions et signalements'}><SubmissionPanel locale={locale} /></PageShell>;
}
