"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
export function CreateProcedureDossierButton({ guideId, version, nodeId, locale, country }: { guideId: string; version: number; nodeId: string; locale: "fr" | "ar"; country: string }) {
  const ar = locale === "ar", [message, setMessage] = useState(""), [created, setCreated] = useState(""), [busy, setBusy] = useState(false), [needsLogin, setNeedsLogin] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage(""); setNeedsLogin(false);
    try {
      const response = await fetch("/api/v1/me/dossiers/from-procedure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guideId, expectedVersion: version, nodeId, country: String(form.get("country")).toUpperCase(), locale, confirmation: true }) });
      if (response.status === 401) { setNeedsLogin(true); throw new Error("LOGIN_REQUIRED"); }
      if (!response.ok) throw new Error("UNAVAILABLE");
      setCreated((await response.json()).id);
    } catch { setMessage(ar ? "تعذر إنشاء الملف. يلزم تسجيل الدخول وبقاء الإجراء ومصادره متحققاً منها لهذا البلد." : "Création impossible. Connectez-vous et vérifiez que cette procédure et ses sources sont toujours validées pour ce pays."); }
    finally { setBusy(false); }
  }
  return <div><form className="auth-form" onSubmit={create}><label>{ar ? "بلد الإقامة (حرفان)" : "Pays de résidence (2 lettres)"}<input name="country" key={country} defaultValue={country} pattern="[A-Za-z]{2}" minLength={2} maxLength={2} required dir="ltr" /></label><p className="form-hint">{ar ? "بالضغط تنشئ ملفاً خاصاً بهذه القائمة المثبتة. لن تتم قراءة ملفاتك الشخصية." : "Ce bouton crée un dossier privé avec cette checklist figée. Vos profils personnels ne seront pas consultés."}</p><button className="button" type="submit" disabled={busy || Boolean(created)}>{ar ? "إنشاء ملف من هذه القائمة" : "Créer un dossier depuis cette checklist"}</button></form>{message && <p role="status">{message}</p>}{needsLogin && <Link href={`/${locale}/connexion`} target="_blank" rel="noopener noreferrer">{ar ? "تسجيل الدخول ثم إعادة المحاولة" : "Se connecter puis réessayer"}</Link>}{created && <Link className="button" href={`/${locale}/dossiers/${created}`}>{ar ? "فتح الملف" : "Ouvrir le dossier créé"}</Link>}</div>;
}
