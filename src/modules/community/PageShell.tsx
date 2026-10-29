import Link from 'next/link';
export function PageShell({ locale, title, children }: { locale: 'fr' | 'ar'; title: string; children: React.ReactNode }) {
  return <main className="site-shell"><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}>TnDocs</Link><nav className="nav-actions" aria-label={locale === 'ar' ? 'التنقل' : 'Navigation'}><Link href={`/${locale}/catalogue`}>{locale === 'ar' ? 'الكتالوج' : 'Catalogue'}</Link><Link href={`/${locale}/aide`}>{locale === 'ar' ? 'المساعدة' : 'Aide'}</Link><Link href={`/${locale}/contact`}>{locale === 'ar' ? 'اتصل بنا' : 'Contact'}</Link></nav></div></header><section className="section"><div className="container"><h1>{title}</h1>{children}</div></section></main>;
}
