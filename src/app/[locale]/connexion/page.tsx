import Link from "next/link";
import { notFound } from "next/navigation";

export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const isArabic = locale === "ar";

  return (
    <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}>
      <header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><Link className="locale-switch" href={isArabic ? "/fr/connexion" : "/ar/connexion"}>{isArabic ? "Français" : "العربية"}</Link></div></header>
      <section className="section"><div className="container"><div className="cta-panel"><div><h2>{isArabic ? "المساحة الشخصية قيد التطوير" : "L’espace personnel arrive dans une prochaine étape"}</h2><p>{isArabic ? "نعمل على إعداد الحسابات وحماية معلوماتك قبل فتح هذه المساحة." : "Les comptes et la protection des informations seront mis en place avant l’ouverture de votre espace personnel."}</p></div><Link className="button" href={`/${locale}`}>{isArabic ? "العودة إلى الرئيسية" : "Retour à l’accueil"}</Link></div></div></section>
    </main>
  );
}
