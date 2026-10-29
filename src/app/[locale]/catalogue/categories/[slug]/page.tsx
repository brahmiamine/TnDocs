import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicCategories, getPublicTemplates } from "@/modules/catalog/public";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (locale !== "fr" && locale !== "ar") return {};
  const categories = await getPublicCategories(locale);
  const category = categories.find((item) => item.slug === slug);
  if (!category) return {};
  const locales = ["fr", "ar"] as const;
  const alternateCategories = await Promise.all(locales.map((item) => getPublicCategories(item)));
  const languages: Record<string, string> = {};
  locales.forEach((item, index) => {
    if (alternateCategories[index].some((entry) => entry.slug === slug)) languages[item] = "/" + item + "/catalogue/categories/" + slug;
  });
  return {
    title: category.name,
    description: category.description || category.name,
    alternates: { canonical: "/" + locale + "/catalogue/categories/" + slug, languages },
  };
}

export default async function CatalogCategoryPage({ params }: PageProps) {
  const { locale, slug } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const isArabic = locale === "ar";
  const [categories, templates] = await Promise.all([
    getPublicCategories(locale), getPublicTemplates(locale, { category: slug, limit: 100 }),
  ]);
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}>
    <header className="topbar"><div className="container topbar-inner"><Link className="brand" href={"/" + locale}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><div className="nav-actions"><Link className="locale-switch" href={"/" + (isArabic ? "fr" : "ar") + "/catalogue/categories/" + slug}>{isArabic ? "Français" : "العربية"}</Link><Link className="login-link" href={"/" + locale + "/connexion"}>{isArabic ? "تسجيل الدخول" : "Connexion"}</Link></div></div></header>
    <section className="section"><div className="container"><Link className="back-link" href={"/" + locale + "/catalogue"}>← {isArabic ? "كل النماذج" : "Tout le catalogue"}</Link><div className="section-heading"><div className="eyebrow">{isArabic ? "تصنيف" : "CATÉGORIE"}</div><h1>{category.name}</h1><p>{category.description}</p></div>
      <nav className="catalog-categories" aria-label={isArabic ? "التصنيفات" : "Catégories"}>{categories.map((item) => <Link className={item.slug === slug ? "category-pill active" : "category-pill"} href={"/" + locale + "/catalogue/categories/" + item.slug} key={item.id}>{item.name}</Link>)}</nav>
      {templates.length === 0 ? <div className="empty-state"><h2>{isArabic ? "لا توجد نماذج منشورة في هذا التصنيف" : "Aucun modèle publié dans cette catégorie"}</h2><p>{isArabic ? "ستظهر النماذج بعد مراجعة مصادرها." : "Les modèles apparaîtront après la vérification de leurs sources."}</p></div> : <div className="template-grid">{templates.map((template) => <article className="template-card" key={template.id}><div className="eyebrow">{template.documentType === "official" ? (isArabic ? "وثيقة رسمية" : "DOCUMENT OFFICIEL") : template.documentType === "informational" ? (isArabic ? "معلومات" : "INFORMATIF") : (isArabic ? "نموذج قابل للتعديل" : "MODÈLE MODIFIABLE")}</div><h2>{template.title}</h2><p>{template.summary}</p><div className="template-card-footer"><span>{isArabic ? "المصادر" : "Sources"}: {template.sources.length}</span><Link className="text-link" href={"/" + locale + "/catalogue/" + template.id}>{isArabic ? "التفاصيل" : "Voir le modèle"} →</Link></div></article>)}</div>}
    </div></section>
  </main>;
}
