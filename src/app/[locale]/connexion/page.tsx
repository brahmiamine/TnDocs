import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthForm } from "@/modules/identity/AuthForm";

export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const isArabic = locale === "ar";

  return (
    <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}>
      <header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><Link className="locale-switch" href={isArabic ? "/fr/connexion" : "/ar/connexion"}>{isArabic ? "Français" : "العربية"}</Link></div></header>
      <section className="section"><div className="container auth-layout"><AuthForm locale={locale} mode="login" /><div className="auth-side"><span className="trust-icon">✓</span><h2>{isArabic ? "حسابك، معلوماتك" : "Votre compte, vos informations"}</h2><p>{isArabic ? "لن يتم حفظ بياناتك الشخصية قبل تسجيل الدخول." : "Vos informations personnelles ne sont accessibles qu’après connexion."}</p></div></div></section>
    </main>
  );
}
