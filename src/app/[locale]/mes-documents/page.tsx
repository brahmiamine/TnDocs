import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { LogoutButton } from "@/modules/identity/LogoutButton";
import { DocumentsDashboard } from "./dashboard";

export default async function DocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/connexion`);
  const isArabic = locale === "ar";
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><div className="user-actions"><Link className="profile-nav-link" href={`/${locale}/profils`}>{isArabic ? "ملفاتي الشخصية" : "Mes profils"}</Link><Link className="profile-nav-link" href={`/${locale}/dossiers`}>{isArabic ? "ملفاتي الإدارية" : "Mes dossiers"}</Link><span className="user-email">{user.email}</span><LogoutButton locale={locale} /></div></div></header><section className="section"><div className="container"><div className="section-heading"><div className="eyebrow">{isArabic ? "مساحتك" : "VOTRE ESPACE"}</div><h1>{isArabic ? "وثائقي" : "Mes documents"}</h1><p>{isArabic ? "مسوداتك المحفوظة في مساحة خاصة ومشفرة." : "Vos brouillons sont enregistrés dans votre espace privé et chiffré."}</p><div className="data-export-links"><Link className="text-link" href="/api/v1/me/data-export">{isArabic ? "تنزيل بياناتي (JSON)" : "Télécharger mes données (JSON)"}</Link><Link className="text-link" href="/api/v1/me/data-export/archive">{isArabic ? "تنزيل بياناتي ومرفقاتي (ZIP)" : "Télécharger mes données et pièces (ZIP)"}</Link></div></div><DocumentsDashboard locale={locale} /></div></section></main>;
}
