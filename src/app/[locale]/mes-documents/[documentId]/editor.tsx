"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormSchema } from "@/modules/documents/form-schema";
import { renderTemplateText } from "@/modules/documents/form-schema";
import type { ProfileData } from "@/modules/profiles/schema";
import { ShareManager } from "@/modules/documents/ShareManager";

type EditorData = { id: string; title: string; status: string; documentType: string; revision: number; formSchema: FormSchema | null; content: { locale: "fr" | "ar"; body: string; answers: Record<string, unknown> } };
type HistoryItem = { revision: number; createdAt: string };
type ProfileItem = { id: string; relationship: string; data: ProfileData };

export function DocumentEditor({ documentId, locale }: { documentId: string; locale: string }) {
  const isArabic = locale === "ar";
  const [document, setDocument] = useState<EditorData | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [documentLocale, setDocumentLocale] = useState<"fr" | "ar">(locale === "ar" ? "ar" : "fr");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState(isArabic ? "جارٍ التحميل…" : "Chargement…");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [showProfiles, setShowProfiles] = useState(false);
  const latest = useRef({ title: "", body: "", locale: "fr" as "fr" | "ar", answers: {} as Record<string, unknown> });
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const saving = useRef(false);
  const queued = useRef(false);
  const loaded = useRef(false);

  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/me/documents/${documentId}`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Document not found.");
      if (!active) return;
      const item = result.document as EditorData;
      setDocument(item); setTitle(item.title); setBody(item.content.body); setDocumentLocale(item.content.locale); setAnswers(item.content.answers); setRevision(item.revision);
      latest.current = { title: item.title, body: item.content.body, locale: item.content.locale, answers: item.content.answers };
      revisionRef.current = item.revision; loaded.current = true;
      setMessage(isArabic ? "تم الحفظ" : "Enregistré");
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Erreur"); });
    return () => { active = false; };
  }, [documentId, isArabic]);

  const save = useCallback(async () => {
    if (!loaded.current || !dirtyRef.current) return;
    if (saving.current) { queued.current = true; return; }
    saving.current = true;
    const snapshot = latest.current;
    const expectedRevision = revisionRef.current;
    setMessage(isArabic ? "جارٍ الحفظ…" : "Enregistrement…"); setError("");
    try {
      const response = await fetch(`/api/v1/me/documents/${documentId}/revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision, title: snapshot.title, content: { locale: snapshot.locale, body: snapshot.body, answers: snapshot.answers } }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409 && result.code === "REVISION_CONFLICT") { setConflict(true); dirtyRef.current = false; setDirty(false); }
        throw new Error(result.message ?? (isArabic ? "تعذر الحفظ." : "Échec de l’enregistrement."));
      }
      revisionRef.current = result.revision; setRevision(result.revision);
      if (latest.current.title === snapshot.title && latest.current.body === snapshot.body && JSON.stringify(latest.current.answers) === JSON.stringify(snapshot.answers)) {
        dirtyRef.current = false; setDirty(false); setMessage(isArabic ? "تم الحفظ" : "Enregistré");
      } else { queued.current = true; }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erreur"); setMessage(isArabic ? "تعذر الحفظ" : "Échec de l’enregistrement");
    } finally {
      saving.current = false;
      if (queued.current) { queued.current = false; window.setTimeout(() => void save(), 100); }
    }
  }, [documentId, isArabic]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
  }, [title, body, dirty, save]);

  useEffect(() => {
    const onOnline = () => { if (dirtyRef.current) void save(); };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [save]);

  function markDirty() { dirtyRef.current = true; setDirty(true); }
  function updateTitle(value: string) { latest.current = { ...latest.current, title: value }; setTitle(value); markDirty(); }
  function updateBody(value: string) { latest.current = { ...latest.current, body: value }; setBody(value); markDirty(); }
  function updateAnswer(key: string, value: unknown) {
    const next = { ...latest.current.answers, [key]: value };
    latest.current = { ...latest.current, answers: next }; setAnswers(next); markDirty();
  }

  async function toggleHistory() {
    if (!showHistory) {
      const response = await fetch(`/api/v1/me/documents/${documentId}/revisions`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? "Erreur"); return; }
      setHistory(result.revisions as HistoryItem[]);
    }
    setShowHistory((value) => !value);
  }

  async function restore(sourceRevision: number) {
    if (!window.confirm(isArabic ? `استعادة النسخة ${sourceRevision}؟` : `Restaurer la version ${sourceRevision} dans une nouvelle révision ?`)) return;
    const response = await fetch(`/api/v1/me/documents/${documentId}/revisions/restore`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceRevision, expectedRevision: revisionRef.current }),
    });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? "Erreur"); return; }
    const content = result.content as EditorData["content"] & { title: string };
    latest.current = { title: content.title, body: content.body, locale: content.locale, answers: content.answers };
    setTitle(content.title); setBody(content.body); setDocumentLocale(content.locale); setAnswers(content.answers);
    revisionRef.current = result.revision; setRevision(result.revision); dirtyRef.current = false; setDirty(false);
    setMessage(isArabic ? "تمت الاستعادة كنسخة جديدة" : "Version restaurée dans une nouvelle révision"); setError("");
    setShowHistory(false);
  }

  async function loadProfiles() {
    if (profiles.length === 0) {
      const response = await fetch("/api/v1/me/profiles", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) { setError(result.message ?? (isArabic ? "تعذر تحميل الملفات الشخصية." : "Impossible de charger les profils.")); return; }
      setProfiles(result.profiles as ProfileItem[]);
    }
    setShowProfiles((current) => !current);
  }

  function fillFromProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile || !document?.formSchema) return;
    for (const field of document.formSchema.fields) {
      if (field.kind !== "profile" || !field.profileField) continue;
      const value = profile.data[field.profileField];
      if (typeof value === "string" && value !== "") updateAnswer(field.key, value);
    }
    setShowProfiles(false);
  }

  function renderField(field: NonNullable<FormSchema>["fields"][number]) {
    const label = field.label[isArabic ? "ar" : "fr"];
    if (field.kind === "checkbox") return <label className="consent-check" key={field.key}><input type="checkbox" required={field.required} checked={answers[field.key] === true} onChange={(event) => updateAnswer(field.key, event.target.checked)} />{label}{field.required ? " *" : ""}</label>;
    if (field.kind === "select") return <label className="profile-field" key={field.key}>{label}{field.required ? " *" : ""}<select required={field.required} value={typeof answers[field.key] === "string" ? answers[field.key] as string : ""} onChange={(event) => updateAnswer(field.key, event.target.value)}><option value="">{isArabic ? "اختر" : "Choisir"}</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label[isArabic ? "ar" : "fr"]}</option>)}</select></label>;
    if (field.kind === "textarea") return <label className="profile-field" key={field.key}>{label}{field.required ? " *" : ""}<textarea required={field.required} rows={3} maxLength={field.maxLength ?? 2000} placeholder={field.placeholder?.[isArabic ? "ar" : "fr"]} value={typeof answers[field.key] === "string" ? answers[field.key] as string : ""} onChange={(event) => updateAnswer(field.key, event.target.value)} /></label>;
    const inputType = field.kind === "number" ? "number" : field.kind === "date" || field.profileField === "dateOfBirth" ? "date" : field.profileField === "email" ? "email" : "text";
    return <label className="profile-field" key={field.key}>{label}{field.required ? " *" : ""}<input type={inputType} required={field.required} maxLength={field.kind === "text" || field.kind === "profile" ? field.maxLength ?? 2000 : undefined} placeholder={field.placeholder?.[isArabic ? "ar" : "fr"]} value={typeof answers[field.key] === "string" ? answers[field.key] as string : ""} onChange={(event) => updateAnswer(field.key, event.target.value)} /></label>;
  }

  return <div className="document-editor-wrap">
    <Link className="back-link" href={`/${locale}/mes-documents`}>← {isArabic ? "العودة إلى وثائقي" : "Retour à mes documents"}</Link>
    {error && <p className="form-message form-error" role="alert">{error}{conflict && <> <button className="text-link" type="button" onClick={() => window.location.reload()}>{isArabic ? "إعادة تحميل النسخة الحالية" : "Recharger la version actuelle"}</button></>}</p>}
    {!document ? <div className="empty-state"><p>{message}</p></div> : <>
      <div className="document-editor-heading"><div><div className="eyebrow">{isArabic ? "مسودة خاصة" : "BROUILLON PRIVÉ"}</div><h1>{isArabic ? "محرر الوثيقة" : "Éditeur de document"}</h1></div><div className="document-editor-actions"><div className="document-save-state" role="status">{dirty ? (isArabic ? "تعديلات غير محفوظة" : "Modifications en cours…") : message} · {isArabic ? `النسخة ${revision}` : `Version ${revision}`}</div><button className="button button-quiet" type="button" onClick={() => void toggleHistory()}>{isArabic ? "السجل" : "Historique"}</button><button className="button button-quiet" type="button" onClick={() => window.print()}>{isArabic ? "طباعة / PDF" : "Imprimer / PDF"}</button><a className={`button ${dirty ? "button-disabled" : ""}`} aria-disabled={dirty} onClick={(event) => { if (dirty) event.preventDefault(); }} href={`/api/v1/me/documents/${documentId}/exports/docx`}>{isArabic ? "تنزيل Word" : "Télécharger Word"}</a></div></div>
      <ShareManager documentId={documentId} locale={isArabic ? "ar" : "fr"} disabled={dirty} />
      {showHistory && <section className="revision-history"><h2>{isArabic ? "النسخ السابقة" : "Versions précédentes"}</h2>{history.map((item) => <article className="revision-row" key={item.revision}><span>{isArabic ? `النسخة ${item.revision}` : `Version ${item.revision}`} · {new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</span>{item.revision !== revision && <button className="text-link" type="button" onClick={() => void restore(item.revision)}>{isArabic ? "استعادة" : "Restaurer"}</button>}</article>)}</section>}
      <div className="document-editor-grid"><section className="auth-card document-edit-card"><label className="profile-field">{isArabic ? "العنوان" : "Titre"}<input maxLength={240} disabled={conflict} value={title} onChange={(event) => updateTitle(event.target.value)} /></label>{document.formSchema?.fields.length ? <fieldset className="document-form-fields" disabled={conflict}><legend>{isArabic ? "معلومات الوثيقة" : "Informations du document"}</legend>{document.formSchema.fields.some((field) => field.kind === "profile") && <div className="profile-prefill"><button className="button button-quiet" type="button" onClick={() => void loadProfiles()}>{isArabic ? "ملء من ملف شخصي" : "Préremplir depuis un profil"}</button>{showProfiles && <select aria-label={isArabic ? "اختر ملفاً شخصياً" : "Choisir un profil"} defaultValue="" onChange={(event) => fillFromProfile(event.target.value)}><option value="">{isArabic ? "اختر شخصاً" : "Choisir une personne"}</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.data.fullName}</option>)}</select>}</div>}{document.formSchema.fields.map(renderField)}</fieldset> : null}<label className="profile-field">{isArabic ? "نص الوثيقة" : "Texte du document"}<textarea className="document-body-input" disabled={conflict} dir={documentLocale === "ar" ? "rtl" : "ltr"} value={body} readOnly={document.documentType !== "editable"} onChange={(event) => updateBody(event.target.value)} /></label><button className="button" type="button" onClick={() => void save()} disabled={!dirty || conflict}>{isArabic ? "حفظ الآن" : "Enregistrer maintenant"}</button><p className="form-hint">{isArabic ? "يتم حفظ تعديلاتك تلقائياً وتشفيرها في التخزين." : "Les modifications sont enregistrées automatiquement et chiffrées au stockage."}</p></section><section className="document-preview"><div className="eyebrow">{isArabic ? "معاينة" : "APERÇU"}</div><h2>{title || (isArabic ? "عنوان الوثيقة" : "Titre du document")}</h2><div dir={documentLocale === "ar" ? "rtl" : "ltr"} className="template-body">{renderTemplateText(body || (documentLocale === "ar" ? "سيظهر نص الوثيقة هنا." : "Le texte du document apparaîtra ici."), answers)}</div></section></div>
    </>}
  </div>;
}
