"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type DocumentItem = { id: string; title: string; status: string; currentRevision: number; updatedAt: string };

export function DocumentsDashboard({ locale }: { locale: string }) {
  const isArabic = locale === "ar";
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/v1/me/documents", { cache: "no-store" });
    if (!response.ok) throw new Error(isArabic ? "تعذر تحميل الوثائق." : "Impossible de charger les documents.");
    const result = await response.json() as { documents: DocumentItem[] };
    setItems(result.documents);
  }, [isArabic]);
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Erreur")); }, [load]);

  async function archive(id: string) {
    const response = await fetch(`/api/v1/me/documents/${id}`, { method: "DELETE" });
    if (!response.ok) { setError(isArabic ? "تعذر أرشفة الوثيقة." : "Impossible de supprimer ce document."); return; }
    await load();
  }

  return <div className="document-dashboard">
    {error && <p className="form-message form-error" role="alert">{error}</p>}
    {items.length === 0 ? <div className="empty-state"><div className="category-icon">▤</div><h2>{isArabic ? "لا توجد وثائق بعد" : "Aucun document pour le moment"}</h2><p>{isArabic ? "اختر نموذجاً قابلاً للتحرير من المكتبة لبدء وثيقتك الأولى." : "Choisissez un modèle modifiable dans le catalogue pour commencer votre premier document."}</p><Link className="button" href={`/${locale}/catalogue`}>{isArabic ? "استكشف النماذج" : "Explorer le catalogue"}</Link></div> : <div className="document-list">{items.map((item) => <article className="profile-item" key={item.id}><div><span className="profile-relation">{item.status}</span><h3>{item.title}</h3><p>{isArabic ? `النسخة ${item.currentRevision}` : `Version ${item.currentRevision}`} · {new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : "fr-FR", { dateStyle: "medium" }).format(new Date(item.updatedAt))}</p></div><div className="profile-item-actions"><Link className="text-link" href={`/${locale}/mes-documents/${item.id}`}>{isArabic ? "فتح" : "Ouvrir"}</Link><button className="text-link destructive" type="button" onClick={() => void archive(item.id)}>{isArabic ? "حذف" : "Mettre à la corbeille"}</button></div></article>)}</div>}
  </div>;
}
