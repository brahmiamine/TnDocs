import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/identity/service";
import { ProfileManager } from "@/modules/profiles/ProfileManager";
import { AccountDeletionForm } from "@/modules/identity/AccountDeletionForm";

export default async function ProfilesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/connexion`);
  const isArabic = locale === "ar";
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><Link className="text-link" href={`/${locale}/mes-documents`}>{isArabic ? "وثائقي" : "Mes documents"}</Link></div></header><section className="section"><div className="container"><div className="section-heading"><div className="eyebrow">{isArabic ? "مساحتك الشخصية" : "VOTRE ESPACE PERSONNEL"}</div><h1>{isArabic ? "ملفات الأشخاص" : "Profils personnels"}</h1><p>{isArabic ? "احفظ معلوماتك لاستخدامها عند إعداد الوثائق. أضف بيانات شخص آخر فقط إذا كان لديك إذن مناسب." : "Enregistrez vos informations pour préparer vos documents. Ajoutez celles d’un proche seulement avec une autorisation ou une base légale appropriée."}</p></div><ProfileManager locale={locale} /><AccountDeletionForm locale={locale} /></div></section></main>;
}
