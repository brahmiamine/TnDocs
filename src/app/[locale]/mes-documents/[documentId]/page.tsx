import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { DocumentEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function PersonalDocumentPage({ params }: { params: Promise<{ locale: string; documentId: string }> }) {
  const { locale, documentId } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  if (!await getCurrentUser()) redirect(`/${locale}/connexion`);
  const isArabic = locale === "ar";
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><Link className="profile-nav-link" href={`/${locale}/mes-documents`}>{isArabic ? "وثائقي" : "Mes documents"}</Link></div></header><section className="section"><div className="container"><DocumentEditor documentId={documentId} locale={locale} /></div></section></main>;
}
