import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { userHasRole } from '@/modules/identity/authorization';
import { PageShell } from '@/modules/community/PageShell';
import { SystemPanel } from '@/modules/administration/SystemPanel';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function SystemPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== 'fr' && locale !== 'ar') notFound();
  if (!(await userHasRole('admin')).user) notFound();
  return <PageShell locale={locale} title={locale === 'ar' ? 'إدارة النظام والامتثال' : 'Système et conformité'}><SystemPanel locale={locale} /></PageShell>;
}
