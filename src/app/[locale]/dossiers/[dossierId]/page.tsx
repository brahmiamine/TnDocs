import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { DossierDetail } from "./detail";

export const dynamic = "force-dynamic";

export default async function DossierPage({ params }: { params: Promise<{ locale: string; dossierId: string }> }) {
  const { locale, dossierId } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  if (!await getCurrentUser()) redirect(`/${locale}/connexion`);
  const isArabic = locale === "ar";
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><Link className="profile-nav-link" href={`/${locale}/dossiers`}>{isArabic ? "ملفاتي" : "Mes dossiers"}</Link></div></header><section className="section"><div className="container"><DossierDetail locale={locale} dossierId={dossierId} /></div></section></main>;
}
