"use client";

import { FormEvent, useState } from "react";

export function PasswordResetRequestForm({ locale }: { locale: "fr" | "ar" }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const isArabic = locale === "ar";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setStatus("");
    try {
      const response = await fetch("/api/v1/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!response.ok) throw new Error(isArabic ? "تعذر إرسال الطلب." : "Le service est momentanément indisponible.");
      setStatus(isArabic ? "إذا كان الحساب موجوداً، فستصلك رسالة لإعادة تعيين كلمة المرور." : "Si un compte correspond à cette adresse, un email de réinitialisation va vous être envoyé.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Une erreur est survenue."); }
    finally { setPending(false); }
  }
  return <section className="auth-card"><div className="eyebrow">TnDocs</div><h1>{isArabic ? "نسيت كلمة المرور؟" : "Mot de passe oublié ?"}</h1><p className="auth-intro">{isArabic ? "أدخل بريدك الإلكتروني إذا أردت إنشاء كلمة مرور جديدة." : "Indiquez votre adresse email pour recevoir un lien temporaire."}</p><form className="auth-form" onSubmit={submit}><label htmlFor="reset-email">{isArabic ? "البريد الإلكتروني" : "Adresse email"}</label><input id="reset-email" type="email" autoComplete="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} /><button className="button auth-submit" type="submit" disabled={pending}>{isArabic ? "إرسال الرابط" : "Envoyer le lien"}</button>{status && <p className="form-message form-success" role="status">{status}</p>}</form></section>;
}

export function PasswordResetForm({ locale, token }: { locale: "fr" | "ar"; token?: string }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const isArabic = locale === "ar";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); setStatus("");
    try {
      const response = await fetch("/api/v1/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setStatus(isArabic ? "تم تحديث كلمة المرور." : "Votre mot de passe a été mis à jour.");
      window.location.assign(`/${locale}/mes-documents`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Une erreur est survenue."); }
    finally { setPending(false); }
  }
  return <section className="auth-card"><div className="eyebrow">TnDocs</div><h1>{isArabic ? "اختر كلمة مرور جديدة" : "Choisissez un nouveau mot de passe"}</h1><p className="auth-intro">{isArabic ? "يجب أن تتكون كلمة المرور من 12 حرفاً على الأقل." : "12 caractères minimum. Ce lien est à usage unique."}</p><form className="auth-form" onSubmit={submit}><label htmlFor="new-password">{isArabic ? "كلمة المرور الجديدة" : "Nouveau mot de passe"}</label><input id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />{error && <p className="form-message form-error" role="alert">{error}</p>}{status && <p className="form-message form-success" role="status">{status}</p>}<button className="button auth-submit" type="submit" disabled={pending || !token}>{isArabic ? "تحديث كلمة المرور" : "Mettre à jour"}</button></form></section>;
}
