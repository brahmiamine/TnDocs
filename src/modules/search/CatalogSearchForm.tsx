"use client";
import { useEffect, useState } from "react";
export function CatalogSearchForm({ locale, query, category, documentType, organizationId, categories, organizations }: { locale: "fr" | "ar"; query?: string; category?: string; documentType?: string; organizationId?: string; categories: Array<{ id: string; slug: string; name: string }>; organizations: Array<{ id: string; name: string }> }) {
  const ar = locale === "ar", [value, setValue] = useState(query ?? ""), [suggestions, setSuggestions] = useState<Array<{ id: string; title: string; contentLocale: string }>>([]);
  useEffect(() => {
    if (value.trim().length < 2) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => { const params = new URLSearchParams({ q: value.slice(0, 120), locale }); if (category) params.set("category", category); if (documentType) params.set("documentType", documentType); if (organizationId) params.set("organizationId", organizationId); fetch(`/api/v1/search/suggest?${params}`, { signal: controller.signal, cache: "no-store" }).then(async response => { if (response.ok) setSuggestions((await response.json()).suggestions); }).catch(() => undefined); }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, locale, category, documentType, organizationId]);
  return <form className="auth-form" action={`/${locale}/catalogue`}><label htmlFor="catalog-query">{ar ? "ابحث بالفرنسية أو العربية" : "Rechercher en français ou en arabe"}</label><input id="catalog-query" name="q" type="search" list="catalog-suggestions" value={value} onChange={event => setValue(event.target.value)} maxLength={120} autoComplete="off" placeholder={ar ? "مثال: توكيل، تصريح…" : "Ex. procuration, déclaration…"} /><datalist id="catalog-suggestions">{suggestions.map(row => <option key={row.id} value={row.title} label={row.contentLocale.toUpperCase()} />)}</datalist>
    <label htmlFor="catalog-category">{ar ? "التصنيف" : "Catégorie"}</label><select id="catalog-category" name="category" defaultValue={category ?? ""}><option value="">{ar ? "كل التصنيفات" : "Toutes les catégories"}</option>{categories.map(row => <option key={row.id} value={row.slug}>{row.name}</option>)}</select>
    <label htmlFor="catalog-type">{ar ? "نوع الوثيقة" : "Type de document"}</label><select id="catalog-type" name="documentType" defaultValue={documentType ?? ""}><option value="">{ar ? "كل الأنواع" : "Tous les types"}</option><option value="editable">{ar ? "نموذج قابل للتعديل" : "Modèle modifiable"}</option><option value="official">{ar ? "أصل رسمي" : "Original officiel"}</option><option value="informational">{ar ? "معلومات" : "Informatif"}</option></select>
    <label htmlFor="catalog-organization">{ar ? "الجهة" : "Organisme"}</label><select id="catalog-organization" name="organizationId" defaultValue={organizationId ?? ""}><option value="">{ar ? "كل الجهات" : "Tous les organismes"}</option>{organizations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><button className="button">{ar ? "بحث" : "Rechercher"}</button>
  </form>;
}
