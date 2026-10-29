import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PageShell } from '@/modules/community/PageShell';
import { legalDocuments, type LegalSlug } from '@/modules/community/legal';
import { getPublishedLegal } from '@/modules/administration/service';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if ((locale !== 'fr' && locale !== 'ar') || !Object.hasOwn(legalDocuments, slug)) return { robots: { index: false, follow: false } };
  const published = await getPublishedLegal(slug as LegalSlug, locale);
  return { title: published?.title ?? legalDocuments[slug as LegalSlug][locale].title, robots: { index: !!published, follow: !!published } };
}
export default async function LegalPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params; if ((locale !== 'fr' && locale !== 'ar') || !Object.hasOwn(legalDocuments, slug)) notFound();
  const published = await getPublishedLegal(slug as LegalSlug, locale);
  if (published) return <PageShell locale={locale} title={published.title}><p>{locale === 'ar' ? `إصدار منشور ${published.version}` : `Version publiée ${published.version}`} — <time dateTime={published.publishedAt.toISOString()}>{published.publishedAt.toLocaleDateString(locale)}</time></p><div style={{ whiteSpace: 'pre-wrap' }}>{published.body}</div></PageShell>;
  const document = legalDocuments[slug as LegalSlug][locale];
  return <PageShell locale={locale} title={document.title}><p className="official-note" role="note">{locale === 'ar' ? 'الحالة: مسودة غير معتمدة — إصدار تقني 2026-10-29. لا يكفي هذا النص لاعتبار المنصة جاهزة للنشر العام.' : 'Statut : brouillon non validé — version technique du 29 octobre 2026. Ce texte ne suffit pas à rendre la plateforme prête pour une ouverture publique.'}</p>{document.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</PageShell>;
}
