"use client";

import { useState } from "react";

export function OfflineControls({ locale, configured, unlocked, status, busy, enabled = true, onUnlock, onLock, onClear }: {
  locale: "fr" | "ar"; configured: boolean; unlocked: boolean; status: string; busy: boolean; enabled?: boolean;
  onUnlock: (secret: string, create: boolean) => Promise<void>; onLock: () => void; onClear: () => Promise<void>;
}) {
  const ar = locale === "ar";
  const [secret, setSecret] = useState("");
  const [consent, setConsent] = useState(false);
  return <details className="auth-card" style={{ marginBlock: "1rem" }}>
    <summary>{ar ? "الحفظ المحلي المشفّر على هذا الجهاز" : "Brouillons hors ligne chiffrés sur cet appareil"}</summary>
    <p className="form-hint">{ar ? "اختياري لجهاز موثوق فقط. يحتفظ هذا المتصفح بنسخة مشفّرة من هذه الوثيقة. لا تُحفظ كلمة السر ولا يمكن استرجاعها. قد يحذف المتصفح البيانات؛ هذه ليست نسخة احتياطية. افتح المحرّر أثناء الاتصال قبل العمل دون شبكة." : "Facultatif, sur un appareil de confiance. Ce navigateur conserve une copie chiffrée de ce document. Le secret reste en mémoire et ne peut pas être récupéré. Le navigateur peut effacer les données : ce cache n’est pas une sauvegarde. Ouvrez l’éditeur connecté avant de travailler sans réseau."}</p>
    {!enabled && <p>{ar ? "التخزين المحلي معطل حالياً. يمكنك مسح النسخ الموجودة." : "Le stockage local est désactivé. Vous pouvez effacer les copies existantes."}</p>}
    {enabled && (unlocked ? <button className="button button-quiet" type="button" onClick={onLock}>{ar ? "قفل التخزين المحلي" : "Verrouiller le stockage local"}</button> : <form onSubmit={(event) => { event.preventDefault(); const value = secret; setSecret(""); void onUnlock(value, !configured); }}>
      {!configured && <label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />{ar ? "أوافق على حفظ هذه الوثيقة محلياً على جهاز موثوق" : "J’autorise une copie locale de ce document sur cet appareil de confiance"}</label>}
      <label className="profile-field">{ar ? "سر محلي (12 حرفاً على الأقل)" : "Secret local (12 caractères minimum)"}<input type="password" autoComplete="off" minLength={12} required value={secret} onChange={(event) => setSecret(event.target.value)} /></label>
      <button className="button button-quiet" type="submit" disabled={busy || (!configured && !consent)}>{configured ? (ar ? "فتح التخزين" : "Déverrouiller") : (ar ? "تفعيل لهذه الوثيقة" : "Activer pour ce document")}</button>
    </form>)}
    {configured && <button className="button button-quiet" style={{ marginInlineStart: "0.5rem" }} type="button" disabled={busy} onClick={() => { if (window.confirm(ar ? "حذف جميع النسخ المحلية لهذا الحساب من هذا الجهاز؟ لن تتغير بيانات الخادم." : "Effacer les brouillons locaux de ce compte sur cet appareil ? Les documents du serveur seront conservés.")) void onClear(); }}>{ar ? "مسح النسخ المحلية لهذا الحساب" : "Effacer les copies locales de ce compte"}</button>}
    {status && <p role="status" className="form-hint">{status}</p>}
  </details>;
}
