"use client";
import { useCallback, useEffect, useState } from "react";
type Permissions = { view: boolean; copy: boolean; edit: boolean };
type Share = { id: string; revision: number; permissions: Permissions | null; recipientEmail: string | null; legacyDisabled: boolean; createdAt: string; expiresAt: string; revokedAt: string | null; events: Array<{ action: string; revision: number; createdAt: string }> };

export function ShareManager({ documentId, revision, locale, disabled }: { documentId: string; revision: number; locale: "fr" | "ar"; disabled: boolean }) {
  const ar = locale === "ar";
  const [shares, setShares] = useState<Share[]>([]);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [permissions, setPermissions] = useState<Permissions>({ view: true, copy: false, edit: false });
  const [newUrl, setNewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/v1/me/documents/${documentId}/shares`, { cache: "no-store" });
    if (!response.ok) throw new Error(ar ? "تعذر تحميل المشاركات." : "Impossible de charger les partages.");
    const result = await response.json(); setShares(result.shares);
  }, [documentId, ar]);
  useEffect(() => { void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Erreur")); }, [refresh]);
  async function createShare(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage(""); setNewUrl("");
    try {
      const response = await fetch(`/api/v1/me/documents/${documentId}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientEmail, expectedRevision: revision, expiresAt: new Date(expiresAt).toISOString(), locale, permissions }) });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.code === "REVISION_CONFLICT" ? (ar ? "تغيرت الوثيقة. أعد تحميلها قبل المشاركة." : "Le document a changé. Rechargez-le avant de partager.") : (ar ? "تعذر إنشاء المشاركة. تحقق من البريد والتاريخ والصلاحيات." : "Création impossible. Vérifiez le destinataire, l’expiration et les droits."));
      setNewUrl(result.url);
      setMessage(ar ? "تم إنشاء رابط مخصص. أرسله للمستلم؛ يلزمه تسجيل الدخول بحساب بريده المؤكد." : "Lien nominatif créé. Transmettez-le au destinataire ; il devra se connecter avec ce compte email vérifié.");
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erreur"); }
    finally { setBusy(false); }
  }
  async function revoke(shareId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/me/documents/${documentId}/shares/${shareId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(ar ? "تعذر إلغاء المشاركة." : "Impossible de révoquer le partage.");
      setNewUrl(""); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erreur"); }
    finally { setBusy(false); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(newUrl); setMessage(ar ? "تم نسخ الرابط." : "Lien copié."); }
    catch { setError(ar ? "انسخ الرابط يدوياً." : "Copiez le lien manuellement."); }
  }
  const labels: Record<keyof Permissions, string> = { view: ar ? "عرض" : "Consulter", copy: ar ? "نسخ إلى حسابه" : "Copier dans son compte", edit: ar ? "تعديل الوثيقة المشتركة" : "Modifier le document partagé" };
  const eventLabels: Record<string, string> = { viewed: ar ? "فتح" : "Consultation", copied: ar ? "نسخ" : "Copie", edited: ar ? "تعديل" : "Modification" };
  return <section className="revision-history share-manager">
    <h2>{ar ? "مشاركة خاصة باسم المستلم" : "Partage privé nominatif"}</h2>
    <p>{ar ? "الرابط وحده لا يكفي. يلزم تسجيل الدخول بالبريد المؤكد المحدد. العرض والنسخ والتعديل صلاحيات منفصلة؛ التعديل يتيح قراءة النص دون منح النسخ إلى حساب آخر." : "Le lien seul ne donne aucun accès : le destinataire doit utiliser le compte email vérifié désigné. Consultation, copie et modification sont distinctes ; modifier permet de lire le texte sans autoriser sa copie dans un autre compte."}</p>
    <p className="form-hint">{ar ? "العرض والنسخ يستخدمان النسخة المشتركة. التعديل يضيف نسخة جديدة ولا يغير السجل. إذا تغيرت الوثيقة خارج هذه المشاركة، يُرفض التعديل حتى تنشئ مشاركة جديدة." : "Consultation et copie utilisent la révision partagée. Une modification ajoute une nouvelle révision sans altérer l’historique. Si le document change ailleurs, l’édition est bloquée jusqu’à la création d’un nouveau partage."}</p>
    <form onSubmit={createShare}><fieldset disabled={disabled || busy}>
      <legend>{ar ? `مشاركة النسخة ${revision}` : `Partager la révision ${revision}`}</legend>
      <label className="profile-field">{ar ? "بريد المستلم" : "Email du destinataire"}<input type="email" required maxLength={320} autoComplete="off" value={recipientEmail} onChange={(event) => { setRecipientEmail(event.target.value); setNewUrl(""); }} /></label>
      <label className="profile-field">{ar ? "تاريخ انتهاء الصلاحية (محلي)" : "Expiration (heure locale)"}<input type="datetime-local" required value={expiresAt} onChange={(event) => { setExpiresAt(event.target.value); setNewUrl(""); }} /></label>
      <div>{(["view", "copy", "edit"] as const).map((right) => <label className="consent-check" key={right}><input type="checkbox" checked={permissions[right]} onChange={(event) => { setPermissions((current) => ({ ...current, [right]: event.target.checked })); setNewUrl(""); }} />{labels[right]}</label>)}</div>
      <button className="button button-quiet" disabled={!permissions.view && !permissions.copy && !permissions.edit}>{busy ? (ar ? "جارٍ الإنشاء…" : "Création…") : (ar ? "إنشاء رابط مخصص" : "Créer un lien nominatif")}</button>
    </fieldset></form>
    {disabled && <p className="form-hint">{ar ? "احفظ التعديلات وحل التعارض قبل المشاركة." : "Enregistrez et résolvez les conflits avant de partager."}</p>}
    {newUrl && <div className="share-link-box"><input aria-label={ar ? "رابط المشاركة" : "Lien de partage"} readOnly value={newUrl} /><button className="text-link" type="button" onClick={() => void copyLink()}>{ar ? "نسخ" : "Copier"}</button></div>}
    {error && <p className="form-message form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {shares.map((share) => {
      const expired = new Date(share.expiresAt) <= new Date();
      return <article className="revision-row" key={share.id}><div><p><bdi>{share.recipientEmail ?? (ar ? "رابط قديم غير مخصص (معطل)" : "Ancien lien sans destinataire (désactivé)")}</bdi> · {ar ? `النسخة ${share.revision}` : `Révision ${share.revision}`}</p><p>{share.permissions && Object.entries(share.permissions).filter(([, enabled]) => enabled).map(([right]) => labels[right as keyof Permissions]).join(" · ")} · {share.legacyDisabled ? (ar ? "معطل — أنشئ مشاركة جديدة" : "Désactivé — créez un nouveau partage") : share.revokedAt ? (ar ? "ملغى" : "Révoqué") : expired ? (ar ? "منتهي" : "Expiré") : (ar ? "نشط" : "Actif")} · {new Intl.DateTimeFormat(ar ? "ar-TN" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(share.expiresAt))}</p>{share.events.length > 0 && <details><summary>{ar ? "سجل النشاط" : "Historique d’accès"}</summary><ul>{share.events.map((event, index) => <li key={index}>{eventLabels[event.action] ?? event.action} · {event.revision} · {new Date(event.createdAt).toLocaleString(ar ? "ar-TN" : "fr-FR")}</li>)}</ul></details>}</div>{!share.revokedAt && !expired && <button className="text-link destructive" type="button" disabled={busy} onClick={() => void revoke(share.id)}>{ar ? "إلغاء" : "Révoquer"}</button>}</article>;
    })}
  </section>;
}
