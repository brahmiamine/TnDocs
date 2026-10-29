"use client";

import {safePostAuthPath} from "./return-path";
import Link from "next/link";
import { FormEvent, useState, useEffect } from "react";

type AuthFormProps = { locale: "fr" | "ar"; mode: "login" | "register"; googleEnabled?: boolean; returnTo?: string|null };

export function AuthForm({ locale, mode, googleEnabled = false, returnTo }: AuthFormProps) {
  useEffect(()=>{const path=safePostAuthPath(returnTo,locale);if(path)try{sessionStorage.setItem("tndocs-auth-return",path)}catch{}},[returnTo,locale]);
  const isArabic = locale === "ar";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const isRegister = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);
    try {
      const response = await fetch(`/api/v1/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, locale }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? (isArabic ? "حدث خطأ. حاول مرة أخرى." : "Une erreur est survenue. Réessayez."));
      if (isRegister) {
        setMessage(isArabic ? "إذا كان بإمكاننا إنشاء الحساب، فستصلك رسالة لتأكيد بريدك الإلكتروني." : "Si le compte peut être créé, un message de confirmation vient d’être envoyé à cette adresse.");
      } else {
        window.location.assign(`/${locale}/${result.status === "mfa_required" ? "securite" : "mes-documents"}`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (isArabic ? "تعذر الاتصال بالخدمة." : "Le service est momentanément indisponible."));
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    setPending(true);
    try {
      const response = await fetch("/api/v1/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!response.ok) throw new Error("Failed");
      setMessage(isArabic ? "إذا كان الحساب مؤهلاً، فسيُرسل رابط تأكيد جديد." : "Si ce compte est éligible, un nouveau lien de confirmation sera envoyé.");
    } catch { setError(isArabic ? "الخدمة غير متاحة." : "Service indisponible."); }
    finally { setPending(false); }
  }
  async function googleLogin() {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/v1/auth/google?locale=${locale}`, { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(isArabic ? "الدخول عبر Google غير مُعدّ حالياً." : "La connexion Google n’est pas configurée actuellement.");
      window.location.assign(result.url);
    } catch (error) { setError(error instanceof Error ? error.message : "Service indisponible"); }
    finally { setPending(false); }
  }
  return (
    <section className="auth-card">
      <div className="eyebrow">{isRegister ? (isArabic ? "إنشاء حساب" : "CRÉER UN COMPTE") : (isArabic ? "مساحتك الشخصية" : "VOTRE ESPACE PERSONNEL")}</div>
      <h1>{isRegister ? (isArabic ? "ابدأ مع TnDocs" : "Créer votre compte") : (isArabic ? "مرحباً بعودتك" : "Heureux de vous retrouver")}</h1>
      <p className="auth-intro">{isRegister ? (isArabic ? "أكد بريدك الإلكتروني لحماية حسابك." : "Confirmez votre adresse email pour protéger votre compte.") : (isArabic ? "سجّل الدخول لمتابعة وثائقك." : "Connectez-vous pour retrouver vos documents.")}</p>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="email">{isArabic ? "البريد الإلكتروني" : "Adresse email"}</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="password">{isArabic ? "كلمة المرور" : "Mot de passe"}</label>
        <input id="password" name="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} required minLength={isRegister ? 12 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
        {!isRegister && <Link className="forgot-link" href={`/${locale}/mot-de-passe-oublie`}>{isArabic ? "نسيت كلمة المرور؟" : "Mot de passe oublié ?"}</Link>}
        {isRegister && <span className="form-hint">{isArabic ? "12 حرفاً على الأقل." : "12 caractères minimum."}</span>}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {message && <p className="form-message form-success" role="status">{message}</p>}
        <button className="button auth-submit" type="submit" disabled={pending}>{pending ? (isArabic ? "جارٍ الإرسال…" : "En cours…") : (isRegister ? (isArabic ? "إنشاء الحساب" : "Créer mon compte") : (isArabic ? "تسجيل الدخول" : "Se connecter"))}</button>
      </form>
      {isRegister && message && <button disabled={pending || !email} onClick={() => void resend()}>{isArabic ? "إرسال تأكيد جديد" : "Renvoyer la confirmation"}</button>}
      {!isRegister && <p><Link href={`/${locale}/connexion-email`}>{isArabic ? "الدخول برابط عبر البريد" : "Recevoir un lien de connexion"}</Link></p>}
      {!isRegister && googleEnabled && <button className="button secondary" disabled={pending} onClick={() => void googleLogin()}>{isArabic ? "الدخول عبر Google" : "Continuer avec Google"}</button>}
      <p className="auth-switch">{isRegister ? (isArabic ? "لديك حساب؟" : "Vous avez déjà un compte ?") : (isArabic ? "ليس لديك حساب؟" : "Pas encore de compte ?")} <Link href={`/${locale}/${isRegister ? "connexion" : "inscription"}`}>{isRegister ? (isArabic ? "سجّل الدخول" : "Se connecter") : (isArabic ? "إنشاء حساب" : "Créer un compte")}</Link></p>
    </section>
  );
}
