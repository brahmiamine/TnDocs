import Link from "next/link";
import { notFound } from "next/navigation";

export default async function CataloguePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const isArabic = locale === "ar";

  return (
    <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}>
      <header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><Link className="locale-switch" href={isArabic ? "/fr/catalogue" : "/ar/catalogue"}>{isArabic ? "Français" : "العربية"}</Link></div></header>
      <section className="section"><div className="container"><div className="section-heading"><div className="eyebrow">{isArabic ? "المكتبة" : "LE CATALOGUE"}</div><h1>{isArabic ? "نماذج وإجراءات" : "Modèles et démarches"}</h1><p>{isArabic ? "نعمل على إعداد مكتبة من النماذج التي تم التحقق منها. ستجد هنا فقط المحتوى الذي تمت مراجعته ومصادره." : "Le catalogue se construit avec des modèles vérifiés et des sources consultables. Aucun document n’est publié avant d’avoir été revu."}</p></div><div className="cta-panel"><div><h2>{isArabic ? "المكتبة قيد الإعداد" : "Le catalogue est en préparation"}</h2><p>{isArabic ? "ستكون النماذج الأولى مرتبطة بمصادر رسمية تمت مراجعتها." : "Les premiers modèles seront ajoutés après vérification des sources officielles et des droits de réutilisation."}</p></div><Link className="button" href={`/${locale}`}>{isArabic ? "العودة إلى الرئيسية" : "Retour à l’accueil"}</Link></div></div></section>
    </main>
  );
}
