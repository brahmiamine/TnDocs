"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Translation = { locale: "fr" | "ar"; title: string; summary: string; instructions: string; body: string };
type Item = { id: string; status: string; documentType: string; latestVersion: { version: number; status: string } | null; translations: Translation[] };

const labels = {
  fr: { load: "Actualiser", reindex: "Reconstruire l’index de recherche", create: "Créer le brouillon", newVersion: "Enregistrer une nouvelle version", review: "Soumettre à la revue", publish: "Publier", loading: "Chargement…", saved: "Enregistré.", error: "Une erreur est survenue.", type: "Type", category: "Catégories (slugs séparés par des virgules)", frTitle: "Titre français", frSummary: "Résumé français", frInstructions: "Instructions en français", frBody: "Texte français", arTitle: "العنوان بالعربية", arSummary: "الملخص بالعربية", arInstructions: "التعليمات بالعربية", arBody: "النص بالعربية", content: "Contenu du document (JSON)", form: "Schéma du formulaire (JSON, facultatif)", sources: "Sources (JSON)", sourcesHint: "Renseignez uniquement des sources réellement vérifiées. Pour un document réutilisable, confirmez les droits.", status: "État", version: "Version", none: "Aucun contenu éditorial." },
  ar: { load: "تحديث", reindex: "إعادة بناء فهرس البحث", create: "إنشاء مسودة", newVersion: "حفظ نسخة جديدة", review: "إرسال للمراجعة", publish: "نشر", loading: "جارٍ التحميل…", saved: "تم الحفظ.", error: "حدث خطأ.", type: "النوع", category: "التصنيفات (معرّفات مفصولة بفواصل)", frTitle: "العنوان بالفرنسية", frSummary: "الملخص بالفرنسية", frInstructions: "التعليمات بالفرنسية", frBody: "النص بالفرنسية", arTitle: "العنوان بالعربية", arSummary: "الملخص بالعربية", arInstructions: "التعليمات بالعربية", arBody: "النص بالعربية", content: "محتوى الوثيقة (JSON)", form: "مخطط النموذج (JSON، اختياري)", sources: "المصادر (JSON)", sourcesHint: "أدخل المصادر التي تم التحقق منها فعلياً فقط، وأكد حقوق إعادة الاستخدام.", status: "الحالة", version: "النسخة", none: "لا يوجد محتوى تحريري." },
};

export function CatalogueAdmin({ locale, isAdmin }: { locale: string; isAdmin: boolean }) {
  const t = labels[locale as "fr" | "ar"];
  const [items, setItems] = useState<Item[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v1/admin/catalog/templates", { cache: "no-store" });
    if (!response.ok) throw new Error(t.error);
    setItems(await response.json() as Item[]);
  }, [t.error]);
  useEffect(() => { void refresh().catch(() => setMessage(t.error)); }, [refresh, t.error]);

  async function send(url: string, method: "POST", body?: unknown) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message ?? t.error);
    return result;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const data = new FormData(event.currentTarget);
    const parseJson = (key: string, fallback: unknown) => {
      const raw = String(data.get(key) ?? "").trim();
      return raw ? JSON.parse(raw) : fallback;
    };
    const translation = (language: "fr" | "ar") => {
      const title = String(data.get(`${language}Title`) ?? "").trim();
      if (!title) return undefined;
      return { title, summary: String(data.get(`${language}Summary`) ?? "").trim(), instructions: String(data.get(`${language}Instructions`) ?? ""), body: String(data.get(`${language}Body`) ?? "") };
    };
    const payload = {
      documentType: String(data.get("documentType")),
      categorySlugs: String(data.get("categorySlugs")).split(",").map((value) => value.trim()).filter(Boolean),
      translations: { fr: translation("fr"), ar: translation("ar") },
      documentContent: parseJson("documentContent", undefined), formSchema: parseJson("formSchema", undefined), sources: parseJson("sources", []),
    };
    try {
      if (templateId) await send(`/api/v1/admin/catalog/templates/${templateId}/versions`, "POST", payload);
      else await send("/api/v1/admin/catalog/templates", "POST", payload);
      event.currentTarget.reset(); setTemplateId(""); setMessage(t.saved); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : t.error); }
    finally { setBusy(false); }
  }

  async function action(id: string, actionName: "review" | "publish") {
    setBusy(true); setMessage("");
    try { await send(`/api/v1/admin/catalog/templates/${id}/${actionName}`, "POST"); setMessage(t.saved); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : t.error); }
    finally { setBusy(false); }
  }

  async function reindex() {
    setBusy(true); setMessage("");
    try {
      const result = await send("/api/v1/admin/catalog/reindex", "POST");
      setMessage(`${t.saved} ${result.indexed} ${locale === "ar" ? "وثيقة مفهرسة" : "documents indexés"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : t.error); }
    finally { setBusy(false); }
  }

  return <div className="admin-catalog-layout">
    <form className="auth-card admin-editor" onSubmit={submit}>
      <div className="eyebrow">{templateId ? t.newVersion : t.create}</div>
      <label>{t.type}<select name="documentType" defaultValue="informational"><option value="informational">Information</option><option value="official">Document officiel</option><option value="editable">Modèle modifiable</option></select></label>
      <label>{t.category}<input name="categorySlugs" required defaultValue="resiliations" /></label>
      <div className="admin-languages">
        {(["fr", "ar"] as const).map((language) => <fieldset key={language} dir={language === "ar" ? "rtl" : "ltr"}><legend>{language.toUpperCase()}</legend>
          <label>{t[`${language}Title`]}<input name={`${language}Title`} /></label><label>{t[`${language}Summary`]}<textarea name={`${language}Summary`} rows={2} /></label><label>{t[`${language}Instructions`]}<textarea name={`${language}Instructions`} rows={3} /></label><label>{t[`${language}Body`]}<textarea name={`${language}Body`} rows={4} /></label>
        </fieldset>)}
      </div>
      <label>{t.content}<textarea name="documentContent" rows={4} placeholder={'{"sections":[]}'} /></label>
      <label>{t.form}<textarea name="formSchema" rows={3} placeholder={'{"fields":[]}'} /></label>
      <label>{t.sources}<textarea name="sources" rows={5} defaultValue={'[]'} /></label><p className="form-hint">{t.sourcesHint}</p>
      {message && <p className="form-message" role="status">{message}</p>}
      <button className="button auth-submit" disabled={busy}>{busy ? t.loading : templateId ? t.newVersion : t.create}</button>
      {templateId && <button type="button" className="button button-quiet" onClick={() => setTemplateId("")}>Annuler</button>}
    </form>
    <section className="admin-list"><div className="admin-list-heading"><div><div className="eyebrow">{t.status}</div><h2>Contenus</h2></div><div className="admin-item-actions">{isAdmin && <button className="button button-quiet" type="button" disabled={busy} onClick={() => void reindex()}>{t.reindex}</button>}<button className="button button-quiet" type="button" onClick={() => void refresh()}>{t.load}</button></div></div>
      {items.length === 0 ? <div className="empty-state"><p>{t.none}</p></div> : items.map((item) => <article className="admin-item" key={item.id}><div><span className="status-badge">{item.status}</span><h3>{item.translations[0]?.title ?? item.id}</h3><p>{item.documentType} · {t.version} {item.latestVersion?.version ?? "—"} · {item.latestVersion?.status ?? "—"}</p></div><div className="admin-item-actions"><button type="button" className="text-link" onClick={() => setTemplateId(item.id)}>{t.newVersion}</button>{item.latestVersion?.status === "draft" && <button type="button" className="text-link" disabled={busy} onClick={() => void action(item.id, "review")}>{t.review}</button>}{isAdmin && item.latestVersion?.status === "in_review" && <button type="button" className="text-link" disabled={busy} onClick={() => void action(item.id, "publish")}>{t.publish}</button>}</div></article>)}
    </section>
  </div>;
}
