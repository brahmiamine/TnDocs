import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicTemplate } from "@/modules/catalog/public";

export const dynamic = "force-dynamic";

export default async function CatalogTemplatePage({ params }: { params: Promise<{ locale: string; templateId: string }> }) {
  const { locale, templateId } = await params;
  if (locale !== "fr" && locale !== "ar") notFound();
  const template = await getPublicTemplate(templateId, locale);
  if (!template) notFound();
  const isArabic = locale === "ar";
  const typeLabel = template.documentType === "official" ? (isArabic ? "وثيقة رسمية" : "Document officiel") : template.documentType === "informational" ? (isArabic ? "معلومات" : "Document informatif") : (isArabic ? "نموذج قابل للتعديل" : "Modèle modifiable");
  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}><header className="topbar"><div className="container topbar-inner"><Link className="brand" href={`/${locale}`}><span className="brand-mark">TN</span><span>Tn<span>Docs</span></span></Link><Link className="text-link" href={`/${locale}/catalogue`}>{isArabic ? "الكتالوج" : "Catalogue"}</Link></div></header><section className="section"><div className="container template-detail"><Link className="back-link" href={`/${locale}/catalogue`}>← {isArabic ? "العودة إلى النماذج" : "Retour au catalogue"}</Link><div className="eyebrow">{typeLabel}</div><h1>{template.title}</h1><p className="detail-summary">{template.summary}</p>{template.instructions && <section className="detail-section"><h2>{isArabic ? "خطوات التحضير" : "Instructions"}</h2><p>{template.instructions}</p></section>}{template.body && <section className="detail-section"><h2>{isArabic ? "النموذج" : "Modèle"}</h2><div className="template-body">{template.body}</div></section>}<section className="detail-section"><h2>{isArabic ? "المصادر الرسمية" : "Sources officielles"}</h2><ul className="source-list">{template.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.name}<span aria-hidden="true"> ↗</span></a><span>{source.checkedAt ? (isArabic ? `تم التحقق ${new Intl.DateTimeFormat("ar-TN").format(source.checkedAt)}` : `Vérifiée le ${new Intl.DateTimeFormat("fr-FR").format(source.checkedAt)}`) : (isArabic ? "تاريخ التحقق غير متوفر" : "Date de vérification indisponible")}</span></li>)}</ul></section>{template.documentType === "official" && <p className="official-note">{isArabic ? "للحفاظ على أصالة الوثيقة، يرجى استعمال الرابط الرسمي." : "Pour préserver l’authenticité du document officiel, utilisez le lien de la source."}</p>}</div></section></main>;
}
