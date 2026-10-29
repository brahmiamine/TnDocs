"use client";

import { useEffect, useRef, useState } from "react";
import { SecondaryDocumentEditor } from "@/modules/documents/SecondaryDocumentEditor";
import { RichDocumentEditor } from "@/modules/documents/RichDocumentEditor";
import { richDocumentHtml, richDocumentText } from "@/modules/documents/rich-document";
import { RichFormFields } from "@/modules/documents/rich-form-fields";
import { renderTemplateText, resolveFormAnswers } from "@/modules/documents/form-schema";
import { indexedDbStorage } from "./indexed-db";
import { OfflineVault, type OfflineDraft } from "./vault";

/** This shell never fetches private data. A saved draft is decrypted only after an explicit unlock. */
export function OfflineWorkspace({ locale }: { locale: "fr" | "ar" }) {
  const ar = locale === "ar";
  const [selection, setSelection] = useState<{ ownerId: string; documentId: string } | null>(null);
  const [secret, setSecret] = useState("");
  const [draft, setDraft] = useState<OfflineDraft | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const vaultRef = useRef<OfflineVault | null>(null);
  const draftRef = useRef<OfflineDraft | null>(null);
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const ownerId = parameters.get("account"), documentId = parameters.get("document");
    if (ownerId && documentId && /^[a-zA-Z0-9-]{1,100}$/.test(ownerId) && /^[a-zA-Z0-9-]{1,100}$/.test(documentId)) {
      setSelection({ ownerId, documentId });
      vaultRef.current = new OfflineVault(indexedDbStorage, ownerId);
    }
    const lock = () => { vaultRef.current?.lock(); draftRef.current = null; setDraft(null); };
    window.addEventListener("pagehide", lock);
    return () => { vaultRef.current?.lock(); window.removeEventListener("pagehide", lock); };
  }, []);
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => { if (pendingWrites > 0) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [pendingWrites]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (!selection || !vaultRef.current) return;
    const password = secret; setSecret(""); setBusy(true);
    try {
      await vaultRef.current.unlock(password);
      const local = await vaultRef.current.read(selection.documentId);
      if (!local) throw new Error("LOCAL_COPY_MISSING");
      if (local.document.status !== "draft") throw new Error("LOCAL_DOCUMENT_READ_ONLY");
      draftRef.current = local; setDraft(local);
      setStatus(ar ? "نسخة محلية مفتوحة. لا يتم إرسال أي بيانات إلى الخادم هنا." : "Copie locale déverrouillée. Aucune donnée n’est envoyée au serveur depuis cet écran.");
    } catch {
      vaultRef.current.lock();
      setStatus(ar ? "تعذر فتح النسخة: سر غير صحيح أو بيانات محذوفة/تالفة. البيانات الموجودة لم تُحذف." : "Ouverture impossible : secret incorrect ou copie absente/corrompue. Les données existantes sont conservées.");
    } finally { setBusy(false); }
  }
  function updateDocument(change: Partial<OfflineDraft["document"]>) {
    const current = draftRef.current, vault = vaultRef.current;
    if (!current || !vault?.unlocked) return;
    const next: OfflineDraft = { ...current, document: { ...current.document, ...change }, pending: true, savedAt: new Date().toISOString() };
    draftRef.current = next; setDraft(next); setPendingWrites((value) => value + 1);
    setStatus(ar ? "حفظ النسخة المحلية…" : "Enregistrement local…");
    void vault.save(next).then(() => { if (draftRef.current === next) setStatus(ar ? "تم حفظ التعديلات محلياً مشفّرة. المزامنة غير مكتملة." : "Modifications enregistrées et chiffrées sur cet appareil. Elles ne sont pas encore synchronisées."); }).catch(() => setStatus(ar ? "لم يتم الحفظ محلياً. احتفظ بهذه الصفحة مفتوحة وتحقق من المساحة." : "Échec du stockage local. Gardez cette page ouverte et vérifiez l’espace disponible.")).finally(() => setPendingWrites((value) => value - 1));
  }
  async function lock() {
    setBusy(true);
    try { await vaultRef.current?.flush(); vaultRef.current?.lock(); draftRef.current = null; setDraft(null); setStatus(ar ? "تم قفل النسخة المحلية." : "Copie locale verrouillée."); }
    catch { setStatus(ar ? "تعذر إنهاء الحفظ. لم يتم القفل لتجنب فقدان التعديلات." : "L’enregistrement a échoué. Le document reste ouvert pour préserver vos modifications."); }
    finally { setBusy(false); }
  }
  async function clear() {
    if (!window.confirm(ar ? "حذف جميع النسخ المحلية لهذا الحساب؟ قد تضيع التعديلات غير المتزامنة. بيانات الخادم لا تتغير." : "Effacer toutes les copies locales de ce compte ? Les modifications non synchronisées seront perdues. Le serveur restera inchangé.")) return;
    setBusy(true);
    try { await vaultRef.current?.clear(); draftRef.current = null; setDraft(null); setStatus(ar ? "تم مسح النسخ المحلية لهذا الحساب." : "Copies locales de ce compte effacées."); }
    catch { setStatus(ar ? "فشل مسح التخزين المحلي." : "Échec de l’effacement local."); }
    finally { setBusy(false); }
  }
  let previewAnswers = draft?.document.content.answers ?? {};
  try { if (draft?.document.formSchema) previewAnswers = resolveFormAnswers(draft.document.formSchema, previewAnswers); } catch { /* Incomplete formulas remain editable. */ }
  return <>
    <a className="brand" href={`/${locale}`}>TnDocs</a>
    <h1>{ar ? "مسوداتي دون اتصال" : "Mes brouillons hors ligne"}</h1>
    <p>{ar ? "نسخ مشفّرة على هذا الجهاز فقط. قد يحذف المتصفح التخزين؛ هذه ليست نسخة احتياطية. سر مفقود لا يمكن استرجاعه. لا تُزامن أي نسخة تلقائياً من هذا الوضع." : "Copies chiffrées sur cet appareil uniquement. Le navigateur peut les effacer ; ce cache n’est pas une sauvegarde. Un secret perdu ne peut pas être récupéré. Cet écran ne synchronise aucune version automatiquement."}</p>
    {!selection ? <p role="status">{ar ? "افتح رابط العمل دون اتصال من محرّر الوثيقة بعد تفعيل الحفظ المحلي، ثم احفظ الرابط على هذا الجهاز." : "Ouvrez le lien hors ligne depuis l’éditeur d’un document après avoir activé sa copie locale, puis conservez ce lien sur cet appareil."}</p> : <>
      <p><small>{ar ? "معرّف الحساب على هذا الجهاز:" : "Compte sélectionné sur cet appareil :"} <bdi>{selection.ownerId}</bdi></small></p>
      {!draft ? <form className="auth-card" onSubmit={unlock}><label className="profile-field">{ar ? "السر المحلي" : "Secret local"}<input type="password" autoComplete="off" required value={secret} onChange={(event) => setSecret(event.target.value)} /></label><button className="button" disabled={busy}>{ar ? "فتح النسخة المشفّرة" : "Ouvrir la copie chiffrée"}</button></form> : <>
        <div className="document-editor-actions"><button type="button" className="button button-quiet" disabled={busy || pendingWrites > 0} onClick={() => void lock()}>{ar ? "قفل" : "Verrouiller"}</button><a className="button" href={`/${locale}/mes-documents/${selection.documentId}`}>{ar ? "الاتصال والمراجعة قبل المزامنة" : "Ouvrir connecté pour comparer et synchroniser"}</a></div>
        <p>{ar ? "للمزامنة: اتصل وافتح المحرر، ثم افتح التخزين المحلي واختر بين النسخة المحلية والخادم أو نسخة مستقلة. لا يتم استبدال التعارض تلقائياً." : "Pour synchroniser : reconnectez-vous, ouvrez l’éditeur puis déverrouillez le stockage local et choisissez le serveur, votre texte ou une copie indépendante. Un conflit n’est jamais écrasé automatiquement."}</p>
        <div className="document-editor-grid"><section className="auth-card"><label className="profile-field">{ar ? "العنوان" : "Titre"}<input maxLength={240} value={draft.document.title} onChange={(event) => updateDocument({ title: event.target.value })} /></label>{draft.document.formSchema && <RichFormFields schema={draft.document.formSchema} answers={draft.document.content.answers} locale={locale} onChange={(answers) => updateDocument({ content: { ...draft.document.content, answers } })} />}{draft.document.content.richDocument && draft.document.documentType === "editable" ? <RichDocumentEditor value={draft.document.content.richDocument} locale={draft.document.content.locale} answers={previewAnswers} onChange={(value) => updateDocument({ content: { ...draft.document.content, richDocument: value, body: richDocumentText(value) } })} /> : <label className="profile-field">{ar ? "نص الوثيقة" : "Texte du document"}<textarea rows={15} dir={draft.document.content.locale === "ar" ? "rtl" : "ltr"} readOnly={draft.document.documentType !== "editable"} value={draft.document.content.body} onChange={(event) => updateDocument({ content: { ...draft.document.content, body: event.target.value } })} /></label>}{draft.document.content.secondary && <SecondaryDocumentEditor value={draft.document.content.secondary} locale={locale} answers={previewAnswers} editable={draft.document.documentType === "editable"} onChange={(value) => updateDocument({ content: { ...draft.document.content, secondary: value } })} />}</section><section className="document-preview"><h2>{draft.document.title}</h2>{draft.document.content.richDocument ? <div className="template-body" dir={draft.document.content.locale === "ar" ? "rtl" : "ltr"} dangerouslySetInnerHTML={{ __html: richDocumentHtml(draft.document.content.richDocument, previewAnswers, draft.document.content.locale) }} /> : <div className="template-body" dir={draft.document.content.locale === "ar" ? "rtl" : "ltr"}>{renderTemplateText(draft.document.content.body, previewAnswers)}</div>}{draft.document.content.secondary && <section lang={draft.document.content.secondary.locale} dir={draft.document.content.secondary.locale === "ar" ? "rtl" : "ltr"}><h2>{draft.document.content.secondary.title}</h2>{draft.document.content.secondary.richDocument ? <div className="template-body" dangerouslySetInnerHTML={{ __html: richDocumentHtml(draft.document.content.secondary.richDocument, previewAnswers, draft.document.content.secondary.locale) }} /> : <div className="template-body">{renderTemplateText(draft.document.content.secondary.body, previewAnswers)}</div>}</section>}</section></div>
      </>}
      <button type="button" className="button button-quiet" disabled={busy} onClick={() => void clear()}>{ar ? "مسح النسخ المحلية لهذا الحساب" : "Effacer les copies locales de ce compte"}</button>
    </>}
    <p role="status">{status}</p>
  </>;
}
