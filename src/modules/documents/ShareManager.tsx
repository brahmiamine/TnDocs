"use client";

import { useCallback, useEffect, useState } from "react";

type Share = { id: string; revision: number; createdAt: string; expiresAt: string; revokedAt: string | null };

export function ShareManager({ documentId, locale, disabled }: { documentId: string; locale: "fr" | "ar"; disabled: boolean }) {
  const isArabic = locale === "ar";
  const [shares, setShares] = useState<Share[]>([]);
  const [days, setDays] = useState(7);
  const [newUrl, setNewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/v1/me/documents/${documentId}/shares`, { cache: "no-store" });
    if (!response.ok) throw new Error(isArabic ? "تعذر تحميل روابط المشاركة." : "Impossible de charger les liens de partage.");
    const result = await response.json() as { shares: Share[] };
    setShares(result.shares);
  }, [documentId, isArabic]);

  useEffect(() => { void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Erreur")); }, [refresh]);

  async function createShare() {
    setBusy(true); setError(""); setMessage(""); setNewUrl("");
    try {
      const response = await fetch(`/api/v1/me/documents/${documentId}/shares`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: days, locale }),
      });
      const result = await response.json() as { url?: string };
      if (!response.ok || !result.url) throw new Error(isArabic ? "تعذر إنشاء الرابط." : "Impossible de créer le lien.");
      setNewUrl(result.url);
      setMessage(isArabic ? "الرابط يعرض نسخة ثابتة للقراءة فقط." : "Le lien affiche cette révision en lecture seule.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (isArabic ? "تعذر إنشاء الرابط." : "Impossible de créer le lien."));
    } finally { setBusy(false); }
  }

  async function revoke(shareId: string) {
    const response = await fetch(`/api/v1/me/documents/${documentId}/shares/${shareId}`, { method: "DELETE" });
    if (!response.ok) { setError(isArabic ? "تعذر إلغاء الرابط." : "Impossible de révoquer le lien."); return; }
    setNewUrl("");
    await refresh();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(newUrl);
      setMessage(isArabic ? "تم نسخ الرابط." : "Lien copié.");
    } catch {
      setError(isArabic ? "تعذر النسخ. انسخ الرابط يدوياً." : "Copie impossible. Copiez le lien manuellement.");
    }
  }

  return <section className="revision-history share-manager">
    <h2>{isArabic ? "مشاركة للقراءة فقط" : "Partager en lecture seule"}</h2>
    <p>{isArabic ? "سيتمكن أي شخص لديه الرابط من قراءة هذه النسخة. لا تشارك بيانات لا تريد كشفها." : "Toute personne qui possède le lien pourra lire cette révision. Évitez d’y inclure des données que vous ne souhaitez pas divulguer."}</p>
    <div className="share-create-row">
      <label htmlFor="share-expiry">{isArabic ? "مدة الصلاحية" : "Expiration"}</label>
      <select id="share-expiry" value={days} onChange={(event) => setDays(Number(event.target.value))}>
        <option value={1}>{isArabic ? "يوم واحد" : "1 jour"}</option>
        <option value={7}>{isArabic ? "7 أيام" : "7 jours"}</option>
        <option value={30}>{isArabic ? "30 يوماً" : "30 jours"}</option>
      </select>
      <button className="button button-quiet" type="button" disabled={disabled || busy} onClick={() => void createShare()}>
        {busy ? (isArabic ? "جارٍ الإنشاء…" : "Création…") : (isArabic ? "إنشاء رابط" : "Créer un lien")}
      </button>
    </div>
    {disabled && <p className="form-hint">{isArabic ? "احفظ التعديلات قبل إنشاء رابط." : "Enregistrez les modifications avant de créer un lien."}</p>}
    {newUrl && <div className="share-link-box"><input aria-label={isArabic ? "رابط المشاركة" : "Lien de partage"} readOnly value={newUrl} /><button className="text-link" type="button" onClick={() => void copyLink()}>{isArabic ? "نسخ" : "Copier"}</button></div>}
    {error && <p className="form-message form-error" role="alert">{error}</p>}{message && <p className="form-message form-success" role="status">{message}</p>}
    {shares.length > 0 && <div className="share-list">{shares.map((share) => {
      const expired = new Date(share.expiresAt).getTime() <= Date.now();
      const revoked = Boolean(share.revokedAt);
      return <article className="revision-row" key={share.id}>
        <span>{isArabic ? `النسخة ${share.revision}` : `Révision ${share.revision}`} · {revoked ? (isArabic ? "ملغى" : "Révoqué") : expired ? (isArabic ? "منتهي" : "Expiré") : (isArabic ? "نشط" : "Actif")} · {new Intl.DateTimeFormat(isArabic ? "ar-TN" : "fr-FR", { dateStyle: "medium" }).format(new Date(share.expiresAt))}</span>
        {!revoked && !expired && <button className="text-link destructive" type="button" onClick={() => void revoke(share.id)}>{isArabic ? "إلغاء" : "Révoquer"}</button>}
      </article>;
    })}</div>}
  </section>;
}
