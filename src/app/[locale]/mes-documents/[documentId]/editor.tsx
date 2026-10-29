"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderTemplateText, resolveFormAnswers } from "@/modules/documents/form-schema";
import type { ProfileData } from "@/modules/profiles/schema";
import type { SecondaryDocumentSection } from "@/modules/documents/schema";
import { SecondaryDocumentEditor } from "@/modules/documents/SecondaryDocumentEditor";
import { RichDocumentEditor } from "@/modules/documents/RichDocumentEditor";
import { richDocumentFromText, richDocumentText, richDocumentHtml, type RichDocument } from "@/modules/documents/rich-document";
import { RichFormFields } from "@/modules/documents/rich-form-fields";
import { ExportManager } from "@/modules/documents/ExportManager";
import { SignRequestManager } from "@/modules/signatures/SignRequestManager";
import { OfflineControls } from "@/modules/offline/OfflineControls";
import { OfflineVault, recoveryDecision, type OfflineDraft, type OfflineDocument } from "@/modules/offline/vault";
import { indexedDbStorage } from "@/modules/offline/indexed-db";
import { ShareManager } from "@/modules/documents/ShareManager";

type EditorData = OfflineDocument;
type HistoryItem = { revision: number; createdAt: string };
type ProfileItem = { id: string; relationship: string; data: ProfileData };

export function DocumentEditor({ documentId, locale, ownerId, offlineEnabled = true }: { documentId: string; locale: string; ownerId: string; offlineEnabled?: boolean }) {
  const isArabic = locale === "ar";
  const [document, setDocument] = useState<EditorData | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [secondary, setSecondary] = useState<SecondaryDocumentSection | undefined>(undefined);
  const [richDocument, setRichDocument] = useState<RichDocument | undefined>(undefined);
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
  const latest = useRef({ title: "", body: "", richDocument: undefined as RichDocument | undefined, secondary: undefined as SecondaryDocumentSection | undefined, locale: "fr" as "fr" | "ar", answers: {} as Record<string, unknown> });
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const saving = useRef(false);
  const queued = useRef(false);
  const retryTimer = useRef<number | null>(null);
  const retryDelay = useRef(2000);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const loaded = useRef(false);
  const conflictRef = useRef(false);
  const vaultRef = useRef<OfflineVault | null>(null);
  const [offlineConfigured, setOfflineConfigured] = useState(false);
  const [offlineUnlocked, setOfflineUnlocked] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState("");
  const [recovery, setRecovery] = useState<OfflineDraft | null>(null);
  const [serverDocument, setServerDocument] = useState<EditorData | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const vault = new OfflineVault(indexedDbStorage, ownerId);
    vaultRef.current = vault;
    let active = true;
    void vault.exists().then((exists) => { if (active) setOfflineConfigured(exists); }).catch(() => {
      if (active) setOfflineStatus(isArabic ? "التخزين المحلي غير متاح في هذا المتصفح." : "Le stockage local n’est pas disponible dans ce navigateur.");
    });
    const lock = () => { vault.lock(); if (active) { setOfflineUnlocked(false); setOfflineReady(false); } };
    window.addEventListener("pagehide", lock);
    return () => { active = false; vault.lock(); window.removeEventListener("pagehide", lock); };
  }, [ownerId, isArabic]);

  useEffect(() => {
    if (offlineEnabled) return;
    vaultRef.current?.lock(); setOfflineUnlocked(false); setOfflineReady(false);
  }, [offlineEnabled]);

  function currentOfflineDraft(pending: boolean): OfflineDraft | null {
    if (!document || !loaded.current) return null;
    const snapshot = latest.current;
    return { document: { ...document, title: snapshot.title, revision: revisionRef.current, content: { body: snapshot.body, richDocument: snapshot.richDocument, secondary: snapshot.secondary, locale: snapshot.locale, answers: snapshot.answers } }, expectedRevision: revisionRef.current, pending, savedAt: new Date().toISOString() };
  }

  async function unlockOffline(secret: string, create: boolean) {
    const vault = vaultRef.current;
    if (!vault || !offlineEnabled) return;
    if (create && document?.status !== "draft") { setOfflineStatus(isArabic ? "يمكن تفعيل النسخ المحلية للمسودات فقط." : "La copie locale peut être activée pour les brouillons uniquement."); return; }
    setOfflineBusy(true);
    try {
      if (create) await vault.create(secret); else await vault.unlock(secret);
      setOfflineConfigured(true); setOfflineUnlocked(true);
      const local = await vault.read(documentId);
      if (local?.pending) {
        setRecovery(local); setOfflineReady(false);
        setOfflineStatus(isArabic ? "توجد تعديلات محلية. اختر النسخة المراد الاحتفاظ بها قبل المزامنة." : "Des modifications locales existent. Choisissez la version à conserver avant la synchronisation.");
      } else {
        setOfflineReady(true);
        const snapshot = currentOfflineDraft(dirtyRef.current);
        if (snapshot) await vault.save(snapshot);
        setOfflineStatus(isArabic ? "التخزين المحلي مفتوح لهذه الوثيقة." : "Stockage local déverrouillé pour ce document.");
      }
    } catch {
      setOfflineStatus(isArabic ? "تعذر فتح البيانات المحلية: تحقق من السر أو امسح النسخ التالفة. لم يتم حذفها." : "Impossible d’ouvrir les données locales : vérifiez le secret ou effacez les copies corrompues. Elles sont conservées.");
    } finally { setOfflineBusy(false); }
  }

  async function lockOffline() {
    try {
      const snapshot = currentOfflineDraft(dirtyRef.current);
      if (offlineReady && !recovery && snapshot) await vaultRef.current?.save(snapshot);
      await vaultRef.current?.flush();
    } catch { setOfflineStatus(isArabic ? "تعذر إنهاء الحفظ المحلي. لم يتم القفل." : "L’enregistrement local a échoué. Le document reste déverrouillé."); return; }
    vaultRef.current?.lock(); setOfflineUnlocked(false); setOfflineReady(false); setRecovery(null);
    setOfflineStatus(isArabic ? "التخزين المحلي مقفل. التعديلات الجديدة لن تُحفظ على الجهاز." : "Stockage local verrouillé. Les nouvelles modifications ne seront pas enregistrées sur cet appareil.");
  }
  async function clearOffline() {
    try {
      await vaultRef.current?.clear(); setOfflineConfigured(false); setOfflineUnlocked(false); setOfflineReady(false); setRecovery(null);
      setOfflineStatus(isArabic ? "تم مسح النسخ المحلية لهذا الحساب. بيانات الخادم محفوظة." : "Copies locales de ce compte effacées. Les documents du serveur sont conservés.");
    } catch { setOfflineStatus(isArabic ? "تعذر المسح المحلي. أغلق علامات التبويب الأخرى وأعد المحاولة." : "Échec de l’effacement local. Fermez les autres onglets puis réessayez."); }
  }

  useEffect(() => {
    if (!offlineEnabled || !offlineUnlocked || !offlineReady || !document || recovery) return;
    const snapshot = currentOfflineDraft(dirtyRef.current);
    if (!snapshot) return;
    const timer = window.setTimeout(() => {
      void vaultRef.current?.save(snapshot).then(() => setOfflineStatus(isArabic ? "حُفظت نسخة محلية مشفّرة. المزامنة مع الخادم منفصلة." : "Copie locale chiffrée enregistrée. La synchronisation serveur est distincte.")).catch(() => {
        setOfflineStatus(isArabic ? "لم يُحفظ التعديل محلياً. قد تكون المساحة ممتلئة أو التخزين مقفلاً." : "Échec de la copie locale. Le stockage est peut-être plein ou verrouillé.");
      });
    }, 150);
    return () => window.clearTimeout(timer);
  // The complete snapshot must be persisted when any field or revision changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, richDocument, secondary, answers, revision, dirty, document, offlineUnlocked, offlineReady, recovery, isArabic, offlineEnabled]);

  function applyDocument(item: OfflineDocument, pending: boolean, expectedRevision = item.revision) {
    setDocument(item); setTitle(item.title); setBody(item.content.body); setRichDocument(item.content.richDocument); setSecondary(item.content.secondary); setDocumentLocale(item.content.locale); setAnswers(item.content.answers);
    latest.current = { title: item.title, body: item.content.body, richDocument: item.content.richDocument, secondary: item.content.secondary, locale: item.content.locale, answers: item.content.answers };
    revisionRef.current = expectedRevision; setRevision(expectedRevision); loaded.current = true;
    dirtyRef.current = pending; setDirty(pending);
  }

  const loadServerVersion = useCallback(async (): Promise<EditorData | null> => {
    try {
      const response = await fetch(`/api/v1/me/documents/${documentId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Server unavailable");
      const item = result.document as EditorData;
      setServerDocument(item);
      return item;
    } catch { setError(isArabic ? "تعذر جلب نسخة الخادم. التعديلات المحلية محفوظة؛ أعد المحاولة عند الاتصال." : "Impossible de lire la version serveur. Les modifications locales sont conservées ; réessayez connecté."); return null; }
  }, [documentId, isArabic]);

  async function resolveVersion(choice: "server" | "local" | "copy") {
    if (resolving) return;
    setResolving(true);
    try {
      const local = recovery ?? currentOfflineDraft(true);
      if (!local) return;
      const remote = await loadServerVersion();
      if (!remote) {
        // Explicit recovery is possible without a network; later sync still uses the original revision.
        if (choice === "local" && recovery) { applyDocument(local.document, true, local.expectedRevision); setRecovery(null); setOfflineReady(true); }
        return;
      }
      if (choice === "copy") {
        const copied = await fetch(`/api/v1/me/documents/${documentId}/duplicate`, { method: "POST" });
        const copy = await copied.json();
        if (!copied.ok) throw new Error(copy.message ?? "Copy failed");
        const suffix = isArabic ? " (نسخة محلية)" : " (copie locale)";
        const copiedTitle = local.document.title.slice(0, 240 - suffix.length) + suffix;
        const saved = await fetch(`/api/v1/me/documents/${copy.id}/revisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: copy.revision, title: copiedTitle, content: local.document.content }) });
        if (!saved.ok) throw new Error(isArabic ? "أُنشئت نسخة لكن تعذر نقل التعديلات. بياناتك المحلية محفوظة." : "Une copie a été créée, mais le transfert des modifications a échoué. Votre version locale est conservée.");
        if (vaultRef.current?.unlocked) await vaultRef.current.save({ document: remote, expectedRevision: remote.revision, pending: false, savedAt: new Date().toISOString() });
        dirtyRef.current = false; setDirty(false);
        window.location.assign(`/${locale}/mes-documents/${copy.id}`); return;
      }
      const pending = choice === "local";
      if (pending && remote.status !== "draft") {
        setError(isArabic ? "الوثيقة مقفلة. أنشئ نسخة مستقلة للاحتفاظ بتعديلاتك المحلية." : "Le document est verrouillé. Créez une copie indépendante pour conserver vos modifications locales.");
        return;
      }
      if (pending && recoveryDecision(local, remote.revision) === "conflict" && !window.confirm(isArabic ? "حفظ النص المحلي في نسخة جديدة فوق أحدث نسخة خادم؟ تبقى نسخة الخادم في السجل." : "Enregistrer votre texte local dans une nouvelle révision à partir de la version serveur actuelle ? La version serveur restera dans l’historique.")) return;
      applyDocument(pending ? local.document : remote, pending, remote.revision);
      conflictRef.current = false; setConflict(false); setRecovery(null); setOfflineReady(offlineUnlocked); setError("");
      setMessage(pending ? (isArabic ? "تم اختيار النسخة المحلية؛ ستُحفظ كمراجعة جديدة." : "Version locale choisie ; elle sera enregistrée comme nouvelle révision.") : (isArabic ? "تم الاحتفاظ بنسخة الخادم" : "Version serveur conservée"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erreur"); }
    finally { setResolving(false); }
  }

  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/me/documents/${documentId}`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Document not found.");
      if (!active) return;
      const item = result.document as EditorData;
      setDocument(item); setTitle(item.title); setBody(item.content.body); setRichDocument(item.content.richDocument); setSecondary(item.content.secondary); setDocumentLocale(item.content.locale); setAnswers(item.content.answers); setRevision(item.revision);
      latest.current = { title: item.title, body: item.content.body, richDocument: item.content.richDocument, secondary: item.content.secondary, locale: item.content.locale, answers: item.content.answers };
      revisionRef.current = item.revision; loaded.current = true;
      setMessage(isArabic ? "تم الحفظ" : "Enregistré");
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Erreur"); });
    return () => { active = false; };
  }, [documentId, isArabic]);

  const save = useCallback(async () => {
    if (!alive.current || !loaded.current || !dirtyRef.current || conflictRef.current) return;
    if (saving.current) { queued.current = true; return; }
    saving.current = true;
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    let retryable = true;
    const snapshot = latest.current;
    const expectedRevision = revisionRef.current;
    setMessage(isArabic ? "جارٍ الحفظ…" : "Enregistrement…"); setError("");
    try {
      const response = await fetch(`/api/v1/me/documents/${documentId}/revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision, title: snapshot.title, content: { locale: snapshot.locale, body: snapshot.body, richDocument: snapshot.richDocument, secondary: snapshot.secondary, answers: snapshot.answers } }),
      });
      const result = await response.json();
      if (!alive.current) return;
      retryable = response.status >= 500 || response.status === 429;
      if (!response.ok) {
        if (response.status === 409 && (result.code === "REVISION_CONFLICT" || result.code === "INVALID_STATE")) { conflictRef.current = true; setConflict(true); void loadServerVersion(); }
        throw new Error(result.message ?? (isArabic ? "تعذر الحفظ." : "Échec de l’enregistrement."));
      }
      retryDelay.current = 2000; revisionRef.current = result.revision; setRevision(result.revision);
      if (latest.current.title === snapshot.title && latest.current.body === snapshot.body && JSON.stringify(latest.current.richDocument) === JSON.stringify(snapshot.richDocument) && JSON.stringify(latest.current.secondary) === JSON.stringify(snapshot.secondary) && JSON.stringify(latest.current.answers) === JSON.stringify(snapshot.answers)) {
        dirtyRef.current = false; setDirty(false); setMessage(isArabic ? "تم الحفظ" : "Enregistré");
      } else { queued.current = true; }
    } catch (reason) {
      if (!alive.current) return;
      setError(reason instanceof Error ? reason.message : "Erreur"); setMessage(isArabic ? "تعذر الحفظ" : "Échec de l’enregistrement");
    } finally {
      saving.current = false;
      if (!alive.current) return;
      if (queued.current) { queued.current = false; retryTimer.current = window.setTimeout(() => void save(), 100); }
      else if (retryable && dirtyRef.current && !conflictRef.current && navigator.onLine) {
        retryTimer.current = window.setTimeout(() => void save(), retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, 30000);
      }
    }
  }, [documentId, isArabic, loadServerVersion]);

  useEffect(() => {
    if (!dirty || conflict || recovery) return;
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
  }, [title, body, richDocument, secondary, answers, dirty, conflict, recovery, save]);

  useEffect(() => {
    const onOnline = () => { if (dirtyRef.current && !conflictRef.current && !recovery) void save(); };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [save, recovery]);

  function markDirty() { dirtyRef.current = true; setDirty(true); }
  function updateTitle(value: string) { latest.current = { ...latest.current, title: value }; setTitle(value); markDirty(); }
  function updateBody(value: string) { latest.current = { ...latest.current, body: value }; setBody(value); markDirty(); }
  function updateAnswer(key: string, value: unknown) {
    const next = { ...latest.current.answers, [key]: value };
    latest.current = { ...latest.current, answers: next }; setAnswers(next); markDirty();
  }

  function updateRichDocument(value: RichDocument) {
    const rawBody = richDocumentText(value);
    latest.current = { ...latest.current, body: rawBody, richDocument: value };
    setBody(rawBody); setRichDocument(value); markDirty();
  }
  function enableRichDocument() {
    try { updateRichDocument(richDocumentFromText(body)); }
    catch { setError(isArabic ? "تعذر تنسيق النص؛ تحقق من حجمه." : "Mise en forme impossible : vérifiez la taille du texte."); }
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
    latest.current = { title: content.title, body: content.body, richDocument: content.richDocument, secondary: content.secondary, locale: content.locale, answers: content.answers };
    setTitle(content.title); setBody(content.body); setRichDocument(content.richDocument); setSecondary(content.secondary); setDocumentLocale(content.locale); setAnswers(content.answers);
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

  let previewAnswers = answers;
  try { if (document?.formSchema) previewAnswers = resolveFormAnswers(document.formSchema, answers); } catch { /* Keep incomplete forms editable. */ }

  const localComparison = recovery?.document ?? (document ? { ...document, title, content: { locale: documentLocale, body, richDocument, secondary, answers } } : null);
  function comparisonPreview(item: OfflineDocument | null) {
    if (!item) return <p>{isArabic ? "غير متاحة دون اتصال" : "Indisponible hors ligne"}</p>;
    let values = item.content.answers;
    try { if (item.formSchema) values = resolveFormAnswers(item.formSchema, values); } catch { /* Preserve incomplete input. */ }
    return <div style={{ maxHeight: "20rem", overflow: "auto" }} tabIndex={0}>
      <div lang={item.content.locale} dir={item.content.locale === "ar" ? "rtl" : "ltr"}>{item.content.richDocument ? <div dangerouslySetInnerHTML={{ __html: richDocumentHtml(item.content.richDocument, values, item.content.locale) }} /> : <pre style={{ whiteSpace: "pre-wrap" }}>{renderTemplateText(item.content.body, values)}</pre>}</div>
      {item.content.secondary && <div lang={item.content.secondary.locale} dir={item.content.secondary.locale === "ar" ? "rtl" : "ltr"}><h4>{item.content.secondary.title}</h4>{item.content.secondary.richDocument ? <div dangerouslySetInnerHTML={{ __html: richDocumentHtml(item.content.secondary.richDocument, values, item.content.secondary.locale) }} /> : <pre style={{ whiteSpace: "pre-wrap" }}>{renderTemplateText(item.content.secondary.body, values)}</pre>}</div>}
    </div>;
  }

  return <div className="document-editor-wrap">
    <Link className="back-link" href={`/${locale}/mes-documents`}>← {isArabic ? "العودة إلى وثائقي" : "Retour à mes documents"}</Link>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
    <OfflineControls enabled={offlineEnabled} locale={isArabic ? "ar" : "fr"} configured={offlineConfigured} unlocked={offlineUnlocked} busy={offlineBusy} status={offlineStatus} onUnlock={unlockOffline} onLock={() => void lockOffline()} onClear={clearOffline} />
    {offlineConfigured && <p><a href={`/${locale}/hors-ligne#account=${encodeURIComponent(ownerId)}&document=${encodeURIComponent(documentId)}`}>{isArabic ? "فتح مساحة العمل دون اتصال (احفظ هذا الرابط على الجهاز)" : "Ouvrir l’espace hors ligne (conservez ce lien sur cet appareil)"}</a></p>}
    {(conflict || recovery) && <section className="auth-card" aria-label={isArabic ? "حل تعارض النسخ" : "Résolution des versions"}>
      <h2>{isArabic ? "اختر النسخة قبل المتابعة" : "Choisir une version avant de poursuivre"}</h2>
      <p>{isArabic ? "لم تُستبدل أي نسخة. قارن التعديلات ثم اختر نسخة الخادم أو النسخة المحلية أو نسخة مستقلة." : "Aucune version n’a été écrasée. Comparez puis choisissez le serveur, votre version locale ou une copie indépendante."}</p>
      <div className="document-editor-grid"><div><h3>{isArabic ? "النسخة المحلية" : "Votre version locale"}</h3><p>{recovery?.document.title ?? title}</p>{comparisonPreview(localComparison)}</div><div><h3>{serverDocument ? (isArabic ? "نسخة الخادم" : "Version serveur") : (isArabic ? "النسخة المحمّلة (بانتظار التحقق)" : "Version chargée (vérification en cours)")}</h3><p>{serverDocument?.title ?? document?.title}</p>{comparisonPreview(serverDocument ?? document)}</div></div>
      <div className="document-editor-actions"><button className="button button-quiet" type="button" disabled={resolving} onClick={() => void resolveVersion("server")}>{isArabic ? "الاحتفاظ بنسخة الخادم" : "Conserver le serveur"}</button><button className="button button-quiet" type="button" disabled={resolving} onClick={() => void resolveVersion("local")}>{isArabic ? "استخدام النسخة المحلية" : "Utiliser ma version locale"}</button><button className="button" type="button" disabled={resolving} onClick={() => void resolveVersion("copy")}>{isArabic ? "إنشاء نسخة مستقلة" : "Créer une copie indépendante"}</button></div>
    </section>}
    {!document ? <div className="empty-state"><p>{message}</p></div> : <>
      <div className="document-editor-heading"><div><div className="eyebrow">{isArabic ? "مسودة خاصة" : "BROUILLON PRIVÉ"}</div><h1>{isArabic ? "محرر الوثيقة" : "Éditeur de document"}</h1></div><div className="document-editor-actions"><div className="document-save-state" role="status">{dirty ? (isArabic ? "تعديلات غير محفوظة" : "Modifications en cours…") : message} · {isArabic ? `النسخة ${revision}` : `Version ${revision}`}</div><button className="button button-quiet" type="button" onClick={() => void toggleHistory()}>{isArabic ? "السجل" : "Historique"}</button><button className="button button-quiet" type="button" onClick={() => window.print()}>{isArabic ? "طباعة / PDF" : "Imprimer / PDF"}</button><a className={`button ${dirty ? "button-disabled" : ""}`} aria-disabled={dirty} onClick={(event) => { if (dirty) event.preventDefault(); }} href={`/api/v1/me/documents/${documentId}/exports/docx`}>{isArabic ? "تنزيل Word" : "Télécharger Word"}</a></div></div>
      <ShareManager documentId={documentId} revision={revision} locale={isArabic ? "ar" : "fr"} disabled={dirty || conflict || Boolean(recovery)} />
      {!dirty && !conflict && !recovery && <><ExportManager documentId={documentId} locale={isArabic ? "ar" : "fr"} /><SignRequestManager documentId={documentId} revision={revision} locale={isArabic ? "ar" : "fr"} /></>}
      {showHistory && <section className="revision-history"><h2>{isArabic ? "النسخ السابقة" : "Versions précédentes"}</h2>{history.map((item) => <article className="revision-row" key={item.revision}><span>{isArabic ? `النسخة ${item.revision}` : `Version ${item.revision}`} · {new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</span>{item.revision !== revision && <button className="text-link" type="button" onClick={() => void restore(item.revision)}>{isArabic ? "استعادة" : "Restaurer"}</button>}</article>)}</section>}
      <div className="document-editor-grid"><section className="auth-card document-edit-card"><label className="profile-field">{isArabic ? "العنوان" : "Titre"}<input maxLength={240} disabled={conflict || Boolean(recovery) || document.status !== "draft"} value={title} onChange={(event) => updateTitle(event.target.value)} /></label>{document.formSchema?.fields.length ? <fieldset className="document-form-fields" disabled={conflict || Boolean(recovery) || document.status !== "draft"}><legend>{isArabic ? "معلومات الوثيقة" : "Informations du document"}</legend>{document.formSchema.fields.some((field) => field.kind === "profile") && <div className="profile-prefill"><button className="button button-quiet" type="button" onClick={() => void loadProfiles()}>{isArabic ? "ملء من ملف شخصي" : "Préremplir depuis un profil"}</button>{showProfiles && <select aria-label={isArabic ? "اختر ملفاً شخصياً" : "Choisir un profil"} defaultValue="" onChange={(event) => fillFromProfile(event.target.value)}><option value="">{isArabic ? "اختر شخصاً" : "Choisir une personne"}</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.data.fullName}</option>)}</select>}</div>}<RichFormFields schema={document.formSchema} answers={answers} locale={isArabic ? "ar" : "fr"} disabled={conflict || Boolean(recovery) || document.status !== "draft"} onChange={(next) => { latest.current = { ...latest.current, answers: next }; setAnswers(next); markDirty(); }} /></fieldset> : null}{richDocument && document.documentType === "editable" ? <RichDocumentEditor value={richDocument} locale={documentLocale} answers={previewAnswers} disabled={conflict || Boolean(recovery) || document.status !== "draft"} onChange={updateRichDocument} /> : <><label className="profile-field">{isArabic ? "نص الوثيقة" : "Texte du document"}<textarea className="document-body-input" disabled={conflict || Boolean(recovery) || document.status !== "draft"} dir={documentLocale === "ar" ? "rtl" : "ltr"} value={body} readOnly={document.documentType !== "editable"} onChange={(event) => updateBody(event.target.value)} /></label>{document.documentType === "editable" && <button className="button button-quiet" type="button" disabled={conflict || Boolean(recovery) || document.status !== "draft"} onClick={enableRichDocument}>{isArabic ? "تفعيل تنسيق الفقرات والجداول" : "Activer la mise en forme des paragraphes et tableaux"}</button>}</>}{secondary && <SecondaryDocumentEditor value={secondary} locale={isArabic ? "ar" : "fr"} answers={previewAnswers} editable={document.documentType === "editable"} disabled={conflict || Boolean(recovery) || document.status !== "draft"} onChange={(value) => { latest.current = { ...latest.current, secondary: value }; setSecondary(value); markDirty(); }} />}<button className="button" type="button" onClick={() => void save()} disabled={!dirty || conflict || Boolean(recovery) || document.status !== "draft"}>{isArabic ? "حفظ الآن" : "Enregistrer maintenant"}</button><p className="form-hint">{isArabic ? "يتم حفظ تعديلاتك تلقائياً وتشفيرها في التخزين." : "Les modifications sont enregistrées automatiquement et chiffrées au stockage."}</p></section><section className="document-preview"><div className="eyebrow">{isArabic ? "معاينة" : "APERÇU"}</div><h2>{title || (isArabic ? "عنوان الوثيقة" : "Titre du document")}</h2>{richDocument ? <div dir={documentLocale === "ar" ? "rtl" : "ltr"} className="template-body" dangerouslySetInnerHTML={{ __html: richDocumentHtml(richDocument, previewAnswers, documentLocale) }} /> : <div dir={documentLocale === "ar" ? "rtl" : "ltr"} className="template-body">{renderTemplateText(body || (documentLocale === "ar" ? "سيظهر نص الوثيقة هنا." : "Le texte du document apparaîtra ici."), previewAnswers)}</div>}{secondary && <section lang={secondary.locale} dir={secondary.locale === "ar" ? "rtl" : "ltr"}><h2>{secondary.title}</h2>{secondary.richDocument ? <div className="template-body" dangerouslySetInnerHTML={{ __html: richDocumentHtml(secondary.richDocument, previewAnswers, secondary.locale) }} /> : <div className="template-body">{renderTemplateText(secondary.body, previewAnswers)}</div>}</section>}</section></div>
    </>}
  </div>;
}
