"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type DocumentItem = { id: string; title: string; status: string; currentRevision: number; updatedAt: string };

export function DocumentsDashboard({ locale }: { locale: string }) {
  const isArabic = locale === "ar";
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [error, setError] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/v1/me/documents${showTrash ? "?includeTrash=true" : ""}`, { cache: "no-store" });
    if (!response.ok) throw new Error(isArabic ? "تعذر تحميل الوثائق." : "Impossible de charger les documents.");
    const result = await response.json() as { documents: DocumentItem[] };
    setItems(result.documents);
  }, [isArabic, showTrash]);
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Erreur")); }, [load]);

  async function archive(id: string) {
    const response = await fetch(`/api/v1/me/documents/${id}`, { method: "DELETE" });
    if (!response.ok) { setError(isArabic ? "تعذر أرشفة الوثيقة." : "Impossible de supprimer ce document."); return; }
    await load();
  }

  async function restore(id: string) {
    const response = await fetch(`/api/v1/me/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) });
    if (!response.ok) { setError(isArabic ? "تعذر استعادة الوثيقة." : "Impossible de restaurer ce document."); return; }
    await load();
  }

  return <div className="document-dashboard">
    <div className="document-dashboard-toolbar"><button className="button button-quiet" type="button" onClick={() => setShowTrash((value) => !value)}>{showTrash ? (isArabic ? "العودة إلى الوثائق" : "Mes documents") : (isArabic ? "سلة المحذوفات" : "Corbeille")}</button></div>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
    {items.length === 0 ? <div className="empty-state"><div className="category-icon">▤</div><h2>{showTrash ? (isArabic ? "سلة المحذوفات فارغة" : "La corbeille est vide") : (isArabic ? "لا توجد وثائق بعد" : "Aucun document pour le moment")}</h2><p>{showTrash ? (isArabic ? "ستظهر هنا الوثائق التي نقلتها إلى سلة المحذوفات." : "Les documents déplacés dans la corbeille apparaîtront ici.") : (isArabic ? "اختر نموذجاً قابلاً للتحرير من المكتبة لبدء وثيقتك الأولى." : "Choisissez un modèle modifiable dans le catalogue pour commencer votre premier document.")}</p>{!showTrash && <Link className="button" href={`/${locale}/catalogue`}>{isArabic ? "استكشف النماذج" : "Explorer le catalogue"}</Link>}</div> : <div className="document-list">{items.map((item) => <article className="profile-item" key={item.id}><div><span className="profile-relation">{item.status}</span><h3>{item.title}</h3><p>{isArabic ? `النسخة ${item.currentRevision}` : `Version ${item.currentRevision}`} · {new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : "fr-FR", { dateStyle: "medium" }).format(new Date(item.updatedAt))}</p></div><div className="profile-item-actions">{showTrash ? <button className="text-link" type="button" onClick={() => void restore(item.id)}>{isArabic ? "استعادة" : "Restaurer"}</button> : <><Link className="text-link" href={`/${locale}/mes-documents/${item.id}`}>{isArabic ? "فتح" : "Ouvrir"}</Link><button className="text-link destructive" type="button" onClick={() => void archive(item.id)}>{isArabic ? "حذف" : "Mettre à la corbeille"}</button></>}</div></article>)}</div>}
  </div>;
}
