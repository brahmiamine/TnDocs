import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { LogoutButton } from "@/modules/identity/LogoutButton";
import { DossiersDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default async function DossiersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/connexion`);
  const isArabic = locale === "ar";
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><nav className="user-actions"><Link className="profile-nav-link" href={`/${locale}/mes-documents`}>{isArabic ? "وثائقي" : "Mes documents"}</Link><span className="user-email">{user.email}</span><LogoutButton locale={locale} /></nav></div></header><section className="section"><div className="container"><div className="section-heading"><div className="eyebrow">{isArabic ? "ملفات خاصة" : "DOSSIERS PRIVÉS"}</div><h1>{isArabic ? "ملفاتي الإدارية" : "Mes dossiers"}</h1><p>{isArabic ? "نظّم وثائقك وتابع قائمة المستندات المطلوبة." : "Regroupez vos documents et suivez une checklist personnalisée."}</p></div><DossiersDashboard locale={locale} /></div></section></main>;
}
