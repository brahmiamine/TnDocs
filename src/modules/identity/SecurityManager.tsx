"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

const eventLabels: Record<string, { fr: string; ar: string }> = {
  password_login: { fr: "Connexion par mot de passe", ar: "دخول بكلمة المرور" }, magic_link_login: { fr: "Connexion par email", ar: "دخول عبر البريد" }, google_login: { fr: "Connexion Google", ar: "دخول عبر Google" }, google_linked: { fr: "Compte Google associé", ar: "ربط حساب Google" },
  mfa_enrollment_started: { fr: "Configuration de la double authentification commencée", ar: "بدء إعداد المصادقة الثنائية" }, mfa_enabled: { fr: "Double authentification activée", ar: "تفعيل المصادقة الثنائية" }, mfa_verified: { fr: "Double authentification vérifiée", ar: "تحقق المصادقة الثنائية" }, mfa_recovery_used: { fr: "Code de secours utilisé", ar: "استعمال رمز استرداد" }, mfa_disabled: { fr: "Double authentification désactivée", ar: "تعطيل المصادقة الثنائية" }, session_revoked: { fr: "Session fermée", ar: "إنهاء جلسة" }, email_change_requested: { fr: "Changement d’email demandé", ar: "طلب تغيير البريد" }, email_changed: { fr: "Adresse email modifiée", ar: "تغيير عنوان البريد" }, signed_out: { fr: "Déconnexion", ar: "تسجيل خروج" },
};
type SecurityState = { mfaEnabled: boolean; mfaVerified: boolean; mfaRequired: boolean; mfaConfigurable: boolean; googleConfigured: boolean; googleLinked?: boolean; sessions: Array<{ id: string; current: boolean; createdAt: string; expiresAt: string }>; events: Array<{ event: string; createdAt: string }> };
export function SecurityManager({ locale }: { locale: "fr" | "ar" }) {
  const ar = locale === "ar";
  const [state, setState] = useState<SecurityState | null>(null), [secret, setSecret] = useState(""), [code, setCode] = useState(""), [password, setPassword] = useState(""), [newEmail, setNewEmail] = useState(""), [codes, setCodes] = useState<string[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/v1/me/sessions", { cache: "no-store" });
    if (!response.ok) throw new Error("unavailable");
    setState(await response.json());
  }, []);
  useEffect(() => { load().catch(() => setMessage(ar ? "تعذر تحميل إعدادات الأمان." : "Impossible de charger les paramètres de sécurité.")); }, [load, ar]);
  async function action(url: string, body?: unknown, method = "POST") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "REAUTHENTICATION_REQUIRED") setMessage(ar ? "أعد تسجيل الدخول قبل إعداد المصادقة الثنائية." : "Reconnectez-vous avant de configurer la double authentification.");
        else setMessage(ar ? "تعذر تنفيذ العملية. تحقق من الرمز أو حاول لاحقاً." : "Opération impossible. Vérifiez le code ou réessayez plus tard.");
        return;
      }
      if (result.secret) setSecret(result.secret);
      if (result.recoveryCodes) { setCodes(result.recoveryCodes); setSecret(""); }
      if (result.url) { window.location.assign(result.url); return; }
      if (result.status === "disabled_signed_out") { window.location.assign(`/${locale}/connexion`); return; }
      setCode(""); setPassword(""); await load();
      setMessage(ar ? "تمت العملية." : "Opération effectuée.");
    } catch { setMessage(ar ? "الخدمة غير متاحة حالياً." : "Le service est momentanément indisponible."); }
    finally { setBusy(false); }
  }
  function verify(event: FormEvent) { event.preventDefault(); void action("/api/v1/auth/mfa/verify", { code, enrollment: Boolean(secret) }); }
  return <div className="container section" style={{ maxWidth: 800 }}>
    <h1>{ar ? "أمان الحساب" : "Sécurité du compte"}</h1>
    <p><Link href={`/${locale}/mes-documents`}>{ar ? "وثائقي" : "Mes documents"}</Link> · <Link href={`/${locale}/connexion`}>{ar ? "إعادة الدخول" : "Se reconnecter"}</Link></p>
    {message && <p role="status">{message}</p>}
    {!state ? <p>{ar ? "جارٍ التحميل…" : "Chargement…"}</p> : <>
      <section className="auth-card"><h2>{ar ? "المصادقة الثنائية" : "Double authentification"}</h2>
        <p>{state.mfaEnabled ? (ar ? "المصادقة الثنائية مفعّلة." : "La double authentification est activée.") : state.mfaRequired ? (ar ? "إعداد المصادقة الثنائية إلزامي لهذا الحساب قبل المتابعة." : "La double authentification est obligatoire pour ce compte avant de continuer.") : (ar ? "أضف رمزاً من تطبيق المصادقة لحماية حسابك." : "Ajoutez un code d’application d’authentification pour protéger votre compte.")}</p>
        {!state.mfaEnabled && !secret && (state.mfaConfigurable ? <button className="button" disabled={busy} onClick={() => void action("/api/v1/auth/mfa/enroll")}>{ar ? "إعداد المصادقة" : "Configurer l’authentification"}</button> : <p>{ar ? "إعداد المصادقة غير متاح حالياً. اتصل بالدعم." : "La configuration de l’authentification est indisponible. Contactez le support."}</p>)}
        {secret && <div><p>{ar ? "أدخل هذا المفتاح يدوياً في تطبيق المصادقة، ثم أدخل الرمز لتأكيد الإعداد." : "Ajoutez cette clé manuellement dans votre application d’authentification, puis confirmez avec le code affiché."}</p><code dir="ltr" style={{ overflowWrap: "anywhere" }}>{secret}</code></div>}
        {(secret || state.mfaEnabled && !state.mfaVerified) && <form className="auth-form" onSubmit={verify}><label htmlFor="mfa-code">{ar ? "رمز التطبيق أو الاسترداد" : "Code d’application ou de secours"}</label><input id="mfa-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" required minLength={6} maxLength={40} /><button className="button" disabled={busy}>{ar ? "تأكيد" : "Vérifier"}</button></form>}
        {codes.length > 0 && <div><h3>{ar ? "احفظ رموز الاسترداد الآن" : "Conservez ces codes de secours maintenant"}</h3><p>{ar ? "لن تظهر مرة أخرى. كل رمز صالح مرة واحدة." : "Ils ne seront plus affichés. Chaque code est utilisable une seule fois."}</p><pre dir="ltr">{codes.join("\n")}</pre><button onClick={() => setCodes([])}>{ar ? "تم حفظها" : "Je les ai conservés"}</button></div>}
        {state.mfaEnabled && state.mfaVerified && <details><summary>{ar ? "تعطيل المصادقة الثنائية" : "Désactiver la double authentification"}</summary><form className="auth-form" onSubmit={event => { event.preventDefault(); void action("/api/v1/auth/mfa/disable", { password }); }}><p>{ar ? "الحسابات الإدارية في الإنتاج ملزمة بالمصادقة الثنائية. سيتم إنهاء الجلسات عند التعطيل." : "Les comptes privilégiés en production doivent conserver la double authentification. La désactivation ferme toutes les sessions."}</p><label htmlFor="confirm-password">{ar ? "كلمة المرور" : "Mot de passe"}</label><input id="confirm-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={128} /><button disabled={busy}>{ar ? "تعطيل وإغلاق الجلسات" : "Désactiver et fermer les sessions"}</button></form></details>}
      </section>
      {(!state.mfaRequired || state.mfaVerified) && <>
        {state.googleConfigured && <section><h2>Google</h2><p>{state.googleLinked ? (ar ? "تم ربط حساب Google." : "Compte Google associé.") : (ar ? "اربط حساب Google من هذه الجلسة الموثوقة." : "Associez votre compte Google depuis cette session authentifiée.")}</p>{!state.googleLinked && <button disabled={busy} onClick={() => void action(`/api/v1/auth/google?locale=${locale}&link=1`)}>{ar ? "ربط Google" : "Associer Google"}</button>}</section>}
        <section><h2>{ar ? "تغيير البريد الإلكتروني" : "Changer d’adresse email"}</h2><form className="auth-form" onSubmit={event => { event.preventDefault(); void action("/api/v1/auth/change-email", { email: newEmail, password }); }}><label htmlFor="new-email">{ar ? "العنوان الجديد" : "Nouvelle adresse"}</label><input id="new-email" type="email" autoComplete="email" required maxLength={320} value={newEmail} onChange={event => setNewEmail(event.target.value)} /><label htmlFor="email-password">{ar ? "كلمة المرور الحالية" : "Mot de passe actuel"}</label><input id="email-password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /><button disabled={busy}>{ar ? "إرسال رابط التأكيد" : "Envoyer la confirmation"}</button></form></section>
        <section><h2>{ar ? "الجلسات النشطة" : "Sessions actives"}</h2><ul>{state.sessions.map(session => <li key={session.id}>{new Date(session.createdAt).toLocaleString(locale)} — {session.current ? (ar ? "هذه الجلسة" : "Cette session") : (ar ? "جلسة أخرى" : "Autre session")} <button disabled={busy} onClick={() => void action(`/api/v1/me/sessions/${session.id}`, undefined, "DELETE")}>{ar ? "إنهاء" : "Révoquer"}</button></li>)}</ul></section>
        <section><h2>{ar ? "سجل الأمان" : "Journal de sécurité"}</h2><ul>{state.events.map((event, index) => <li key={index}>{new Date(event.createdAt).toLocaleString(locale)} — {eventLabels[event.event]?.[locale] ?? (ar ? "حدث أمني" : "Événement de sécurité")}</li>)}</ul></section>
      </>}
    </>}
  </div>;
}
