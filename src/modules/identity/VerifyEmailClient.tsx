"use client";

import Link from "next/link";
import { useState } from "react";

export function VerifyEmailClient({ locale, token }: { locale: "fr" | "ar"; token?: string }) {
  const isArabic = locale === "ar";
  const [status, setStatus] = useState<"ready" | "pending" | "success" | "error">(token ? "ready" : "error");
  const [message, setMessage] = useState("");

  async function confirm() {
    if (!token) return;
    setStatus("pending");
    try {
      const response = await fetch("/api/v1/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Verification failed.");
    }
  }

  const title = status === "pending"
    ? (isArabic ? "جارٍ تأكيد بريدك الإلكتروني…" : "Confirmation de votre adresse email…")
    : status === "success"
      ? (isArabic ? "تم تأكيد بريدك الإلكتروني" : "Votre adresse email est confirmée")
      : status === "ready"
        ? (isArabic ? "أكد عنوان بريدك الإلكتروني" : "Confirmez votre adresse email")
        : (isArabic ? "تعذر تأكيد الرابط" : "Le lien de confirmation n’est pas valide");

  return <section className="auth-card"><div className="eyebrow">TnDocs</div><h1>{title}</h1><p className="auth-intro">{message || (status === "success" ? (isArabic ? "حسابك جاهز للاستخدام." : "Votre compte est prêt.") : status === "ready" ? (isArabic ? "اضغط لتأكيد الحساب." : "Validez votre compte pour terminer l’inscription.") : (isArabic ? "قد يكون الرابط منتهي الصلاحية. اطلب رسالة جديدة." : "Le lien a peut-être expiré. Demandez un nouvel email."))}</p>{status === "ready" && <button className="button auth-submit" onClick={confirm}>{isArabic ? "تأكيد الحساب" : "Confirmer mon adresse"}</button>}{status === "success" && <Link className="button auth-submit" href={`/${locale}/mes-documents`}>{isArabic ? "متابعة" : "Continuer"}</Link>}</section>;
}
