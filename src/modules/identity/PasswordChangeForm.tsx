"use client";

import { FormEvent, useState } from "react";

export function PasswordChangeForm({ locale }: { locale: "fr" | "ar" }) {
  const isArabic = locale === "ar";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmation) {
      setError(isArabic ? "كلمتا المرور غير متطابقتين." : "Les nouveaux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/v1/me/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json() as { code?: string };
      if (!response.ok) {
        setError(result.code === "RATE_LIMITED"
          ? (isArabic ? "محاولات كثيرة. حاول لاحقاً." : "Trop de tentatives. Réessayez plus tard.")
          : result.code === "INVALID_INPUT"
            ? (isArabic ? "يجب أن تتكون كلمة المرور الجديدة من 12 حرفاً على الأقل وأن تختلف عن الحالية." : "Le nouveau mot de passe doit compter au moins 12 caractères et différer de l’ancien.")
            : (isArabic ? "تعذر التغيير. تحقق من كلمة المرور الحالية." : "Impossible de modifier le mot de passe. Vérifiez le mot de passe actuel."));
        setBusy(false); return;
      }
      window.location.assign(`/${locale}/connexion`);
    } catch {
      setError(isArabic ? "تعذر الاتصال بالخادم." : "Impossible de joindre le serveur.");
      setBusy(false);
    }
  }

  return <section className="auth-card account-password-card">
    <div className="eyebrow">{isArabic ? "أمان الحساب" : "SÉCURITÉ DU COMPTE"}</div>
    <h2>{isArabic ? "تغيير كلمة المرور" : "Changer mon mot de passe"}</h2>
    <p>{isArabic ? "سيتم تسجيل خروج جميع الجلسات بعد التغيير." : "Toutes les sessions seront déconnectées après le changement."}</p>
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="current-password">{isArabic ? "كلمة المرور الحالية" : "Mot de passe actuel"}</label>
      <input id="current-password" type="password" autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
      <label htmlFor="new-password">{isArabic ? "كلمة المرور الجديدة" : "Nouveau mot de passe"}</label>
      <input id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
      <label htmlFor="confirm-password">{isArabic ? "تأكيد كلمة المرور الجديدة" : "Confirmer le nouveau mot de passe"}</label>
      <input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy}>{busy ? (isArabic ? "جارٍ التحديث…" : "Mise à jour…") : (isArabic ? "تحديث كلمة المرور" : "Mettre à jour")}</button>
    </form>
  </section>;
}
