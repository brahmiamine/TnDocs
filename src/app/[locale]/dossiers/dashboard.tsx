"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Dossier = { id: string; title: string; status: string; itemCount: number; updatedAt: string };

export function DossiersDashboard({ locale }: { locale: string }) {
  const isArabic = locale === "ar";
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/v1/me/dossiers", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? "Erreur");
    setDossiers(result.dossiers as Dossier[]);
  }, []);
  useEffect(() => { void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Erreur")); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/me/dossiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.get("title") }) });
    const result = await response.json();
    if (!response.ok) setMessage(result.message ?? (isArabic ? "تعذر إنشاء الملف." : "Impossible de créer le dossier."));
    else { event.currentTarget.reset(); await load(); }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!window.confirm(isArabic ? "نقل هذا الملف إلى سلة المحذوفات؟" : "Mettre ce dossier à la corbeille ?")) return;
    const response = await fetch(`/api/v1/me/dossiers/${id}`, { method: "DELETE" });
    if (response.ok) await load();
    else setMessage(isArabic ? "تعذر حذف الملف." : "Impossible de supprimer le dossier.");
  }

  return <div className="dossier-layout">
    <form className="auth-card dossier-create" onSubmit={create}><div className="eyebrow">{isArabic ? "ملف جديد" : "NOUVEAU DOSSIER"}</div><label className="profile-field">{isArabic ? "عنوان الملف" : "Nom du dossier"}<input name="title" required minLength={2} maxLength={180} /></label><button className="button" disabled={busy}>{isArabic ? "إنشاء" : "Créer le dossier"}</button></form>
    <section className="dossier-list">{message && <p className="form-message form-error" role="alert">{message}</p>}{dossiers.length === 0 ? <div className="empty-state"><div className="category-icon">▣</div><h2>{isArabic ? "لا توجد ملفات بعد" : "Aucun dossier"}</h2><p>{isArabic ? "أنشئ ملفاً لتجميع الوثائق ومتابعة الخطوات." : "Créez un dossier pour réunir vos documents et suivre les pièces à préparer."}</p></div> : dossiers.map((dossier) => <article className="dossier-card" key={dossier.id}><div><div className="eyebrow">{dossier.itemCount} {isArabic ? "عنصر" : "éléments"}</div><h2>{dossier.title}</h2><p>{isArabic ? "تم التحديث" : "Mis à jour le"} {new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : "fr-FR", { dateStyle: "medium" }).format(new Date(dossier.updatedAt))}</p></div><div className="profile-item-actions"><Link className="text-link" href={`/${locale}/dossiers/${dossier.id}`}>{isArabic ? "فتح الملف" : "Ouvrir"}</Link><button className="text-link destructive" type="button" onClick={() => void remove(dossier.id)}>{isArabic ? "حذف" : "Supprimer"}</button></div></article>)}</section>
  </div>;
}
