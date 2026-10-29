import Link from "next/link";
import { notFound } from "next/navigation";
import { userHasRole } from "@/modules/identity/authorization";
import { CatalogueAdmin } from "./panel";

export const dynamic = "force-dynamic";

export default async function CatalogueAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const isArabic = locale === "ar";
  const { user } = await userHasRole("moderator");
  if (!user) return <main className="site-shell"><section className="section"><div className="container"><div className="empty-state"><h1>{isArabic ? "دخول مقيّد" : "Accès réservé"}</h1><p>{isArabic ? "هذه الصفحة مخصصة لفريق مراجعة الكتالوج." : "Cette page est réservée à l’équipe de revue du catalogue."}</p><Link className="text-link" href={`/${locale}/connexion`}>{isArabic ? "تسجيل الدخول" : "Se connecter"}</Link></div></div></section></main>;
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}>
    <header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><nav className="nav-actions"><Link className="profile-nav-link" href={`/${locale}/catalogue`}>{isArabic ? "الكتالوج العام" : "Catalogue public"}</Link><Link className="locale-switch" href={isArabic ? "/fr/admin/catalogue" : "/ar/admin/catalogue"}>{isArabic ? "Français" : "العربية"}</Link></nav></div></header>
    <section className="section"><div className="container"><div className="section-heading"><div className="eyebrow">{isArabic ? "إدارة المحتوى" : "ESPACE ÉDITORIAL"}</div><h1>{isArabic ? "مراجعة الكتالوج" : "Administration du catalogue"}</h1><p>{isArabic ? "أنشئ مسودات وراجع المصادر قبل النشر." : "Créez des brouillons et vérifiez les sources avant publication."}</p></div><CatalogueAdmin locale={locale} isAdmin={user.role === "admin"} /></div></section>
  </main>;
}
