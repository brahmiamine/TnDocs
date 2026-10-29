import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShareViewer } from "@/modules/documents/ShareViewer";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SharedDocumentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const isArabic = locale === "ar";
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}>
    <header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><span className="eyebrow">{isArabic ? "عرض آمن" : "CONSULTATION SÉCURISÉE"}</span></div></header>
    <section className="section"><div className="container"><ShareViewer locale={locale} /></div></section>
  </main>;
}
