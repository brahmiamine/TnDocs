import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageShell } from '@/modules/community/PageShell';
import { legalDocuments } from '@/modules/community/legal';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function InformationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (locale !== 'fr' && locale !== 'ar') notFound();
  return <PageShell locale={locale} title={locale === 'ar' ? 'المعلومات والشفافية' : 'Informations et transparence'}><p role="note">{locale === 'ar' ? 'هذه مسودات تقنية وليست نصوصًا قانونية معتمدة. يجب استكمالها والتحقق منها قبل الافتتاح العام.' : 'Ces textes sont des projets techniques, pas des textes juridiques validés. Ils doivent être complétés et revus avant ouverture publique.'}</p><ul>{Object.entries(legalDocuments).map(([slug, document]) => <li key={slug}><Link href={`/${locale}/informations/${slug}`}>{document[locale].title}</Link></li>)}</ul></PageShell>;
}
