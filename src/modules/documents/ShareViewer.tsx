"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentContent } from "@/modules/documents/schema";
import { SecondaryDocumentEditor } from "@/modules/documents/SecondaryDocumentEditor";
import { RichFormFields } from "@/modules/documents/rich-form-fields";
import { renderTemplateText, resolveFormAnswers, type FormSchema } from "@/modules/documents/form-schema";
import { richDocumentHtml, richDocumentText } from "@/modules/documents/rich-document";
import { RichDocumentEditor } from "@/modules/documents/RichDocumentEditor";
type Permissions = { view: boolean; copy: boolean; edit: boolean };
export function ShareViewer({ locale }: { locale: "fr" | "ar" }) {
  const ar = locale === "ar";
  const [content, setContent] = useState<DocumentContent | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [formSchema, setFormSchema] = useState<FormSchema | null>(null);
  const [revision, setRevision] = useState(0);
  const [documentType, setDocumentType] = useState("");
  const [editableCurrent, setEditableCurrent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [changed, setChanged] = useState(false);
  const [token, setToken] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(ar ? "جارٍ التحقق من المشاركة…" : "Vérification du partage…");
  const started = useRef(false);
  const access = useCallback(async (secret: string) => {
    setBusy(true); setNeedsLogin(false); setContent(null); setPermissions(null); setEditing(false); setChanged(false); setFormSchema(null);
    try {
      const response = await fetch("/api/v1/shares/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: secret }), cache: "no-store", referrerPolicy: "no-referrer" });
      const result = await response.json();
      if (response.status === 401) { setNeedsLogin(true); setMessage(ar ? "سجّل الدخول في نافذة أخرى بحساب البريد المؤكد المخصص، ثم أعد المحاولة هنا." : "Connectez-vous dans un autre onglet avec le compte email vérifié désigné, puis réessayez ici."); return; }
      if (!response.ok) throw new Error("SHARE_UNAVAILABLE");
      setContent(result.content); setPermissions(result.permissions); setRevision(result.revision); setFormSchema(result.formSchema); setDocumentType(result.documentType ?? ""); setEditableCurrent(result.editableCurrent); setEditing(false); setChanged(false); setMessage("");
    } catch { setMessage(ar ? "المشاركة غير متاحة لهذا الحساب، أو انتهت صلاحيتها أو أُلغيت. الروابط القديمة غير المخصصة معطلة." : "Partage indisponible pour ce compte, expiré ou révoqué. Les anciens liens sans destinataire sont désactivés."); }
    finally { setBusy(false); }
  }, [ar]);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const secret = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) { setMessage(ar ? "رابط غير صالح. افتح الرابط الكامل المرسل لك." : "Lien invalide. Ouvrez le lien complet qui vous a été transmis."); return; }
    setToken(secret); void access(secret);
  }, [access, ar]);
  async function copyToAccount() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/v1/shares/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store", referrerPolicy: "no-referrer" });
      if (response.status === 401) { setNeedsLogin(true); throw new Error("LOGIN_REQUIRED"); }
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error("COPY_UNAVAILABLE");
      window.location.assign(`/${locale}/mes-documents/${result.id}`);
    } catch { setMessage(ar ? "تعذر النسخ. تحقق من الحساب والصلاحيات وانتهاء المشاركة." : "Copie impossible. Vérifiez le compte, les droits et la validité du partage."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!content || !permissions?.edit || !changed) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/v1/shares/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, expectedRevision: revision, title: content.title || (ar ? "وثيقة مشتركة" : "Document partagé"), content }), cache: "no-store", referrerPolicy: "no-referrer" });
      const result = await response.json();
      if (response.status === 409) { setEditableCurrent(false); setMessage(ar ? "تغيرت الوثيقة أو جرى تثبيتها. احتُفظ بنصك في هذه الصفحة ولم يتم استبدال شيء. اطلب مشاركة جديدة أو انسخ تعديلاتك قبل إعادة التحميل." : "Le document a changé ou a été verrouillé. Votre texte reste dans cette page ; aucune version n’a été écrasée. Demandez un nouveau partage ou conservez vos modifications avant de recharger."); return; }
      if (!response.ok) throw new Error("SAVE_UNAVAILABLE");
      setRevision(result.revision); setChanged(false); setEditing(false); setMessage(ar ? "تم إنشاء نسخة جديدة لدى مالك الوثيقة." : "Une nouvelle révision a été enregistrée chez le propriétaire.");
    } catch { setMessage(ar ? "تعذر الحفظ. المشاركة قد تكون ملغاة أو منتهية؛ النص موجود في هذه الصفحة فقط." : "Enregistrement impossible. Le partage est peut-être expiré ou révoqué ; votre texte reste uniquement dans cette page."); }
    finally { setBusy(false); }
  }
  let answers = content?.answers ?? {};
  try { if (formSchema) answers = resolveFormAnswers(formSchema, answers); } catch { /* Incomplete formulas remain editable. */ }
  function update(next: DocumentContent) { setContent(next); setChanged(true); }
  return <section className="share-viewer">
    <div className="eyebrow">{ar ? "مشاركة خاصة" : "PARTAGE NOMINATIF PRIVÉ"}</div>
    {needsLogin && <p><a className="button" href={`/${locale}/connexion`} target="_blank" rel="noopener noreferrer">{ar ? "تسجيل الدخول في نافذة أخرى" : "Se connecter dans un autre onglet"}</a> <button className="button button-quiet" disabled={busy} type="button" onClick={() => void access(token)}>{ar ? "إعادة التحقق" : "Réessayer"}</button></p>}
    {permissions && <>
      <p>{ar ? `النسخة المشتركة ${revision}` : `Révision partagée ${revision}`}</p>
      {!content && <p>{ar ? "يمكنك نسخ هذه الوثيقة إلى حسابك دون عرض المصدر من هذا الرابط." : "Vous pouvez copier ce document dans votre compte sans consulter la source depuis ce lien."}</p>}
      {content && <><h1>{content.title || (ar ? "وثيقة مشتركة" : "Document partagé")}</h1>{editing ? <fieldset disabled={busy}><legend>{ar ? "تعديل النسخة المصرح بها فقط" : "Modifier uniquement cette révision autorisée"}</legend><label className="profile-field">{ar ? "العنوان" : "Titre"}<input maxLength={240} value={content.title ?? ""} onChange={(event) => update({ ...content, title: event.target.value })} /></label>{formSchema && <RichFormFields schema={formSchema} answers={content.answers} locale={locale} onChange={(next) => update({ ...content, answers: next })} />}{content.richDocument && documentType === "editable" ? <RichDocumentEditor value={content.richDocument} locale={locale} answers={answers} onChange={(value) => update({ ...content, richDocument: value, body: richDocumentText(value) })} /> : <label className="profile-field">{ar ? "النص" : "Texte"}<textarea rows={14} dir={content.locale === "ar" ? "rtl" : "ltr"} readOnly={documentType !== "editable"} maxLength={50_000} value={content.body} onChange={(event) => update({ ...content, body: event.target.value })} /></label>}{content.secondary && <SecondaryDocumentEditor value={content.secondary} locale={locale} answers={answers} editable={documentType === "editable"} onChange={(value) => update({ ...content, secondary: value })} />}<button type="button" className="button" disabled={!changed || !editableCurrent} onClick={() => void save()}>{ar ? "حفظ في نسخة جديدة" : "Enregistrer une nouvelle révision"}</button></fieldset> : content.richDocument ? <div className="template-body share-viewer-body" dir={content.locale === "ar" ? "rtl" : "ltr"} dangerouslySetInnerHTML={{ __html: richDocumentHtml(content.richDocument, answers, content.locale) }} /> : <div className="template-body share-viewer-body" dir={content.locale === "ar" ? "rtl" : "ltr"}>{renderTemplateText(content.body, answers)}</div>}{!editing && content.secondary && <section lang={content.secondary.locale} dir={content.secondary.locale === "ar" ? "rtl" : "ltr"}><h2>{content.secondary.title}</h2>{content.secondary.richDocument ? <div className="template-body" dangerouslySetInnerHTML={{ __html: richDocumentHtml(content.secondary.richDocument, answers, content.secondary.locale) }} /> : <div className="template-body">{renderTemplateText(content.secondary.body, answers)}</div>}</section>}</>}
      <p className="form-hint">{ar ? "المشاركة لا تتيح ملفات الأشخاص أو الوثائق الأخرى. لا يُحفظ هذا العرض في التخزين المحلي." : "Ce partage ne donne accès à aucun profil ni autre document. Cet écran ne conserve pas de copie locale."}</p>
      {permissions.edit && !editing && <button className="button button-quiet" type="button" disabled={busy || !editableCurrent} onClick={() => setEditing(true)}>{ar ? "تعديل" : "Modifier"}</button>}
      {permissions.edit && !editableCurrent && <p>{ar ? "النسخة المشتركة لم تعد أحدث مسودة قابلة للتعديل. اطلب مشاركة جديدة من المالك." : "La révision partagée n’est plus la dernière version modifiable. Demandez un nouveau partage au propriétaire."}</p>}
      {permissions.copy && <button className="button" type="button" disabled={busy || changed} onClick={() => void copyToAccount()}>{ar ? "نسخ إلى حسابي" : "Copier dans mon compte"}</button>}
      <button className="button button-quiet" type="button" disabled={busy} onClick={() => { if (!changed || window.confirm(ar ? "إلغاء التعديلات غير المحفوظة وإعادة التحقق؟" : "Abandonner les modifications non enregistrées et recharger le partage ?")) void access(token); }}>{ar ? "إعادة التحقق من المشاركة" : "Actualiser le partage"}</button>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
