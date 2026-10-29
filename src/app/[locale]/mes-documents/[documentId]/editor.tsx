"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type EditorData = { id: string; title: string; status: string; revision: number; content: { locale: "fr" | "ar"; body: string; answers: Record<string, unknown> } };

export function DocumentEditor({ documentId, locale }: { documentId: string; locale: string }) {
  const isArabic = locale === "ar";
  const [document, setDocument] = useState<EditorData | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState(isArabic ? "جارٍ التحميل…" : "Chargement…");
  const [error, setError] = useState("");
  const latest = useRef({ title: "", body: "" });
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
      setDocument(item); setTitle(item.title); setBody(item.content.body); setRevision(item.revision);
      latest.current = { title: item.title, body: item.content.body };
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
        body: JSON.stringify({ expectedRevision, title: snapshot.title, content: { locale: isArabic ? "ar" : "fr", body: snapshot.body, answers: {} } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? (isArabic ? "تعذر الحفظ." : "Échec de l’enregistrement."));
      revisionRef.current = result.revision; setRevision(result.revision);
      if (latest.current.title === snapshot.title && latest.current.body === snapshot.body) {
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

  function updateTitle(value: string) { latest.current = { ...latest.current, title: value }; setTitle(value); dirtyRef.current = true; setDirty(true); }
  function updateBody(value: string) { latest.current = { ...latest.current, body: value }; setBody(value); dirtyRef.current = true; setDirty(true); }

  return <div className="document-editor-wrap">
    <Link className="back-link" href={`/${locale}/mes-documents`}>← {isArabic ? "العودة إلى وثائقي" : "Retour à mes documents"}</Link>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
    {!document ? <div className="empty-state"><p>{message}</p></div> : <>
      <div className="document-editor-heading"><div><div className="eyebrow">{isArabic ? "مسودة خاصة" : "BROUILLON PRIVÉ"}</div><h1>{isArabic ? "محرر الوثيقة" : "Éditeur de document"}</h1></div><div className="document-save-state" role="status">{dirty ? (isArabic ? "تعديلات غير محفوظة" : "Modifications en cours…") : message} · {isArabic ? `النسخة ${revision}` : `Version ${revision}`}</div></div>
      <div className="document-editor-grid"><section className="auth-card document-edit-card"><label className="profile-field">{isArabic ? "العنوان" : "Titre"}<input maxLength={240} value={title} onChange={(event) => updateTitle(event.target.value)} /></label><label className="profile-field">{isArabic ? "نص الوثيقة" : "Texte du document"}<textarea className="document-body-input" dir={isArabic ? "rtl" : "auto"} value={body} onChange={(event) => updateBody(event.target.value)} /></label><button className="button" type="button" onClick={() => void save()} disabled={!dirty}>{isArabic ? "حفظ الآن" : "Enregistrer maintenant"}</button><p className="form-hint">{isArabic ? "يتم حفظ تعديلاتك تلقائياً وتشفيرها في التخزين." : "Les modifications sont enregistrées automatiquement et chiffrées au stockage."}</p></section><section className="document-preview"><div className="eyebrow">{isArabic ? "معاينة" : "APERÇU"}</div><h2>{title || (isArabic ? "عنوان الوثيقة" : "Titre du document")}</h2><div dir={isArabic ? "rtl" : "auto"} className="template-body">{body || (isArabic ? "سيظهر نص الوثيقة هنا." : "Le texte du document apparaîtra ici.")}</div></section></div>
    </>}
  </div>;
}
