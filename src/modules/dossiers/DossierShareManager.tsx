"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
type Grant = { id: string; recipientEmail: string; expiresAt: string; revokedAt: string | null; allowDownload: boolean };
export function DossierShareManager({ dossierId, locale }: { dossierId: string; locale: string }) {
  const ar = locale === "ar", [shares, setShares] = useState<Grant[]>([]), [url, setUrl] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const response = await fetch(`/api/v1/me/dossiers/${dossierId}/shares`, { cache: "no-store" }); if (!response.ok) throw new Error("unavailable"); setShares((await response.json()).shares); }, [dossierId]);
  useEffect(() => { void load().catch(() => setMessage(ar ? "المشاركات غير متاحة." : "Partages indisponibles.")); }, [load, ar]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setUrl("");
    const form = new FormData(event.currentTarget);
    try {
      const expiresAt = new Date(String(form.get("expiresAt"))).toISOString();
      const response = await fetch(`/api/v1/me/dossiers/${dossierId}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientEmail: form.get("recipientEmail"), expiresAt, allowDownload: form.get("allowDownload") === "on", locale }) });
      if (!response.ok) throw new Error("unavailable"); setUrl((await response.json()).url); await load();
    } catch { setMessage(ar ? "تعذر إنشاء المشاركة. حدد بريداً صحيحاً وتاريخ انتهاء مستقبلياً." : "Partage impossible. Vérifiez l’adresse et la date future d’expiration."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    try { const response = await fetch(`/api/v1/me/dossiers/${dossierId}/shares/${id}`, { method: "DELETE" }); if (!response.ok) throw new Error("unavailable"); await load(); }
    catch { setMessage(ar ? "تعذر إلغاء المشاركة." : "Révocation impossible."); }
  }
  return <details className="auth-card"><summary>{ar ? "مشاركة الملف بالاسم" : "Partager ce dossier avec un destinataire"}</summary><p>{ar ? "يرتبط الرابط بحساب موثّق يحمل البريد المحدد. تُشارك فقط القطع الحالية وإصدارات الوثائق المثبتة؛ القطع الجديدة لا تضاف تلقائياً والمحذوفة تصبح غير متاحة." : "Le lien exige un compte vérifié à l’adresse indiquée. Seules les pièces actuelles et les révisions figées sont partagées. Les nouvelles pièces restent privées ; les pièces retirées deviennent inaccessibles."}</p><form className="auth-form" onSubmit={create}><label>{ar ? "بريد المستلم" : "Email du destinataire"}<input name="recipientEmail" type="email" required maxLength={320} autoComplete="off" /></label><label>{ar ? "انتهاء الصلاحية" : "Expiration"}<input name="expiresAt" type="datetime-local" required /></label><label><input name="allowDownload" type="checkbox" />{ar ? "السماح بتنزيل القطع وتصدير ZIP" : "Autoriser le téléchargement des pièces et l’export ZIP"}</label><button className="button" disabled={busy}>{ar ? "إنشاء الرابط" : "Créer le lien"}</button></form>{url && <label>{ar ? "انسخ الرابط وأرسله إلى المستلم فقط" : "Copiez le lien et transmettez-le uniquement au destinataire"}<input value={url} readOnly onFocus={event => event.target.select()} /><p className="form-hint">{ar ? "لن يُعرض الرابط الكامل مرة أخرى." : "Le lien complet n’est affiché qu’une fois."}</p></label>}{message && <p role="status">{message}</p>}<ul>{shares.map(share => <li key={share.id}><bdi>{share.recipientEmail}</bdi> · {new Date(share.expiresAt).toLocaleString(locale)} · {share.revokedAt ? (ar ? "ملغى" : "Révoqué") : <button type="button" onClick={() => void revoke(share.id)}>{ar ? "إلغاء" : "Révoquer"}</button>}</li>)}</ul></details>;
}
