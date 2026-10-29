"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateDocumentButton({ templateId, locale }: { templateId: string; locale: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/me/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId, locale }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? (locale === "ar" ? "تعذر إنشاء المسودة." : "Impossible de créer le brouillon."));
      router.push(`/${locale}/mes-documents/${result.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Erreur"); }
    finally { setBusy(false); }
  }
  return <div className="document-create-action"><button className="button" type="button" onClick={() => void create()} disabled={busy}>{busy ? (locale === "ar" ? "جارٍ الإنشاء…" : "Création…") : (locale === "ar" ? "إنشاء مسودتي" : "Créer mon brouillon")}</button>{error && <p className="form-message form-error" role="alert">{error} <a href={`/${locale}/connexion`}>{locale === "ar" ? "تسجيل الدخول" : "Se connecter"}</a></p>}</div>;
}
