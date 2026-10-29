"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type DocumentItem = { id: string; title: string; status: string; isFavorite: number; currentRevision: number; updatedAt: string };

export function DocumentsDashboard({ locale }: { locale: string }) {
  const isArabic = locale === "ar";
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [error, setError] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [query, setQuery] = useState("");
  const visibleItems = items.filter((item) => item.title.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
  const load = useCallback(async () => {
    const parameters = new URLSearchParams();
    if (showTrash) parameters.set("includeTrash", "true");
    else if (showArchived) parameters.set("status", "archived");
    if (showFavorites && !showTrash) parameters.set("favorites", "true");
    const response = await fetch(`/api/v1/me/documents${parameters.size ? `?${parameters}` : ""}`, { cache: "no-store" });
    if (!response.ok) throw new Error(isArabic ? "تعذر تحميل الوثائق." : "Impossible de charger les documents.");
    const result = await response.json() as { documents: DocumentItem[] };
    setItems(result.documents);
  }, [isArabic, showTrash, showArchived, showFavorites]);
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Erreur")); }, [load]);

  async function moveToTrash(id: string) {
    const response = await fetch(`/api/v1/me/documents/${id}`, { method: "DELETE" });
    if (!response.ok) { setError(isArabic ? "تعذر نقل الوثيقة إلى سلة المحذوفات." : "Impossible de déplacer ce document dans la corbeille."); return; }
    await load();
  }

  async function changeArchiveState(id: string, action: "archive" | "unarchive") {
    const response = await fetch(`/api/v1/me/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!response.ok) { setError(isArabic ? "تعذر تحديث حالة الوثيقة." : "Impossible de modifier le statut du document."); return; }
    await load();
  }

  async function toggleFavorite(item: DocumentItem) {
    const action = item.isFavorite ? "unfavorite" : "favorite";
    const response = await fetch(`/api/v1/me/documents/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!response.ok) { setError(isArabic ? "تعذر تحديث المفضلة." : "Impossible de modifier les favoris."); return; }
    await load();
  }

  async function restore(id: string) {
    const response = await fetch(`/api/v1/me/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) });
    if (!response.ok) { setError(isArabic ? "تعذر استعادة الوثيقة." : "Impossible de restaurer ce document."); return; }
    await load();
  }

  async function duplicate(id: string) {
    const response = await fetch(`/api/v1/me/documents/${id}/duplicate`, { method: "POST" });
    const result = await response.json() as { id?: string };
    if (!response.ok || !result.id) { setError(isArabic ? "تعذر نسخ الوثيقة." : "Impossible de dupliquer ce document."); return; }
    window.location.assign(`/${locale}/mes-documents/${result.id}`);
  }

  return <div className="document-dashboard">
    <div className="document-dashboard-toolbar">
      <label className="document-search-label">{isArabic ? "بحث في الوثائق" : "Rechercher dans mes documents"}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isArabic ? "عنوان الوثيقة" : "Titre du document"} /></label>
      <div className="profile-item-actions">
        <button className={`button ${!showTrash && !showArchived && !showFavorites ? "" : "button-quiet"}`} type="button" onClick={() => { setShowTrash(false); setShowArchived(false); setShowFavorites(false); }}>{isArabic ? "وثائقي" : "Mes documents"}</button>
        <button className={`button ${showFavorites ? "" : "button-quiet"}`} type="button" onClick={() => { setShowTrash(false); setShowArchived(false); setShowFavorites((value) => !value); }}>{isArabic ? "المفضلة" : "Favoris"}</button>
        <button className={`button ${showArchived ? "" : "button-quiet"}`} type="button" onClick={() => { setShowTrash(false); setShowFavorites(false); setShowArchived((value) => !value); }}>{isArabic ? "الأرشيف" : "Archives"}</button>
        <button className={`button ${showTrash ? "" : "button-quiet"}`} type="button" onClick={() => { setShowArchived(false); setShowFavorites(false); setShowTrash((value) => !value); }}>{isArabic ? "سلة المحذوفات" : "Corbeille"}</button>
      </div>
    </div>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
    {visibleItems.length === 0 ? <div className="empty-state"><div className="category-icon">▤</div><h2>{query ? (isArabic ? "لا توجد نتائج" : "Aucun résultat") : showTrash ? (isArabic ? "سلة المحذوفات فارغة" : "La corbeille est vide") : showArchived ? (isArabic ? "الأرشيف فارغ" : "Aucune archive") : showFavorites ? (isArabic ? "لا توجد وثائق مفضلة" : "Aucun favori") : (isArabic ? "لا توجد وثائق بعد" : "Aucun document pour le moment")}</h2><p>{query ? (isArabic ? "جرّب عنواناً آخر." : "Essayez un autre titre.") : showTrash ? (isArabic ? "ستظهر هنا الوثائق التي نقلتها إلى سلة المحذوفات." : "Les documents déplacés dans la corbeille apparaîtront ici.") : showArchived ? (isArabic ? "ستظهر هنا الوثائق المؤرشفة." : "Les documents archivés apparaîtront ici.") : showFavorites ? (isArabic ? "أضف وثائقك إلى المفضلة للوصول إليها بسرعة." : "Ajoutez des documents aux favoris pour les retrouver rapidement.") : (isArabic ? "اختر نموذجاً قابلاً للتحرير من المكتبة لبدء وثيقتك الأولى." : "Choisissez un modèle modifiable dans le catalogue pour commencer votre premier document.")}</p>{!showTrash && !showArchived && !showFavorites && !query && <Link className="button" href={`/${locale}/catalogue`}>{isArabic ? "استكشف النماذج" : "Explorer le catalogue"}</Link>}</div> : <div className="document-list">{visibleItems.map((item) => <article className="profile-item" key={item.id}><div><span className="profile-relation">{statusLabel(item.status, isArabic)}</span><h3>{item.title}</h3><p>{isArabic ? `النسخة ${item.currentRevision}` : `Version ${item.currentRevision}`} · {new Intl.DateTimeFormat(locale === "ar" ? "ar-TN" : "fr-FR", { dateStyle: "medium" }).format(new Date(item.updatedAt))}</p></div><div className="profile-item-actions">{showTrash ? <button className="text-link" type="button" onClick={() => void restore(item.id)}>{isArabic ? "استعادة" : "Restaurer"}</button> : <><button className="text-link" type="button" aria-label={item.isFavorite ? (isArabic ? "إزالة من المفضلة" : "Retirer des favoris") : (isArabic ? "إضافة إلى المفضلة" : "Ajouter aux favoris")} onClick={() => void toggleFavorite(item)}>{item.isFavorite ? "★" : "☆"}</button><Link className="text-link" href={`/${locale}/mes-documents/${item.id}`}>{isArabic ? "فتح" : "Ouvrir"}</Link>{showArchived ? <button className="text-link" type="button" onClick={() => void changeArchiveState(item.id, "unarchive")}>{isArabic ? "إلغاء الأرشفة" : "Désarchiver"}</button> : <><button className="text-link" type="button" onClick={() => void changeArchiveState(item.id, "archive")}>{isArabic ? "أرشفة" : "Archiver"}</button><button className="text-link" type="button" onClick={() => void duplicate(item.id)}>{isArabic ? "إنشاء نسخة" : "Dupliquer"}</button><button className="text-link destructive" type="button" onClick={() => void moveToTrash(item.id)}>{isArabic ? "حذف" : "Mettre à la corbeille"}</button></>}</>}</div></article>)}</div>}
  </div>;
}

function statusLabel(status: string, isArabic: boolean) {
  const labels: Record<string, [string, string]> = {
    draft: ["Brouillon", "مسودة"], finalized: ["Finalisé", "مكتمل"], archived: ["Archivé", "مؤرشف"], trash: ["Corbeille", "سلة المحذوفات"],
  };
  const label = labels[status];
  return label ? label[isArabic ? 1 : 0] : status;
}
