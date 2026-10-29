import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/modules/identity/service';
import { PageShell } from '@/modules/community/PageShell';
import { SubmissionPanel } from '@/modules/community/SubmissionPanel';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== 'fr' && locale !== 'ar') notFound();
  const user = await getCurrentUser();
  return <PageShell locale={locale} title={locale === 'ar' ? 'التواصل والمساعدة' : 'Contact et assistance'}>{user ? <SubmissionPanel locale={locale} support /> : <><p>{locale === 'ar' ? 'سجّل الدخول لإرسال طلب خاص ومتابعة رد الفريق. لا ترسل وثائق شخصية.' : 'Connectez-vous pour envoyer une demande privée et suivre la réponse de l’équipe. N’envoyez pas de documents personnels.'}</p><Link className="button" href={`/${locale}/connexion?next=${encodeURIComponent(`/${locale}/contact`)}`}>{locale === 'ar' ? 'تسجيل الدخول' : 'Se connecter'}</Link></>}</PageShell>;
}
