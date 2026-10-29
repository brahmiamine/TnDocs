import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { LogoutButton } from "@/modules/identity/LogoutButton";

export default async function DocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/connexion`);
  const isArabic = locale === "ar";
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><div className="user-actions"><span className="user-email">{user.email}</span><LogoutButton locale={locale} /></div></div></header><section className="section"><div className="container"><div className="section-heading"><div className="eyebrow">{isArabic ? "مساحتك" : "VOTRE ESPACE"}</div><h1>{isArabic ? "وثائقي" : "Mes documents"}</h1><p>{isArabic ? "ستظهر هنا مسوداتك ووثائقك المحفوظة." : "Vos brouillons et documents enregistrés apparaîtront ici."}</p></div><div className="empty-state"><div className="category-icon">▤</div><h2>{isArabic ? "لا توجد وثائق بعد" : "Aucun document pour le moment"}</h2><p>{isArabic ? "اختر نموذجاً من المكتبة لبدء وثيقتك الأولى." : "Choisissez un modèle dans le catalogue pour commencer votre premier document."}</p><Link className="button" href={`/${locale}/catalogue`}>{isArabic ? "استكشف النماذج" : "Explorer le catalogue"}</Link></div></div></section></main>;
}
