"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { searchDictionarySchema } from "./policy";
export function SearchAdmin({ locale }: { locale: "fr" | "ar" }) {
  const ar = locale === "ar", [text, setText] = useState(""), [revision, setRevision] = useState(0), [metrics, setMetrics] = useState<Array<{ day: string; outcome: "matched" | "no_result"; count: number }>>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/v1/admin/search", { cache: "no-store" }).then(async response => { if (!response.ok) throw new Error("failed"); const result = await response.json(); setText(JSON.stringify(result.dictionary, null, 2)); setRevision(result.revision); setMetrics(result.metrics); }).catch(() => setMessage(ar ? "تعذر التحميل." : "Chargement impossible.")); }, [ar]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const dictionary = searchDictionarySchema.parse(JSON.parse(text));
      const response = await fetch("/api/v1/admin/search", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dictionary, expectedRevision: revision }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.code);
      setRevision(result.revision); setMessage(ar ? "تم الحفظ. أُضيف تحديث الفهرس إلى الطابور." : "Configuration enregistrée. La mise à jour de l’index est en file d’attente.");
    } catch { setMessage(ar ? "تعذر الحفظ. تحقق من البنية أو حدّث الصفحة عند تعارض النسخ." : "Enregistrement impossible. Vérifiez la structure ou rechargez la page en cas de modification concurrente."); }
    finally { setBusy(false); }
  }
  return <main className="container section" dir={ar ? "rtl" : "ltr"} style={{ maxWidth: 1000 }}><p><Link href={`/${locale}/admin/catalogue`}>{ar ? "إدارة الفهرس" : "Administration du catalogue"}</Link></p><h1>{ar ? "قاموس البحث" : "Dictionnaire de recherche"}</h1><p>{ar ? "مرادفات FR/AR ومسارات عبارة حرفية، دون تنفيذ كود أو نموذج ذكاء اصطناعي." : "Synonymes FR/AR et correspondances de phrases littérales, sans code exécutable ni modèle IA."}</p>{message && <p role="status">{message}</p>}<form className="auth-form" onSubmit={save}><label htmlFor="search-dictionary">{ar ? "المرادفات وقواعد العبارات" : "Synonymes et règles de phrases"}</label><textarea id="search-dictionary" dir="ltr" rows={25} value={text} onChange={event => setText(event.target.value)} required /><button className="button" disabled={busy}>{ar ? "حفظ" : "Enregistrer"}</button></form><h2>{ar ? "مقاييس يومية مجمّعة" : "Mesures quotidiennes agrégées"}</h2><p>{ar ? "لا تُحفظ نصوص البحث أو هوية المستخدم أو عنوانه." : "Aucun texte de recherche, identifiant utilisateur ou adresse n’est conservé."}</p><table><thead><tr><th>{ar ? "اليوم" : "Jour"}</th><th>{ar ? "النتيجة" : "Résultat"}</th><th>{ar ? "العدد" : "Nombre"}</th></tr></thead><tbody>{metrics.map(row => <tr key={`${row.day}:${row.outcome}`}><td>{row.day}</td><td>{row.outcome === "matched" ? (ar ? "نتائج" : "Avec résultat") : (ar ? "دون نتائج" : "Sans résultat")}</td><td>{row.count}</td></tr>)}</tbody></table></main>;
}
