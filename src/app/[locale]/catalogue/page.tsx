import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicCategories, getPublicTemplates } from "@/modules/catalog/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (locale === "ar") return {
    title: "النماذج والإجراءات",
    description: "تصفح النماذج التونسية المنشورة ومصادرها الرسمية بالعربية والفرنسية.",
    alternates: { canonical: "/ar/catalogue", languages: { fr: "/fr/catalogue", ar: "/ar/catalogue" } },
  };
  return {
    title: "Modèles et démarches",
    description: "Parcourez les modèles tunisiens publiés et leurs sources officielles, en français et en arabe.",
    alternates: { canonical: "/fr/catalogue", languages: { fr: "/fr/catalogue", ar: "/ar/catalogue" } },
  };
}

export default async function CataloguePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; category?: string }> }) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (locale !== "fr" && locale !== "ar") notFound();
  const isArabic = locale === "ar";
  const [categories, templates] = await Promise.all([
    getPublicCategories(locale),
    getPublicTemplates(locale, { query: query.q?.slice(0, 120), category: query.category }),
  ]);
  return (
    <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}>
      <header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><div className="nav-actions"><Link className="locale-switch" href={isArabic ? "/fr/catalogue" : "/ar/catalogue"}>{isArabic ? "Français" : "العربية"}</Link><Link className="login-link" href={`/${locale}/connexion`}>{isArabic ? "تسجيل الدخول" : "Connexion"}</Link></div></div></header>
      <section className="section"><div className="container">
        <div className="section-heading"><div className="eyebrow">{isArabic ? "المكتبة" : "LE CATALOGUE"}</div><h1>{isArabic ? "نماذج وإجراءات" : "Modèles et démarches"}</h1><p>{isArabic ? "تصفح النماذج التي تمت مراجعتها ومصادرها الرسمية." : "Parcourez les modèles publiés après revue, avec leurs sources officielles."}</p></div>
        <form className="catalog-search" action={`/${locale}/catalogue`}><label className="sr-only" htmlFor="catalog-query">{isArabic ? "ابحث في النماذج" : "Rechercher dans le catalogue"}</label><input id="catalog-query" name="q" type="search" maxLength={120} placeholder={isArabic ? "مثال: توكيل، تصريح…" : "Ex. procuration, déclaration…"} defaultValue={query.q} /><button className="button" type="submit">{isArabic ? "بحث" : "Rechercher"}</button></form>
        {categories.length > 0 && <nav className="catalog-categories" aria-label={isArabic ? "التصنيفات" : "Catégories"}><Link className={!query.category ? "category-pill active" : "category-pill"} href={`/${locale}/catalogue`}>{isArabic ? "الكل" : "Tout"}</Link>{categories.map((category) => <Link className={query.category === category.slug ? "category-pill active" : "category-pill"} href={"/" + locale + "/catalogue/categories/" + category.slug} key={category.id}>{category.name}</Link>)}</nav>}
        {templates.length === 0 ? <div className="empty-state"><div className="category-icon">▤</div><h2>{isArabic ? "لا توجد نماذج منشورة بعد" : "Aucun modèle publié pour le moment"}</h2><p>{isArabic ? "لا ننشر نموذجاً قبل مراجعة مصدره وصلاحية إعادة استعماله." : "Aucun modèle ne sera publié avant la vérification de sa source et des droits de réutilisation."}</p></div> : <div className="template-grid">{templates.map((template) => <article className="template-card" key={template.id}><div className="eyebrow">{template.documentType === "official" ? (isArabic ? "وثيقة رسمية" : "DOCUMENT OFFICIEL") : template.documentType === "informational" ? (isArabic ? "معلومات" : "INFORMATIF") : (isArabic ? "نموذج قابل للتعديل" : "MODÈLE MODIFIABLE")}</div><h2>{template.title}</h2><p>{template.summary}</p><div className="template-card-footer"><span>{isArabic ? "المصادر" : "Sources"}: {template.sources.length}</span><Link className="text-link" href={`/${locale}/catalogue/${template.id}`}>{isArabic ? "التفاصيل" : "Voir le modèle"} →</Link></div></article>)}</div>}
      </div></section>
    </main>
  );
}
