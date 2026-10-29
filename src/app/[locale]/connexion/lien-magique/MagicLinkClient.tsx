"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function MagicLinkClient({ locale, token }: { locale: "fr" | "ar"; token: string }) {
  const isArabic = locale === "ar";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    window.history.replaceState(null, "", `/${locale}/connexion/lien-magique`);
  }, [locale]);

  async function continueWithLink() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/magic-link/consume", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error(isArabic ? "الرابط غير صالح أو منتهي الصلاحية." : "Ce lien est invalide ou a expiré.");
      window.location.assign(`/${locale}/mes-documents`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (isArabic ? "تعذر الاتصال بالخدمة." : "Impossible de joindre le service."));
      setPending(false);
    }
  }

  return <main className="site-shell" dir={isArabic ? "rtl" : "ltr"}><section className="section"><div className="container auth-layout"><section className="auth-card"><div className="eyebrow">{isArabic ? "تسجيل دخول آمن" : "CONNEXION SÉCURISÉE"}</div><h1>{isArabic ? "متابعة إلى TnDocs" : "Continuer vers TnDocs"}</h1><p className="auth-intro">{isArabic ? "هذا الرابط صالح لمرة واحدة ولمدة 15 دقيقة. اضغط للمتابعة إلى حسابك." : "Ce lien est valable une seule fois pendant 15 minutes. Cliquez pour ouvrir votre espace."}</p>{error && <p className="form-message form-error" role="alert">{error}</p>}{token ? <button className="button auth-submit" type="button" onClick={() => void continueWithLink()} disabled={pending}>{pending ? (isArabic ? "جارٍ التحقق…" : "Vérification…") : (isArabic ? "تسجيل الدخول" : "Me connecter")}</button> : <p className="form-message form-error" role="alert">{isArabic ? "رابط الدخول غير موجود." : "Le lien de connexion est incomplet."}</p>}<p className="auth-switch"><Link href={`/${locale}/connexion`}>{isArabic ? "العودة إلى تسجيل الدخول" : "Retour à la connexion"}</Link></p></section></div></section></main>;
}
