import Link from "next/link";
import { notFound } from "next/navigation";
import { VerifyEmailClient } from "@/modules/identity/VerifyEmailClient";

export default async function VerifyEmailPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> }) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (locale !== "fr" && locale !== "ar") notFound();
  const isArabic = locale === "ar";
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link></div></header><section className="section"><div className="container"><VerifyEmailClient locale={locale} token={query.token} /></div></section></main>;
}
