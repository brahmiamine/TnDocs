"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
export function MagicLinkForm({ locale }: { locale: "fr" | "ar" }) {
  const ar = locale === "ar";
  const [email, setEmail] = useState(""), [token, setToken] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (raw) { setToken(raw); window.history.replaceState(null, "", window.location.pathname); }
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/auth/magic-link${token ? "/consume" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(token ? { token } : { email }) });
      const result = await response.json();
      if (!response.ok) throw new Error("Failed");
      if (token) { window.location.assign(`/${locale}/${result.status === "mfa_required" ? "securite" : "mes-documents"}`); return; }
      setMessage(ar ? "إذا كان الحساب مؤهلاً، فستصلك رسالة برابط الدخول." : "Si ce compte est éligible, un lien de connexion vous sera envoyé.");
    } catch { setMessage(ar ? "الرابط غير صالح أو الخدمة غير متاحة. اطلب رابطاً جديداً." : "Lien invalide ou service indisponible. Demandez un nouveau lien."); }
    finally { setBusy(false); }
  }
  return <section className="auth-card"><h1>{ar ? "الدخول عبر البريد" : "Connexion par email"}</h1><p>{ar ? "الرابط صالح لمدة 15 دقيقة ولمرة واحدة. لا تشاركه." : "Le lien est valable 15 minutes et utilisable une seule fois. Ne le partagez pas."}</p><form className="auth-form" onSubmit={submit}>{!token && <><label htmlFor="magic-email">{ar ? "البريد الإلكتروني" : "Adresse email"}</label><input id="magic-email" type="email" autoComplete="email" maxLength={320} value={email} onChange={event => setEmail(event.target.value)} required /></>}{message && <p role="status">{message}</p>}<button className="button" disabled={busy}>{token ? (ar ? "تأكيد الدخول" : "Confirmer la connexion") : (ar ? "إرسال رابط" : "Recevoir un lien")}</button></form><p><Link href={`/${locale}/connexion`}>{ar ? "الدخول بكلمة المرور" : "Se connecter par mot de passe"}</Link></p></section>;
}
