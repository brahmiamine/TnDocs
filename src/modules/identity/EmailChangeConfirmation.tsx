"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function EmailChangeConfirmation({ locale }: { locale: "fr" | "ar" }) {
  const ar = locale === "ar", [token, setToken] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const raw = new URLSearchParams(window.location.hash.slice(1)).get("token"); if (raw) { setToken(raw); window.history.replaceState(null, "", window.location.pathname); } }, []);
  async function confirm() {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/auth/change-email/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (!response.ok) throw new Error("Failed");
      setToken(""); setMessage(ar ? "تم تحديث البريد. سجّل الدخول بالعنوان الجديد." : "Adresse mise à jour. Connectez-vous avec votre nouvelle adresse.");
    } catch { setMessage(ar ? "تعذر التأكيد. تحقق من تسجيل الدخول بالحساب الصحيح واطلب رابطاً جديداً." : "Confirmation impossible. Vérifiez votre connexion au bon compte et demandez un nouveau lien."); }
    finally { setBusy(false); }
  }
  return <section className="auth-card"><h1>{ar ? "تأكيد تغيير البريد" : "Confirmer le changement d’email"}</h1><p>{ar ? "يجب فتح هذه الصفحة أثناء تسجيل الدخول بالحساب المعني." : "Ouvrez cette page en étant connecté au compte concerné."}</p>{token && <button className="button" disabled={busy} onClick={() => void confirm()}>{ar ? "تأكيد" : "Confirmer"}</button>}{message && <p role="status">{message}</p>}<Link href={`/${locale}/connexion`}>{ar ? "تسجيل الدخول" : "Se connecter"}</Link></section>;
}
