import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthForm } from "@/modules/identity/AuthForm";

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const isArabic = locale === "ar";
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><Link className="locale-switch" href={isArabic ? "/fr/inscription" : "/ar/inscription"}>{isArabic ? "Français" : "العربية"}</Link></div></header><section className="section"><div className="container auth-layout"><AuthForm locale={locale} mode="register" /><div className="auth-side"><span className="trust-icon">✓</span><h2>{isArabic ? "نحمي حسابك" : "Un compte mieux protégé"}</h2><p>{isArabic ? "نؤكد عنوان بريدك الإلكتروني قبل تفعيل الحساب." : "Votre adresse email est vérifiée avant l’activation du compte."}</p></div></div></section></main>;
}
