"use client";

import { FormEvent, useState } from "react";

export function AccountDeletionForm({ locale }: { locale: "fr" | "ar" }) {
  const isArabic = locale === "ar";
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/v1/me/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation: confirmed }),
      });
      const result = await response.json() as { code?: string };
      if (!response.ok) {
        setError(result.code === "ACCOUNT_HAS_CATALOG_CONTRIBUTIONS"
          ? (isArabic ? "يرتبط هذا الحساب بسجلات في الفهرس ويجب نقلها قبل الحذف." : "Ce compte est rattaché à des modèles du catalogue ; leur transfert est nécessaire avant la suppression.")
          : result.code === "RATE_LIMITED"
            ? (isArabic ? "محاولات كثيرة. حاول لاحقاً." : "Trop de tentatives. Réessayez plus tard.")
            : (isArabic ? "تعذر حذف الحساب. تحقق من كلمة المرور وحاول مجدداً." : "Suppression impossible. Vérifiez le mot de passe et réessayez."));
        setBusy(false);
        return;
      }
      window.location.assign(`/${locale}`);
    } catch {
      setError(isArabic ? "تعذر الاتصال بالخادم." : "Impossible de joindre le serveur.");
      setBusy(false);
    }
  }

  return <section className="auth-card account-delete-card">
    <div className="eyebrow destructive">{isArabic ? "إجراء نهائي" : "ACTION DÉFINITIVE"}</div>
    <h2>{isArabic ? "حذف الحساب" : "Supprimer mon compte"}</h2>
    <p>{isArabic ? "سيؤدي ذلك إلى حذف الملفات الشخصية والوثائق والمسودات والملفات. لا يمكن التراجع عن هذا الإجراء." : "Cette action supprime votre compte, vos profils, documents, brouillons et dossiers. Elle est irréversible."}</p>
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="delete-password">{isArabic ? "كلمة المرور الحالية" : "Mot de passe actuel"}</label>
      <input id="delete-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} />
      <label className="consent-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required />{isArabic ? "أؤكد حذف حسابي نهائياً." : "Je confirme la suppression définitive de mon compte."}</label>
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      <button className="button button-danger" type="submit" disabled={busy}>{busy ? (isArabic ? "جارٍ الحذف…" : "Suppression…") : (isArabic ? "حذف الحساب نهائياً" : "Supprimer définitivement le compte")}</button>
    </form>
  </section>;
}
