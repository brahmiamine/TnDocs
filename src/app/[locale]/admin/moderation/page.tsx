import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { userHasRole } from '@/modules/identity/authorization';
import { PageShell } from '@/modules/community/PageShell';
import { SubmissionPanel } from '@/modules/community/SubmissionPanel';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function ModerationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== 'fr' && locale !== 'ar') notFound();
  const { user } = await userHasRole('moderator'); if (!user) notFound();
  return <PageShell locale={locale} title={locale === 'ar' ? 'المراجعة والمساعدة' : 'Modération et assistance'}><p>{locale === 'ar' ? 'تعرض هذه الصفحة النصوص المرسلة صراحة للمراجعة فقط، ولا تمنح الوصول إلى الوثائق أو الملفات الشخصية الخاصة.' : 'Cette page montre uniquement les textes explicitement soumis à l’équipe. Elle ne donne aucun accès général aux documents ou profils privés.'}</p><SubmissionPanel locale={locale} moderation /></PageShell>;
}
