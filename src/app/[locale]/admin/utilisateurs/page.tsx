import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { userHasRole } from '@/modules/identity/authorization';
import { PageShell } from '@/modules/community/PageShell';
import { UserManager } from '@/modules/administration/UserManager';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function UserAdministrationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== 'fr' && locale !== 'ar') notFound();
  const { user } = await userHasRole('admin'); if (!user) notFound();
  return <PageShell locale={locale} title={locale === 'ar' ? 'إدارة الحسابات والصلاحيات' : 'Comptes et autorisations'}><UserManager locale={locale} currentUserId={user.id} /></PageShell>;
}
