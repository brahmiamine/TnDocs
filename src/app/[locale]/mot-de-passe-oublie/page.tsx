import Link from "next/link";
import { notFound } from "next/navigation";
import { PasswordResetRequestForm } from "@/modules/identity/PasswordResetForm";

export default async function ForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const isArabic = locale === "ar";
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><Link className="locale-switch" href={isArabic ? "/fr/mot-de-passe-oublie" : "/ar/mot-de-passe-oublie"}>{isArabic ? "Français" : "العربية"}</Link></div></header><section className="section"><div className="container auth-layout"><PasswordResetRequestForm locale={locale} /><div className="auth-side"><span className="trust-icon">✓</span><h2>{isArabic ? "رابط آمن" : "Un lien à usage unique"}</h2><p>{isArabic ? "تنتهي صلاحية الرابط بعد 30 دقيقة." : "Le lien envoyé expire après 30 minutes et ne peut être utilisé qu’une fois."}</p></div></div></section></main>;
}
