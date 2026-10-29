"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Item = { id: string; linkedDocumentId: string | null; kind: string; status: "missing" | "added" | "reviewed" | "expired"; required: boolean; label: string };
type Dossier = { id: string; title: string; items: Item[] };
type PersonalDocument = { id: string; title: string; status: string };

export function DossierDetail({ locale, dossierId }: { locale: string; dossierId: string }) {
  const isArabic = locale === "ar";
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [documents, setDocuments] = useState<PersonalDocument[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const [dossierResponse, documentsResponse] = await Promise.all([
      fetch(`/api/v1/me/dossiers/${dossierId}`, { cache: "no-store" }), fetch("/api/v1/me/documents", { cache: "no-store" }),
    ]);
    const dossierResult = await dossierResponse.json();
    const documentsResult = await documentsResponse.json();
    if (!dossierResponse.ok) throw new Error(dossierResult.message ?? "Dossier introuvable.");
    if (!documentsResponse.ok) throw new Error(documentsResult.message ?? "Impossible de charger les documents.");
    setDossier(dossierResult.dossier as Dossier); setDocuments(documentsResult.documents as PersonalDocument[]);
  }, [dossierId]);
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Erreur")); }, [load]);

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    const documentId = String(form.get("documentId") ?? "");
    const selected = documents.find((item) => item.id === documentId);
    const label = String(form.get("label") ?? "").trim() || selected?.title || "";
    const response = await fetch(`/api/v1/me/dossiers/${dossierId}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, required: form.get("required") === "on", documentId: documentId || undefined }) });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? (isArabic ? "تعذر إضافة العنصر." : "Impossible d’ajouter cet élément.")); return; }
    event.currentTarget.reset(); await load();
  }

  async function changeStatus(item: Item) {
    const next = item.status === "missing" || item.status === "expired" ? "added" : item.status === "added" ? "reviewed" : "added";
    const response = await fetch(`/api/v1/me/dossiers/${dossierId}/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
    if (!response.ok) { setError(isArabic ? "تعذر تحديث الحالة." : "Impossible de mettre à jour le statut."); return; }
    await load();
  }

  async function removeItem(id: string) {
    const response = await fetch(`/api/v1/me/dossiers/${dossierId}/items/${id}`, { method: "DELETE" });
    if (!response.ok) setError(isArabic ? "تعذر حذف العنصر." : "Impossible de supprimer cet élément.");
    else await load();
  }

  if (!dossier) return <div className="empty-state">{error || (isArabic ? "جارٍ التحميل…" : "Chargement…")}</div>;
  const requiredCount = dossier.items.filter((item) => item.required).length;
  const completedCount = dossier.items.filter((item) => item.required && (item.status === "added" || item.status === "reviewed")).length;
  return <div className="dossier-detail"><Link className="back-link" href={`/${locale}/dossiers`}>← {isArabic ? "العودة إلى الملفات" : "Retour aux dossiers"}</Link><div className="section-heading"><div className="eyebrow">{isArabic ? "قائمة المستندات" : "CHECKLIST PERSONNALISÉE"}</div><h1>{dossier.title}</h1><p>{isArabic ? `${completedCount} من ${requiredCount} مستند مطلوب` : `${completedCount} élément(s) requis sur ${requiredCount} ajouté(s)`}</p></div>{error && <p className="form-message form-error" role="alert">{error}</p>}
    <form className="auth-card dossier-item-form" onSubmit={addItem}><div className="eyebrow">{isArabic ? "إضافة عنصر" : "AJOUTER UNE PIÈCE"}</div><label className="profile-field">{isArabic ? "اسم العنصر" : "Nom de la pièce"}<input name="label" maxLength={240} placeholder={isArabic ? "مثال: نسخة من جواز السفر" : "Ex. copie du passeport"} /></label><label className="profile-field">{isArabic ? "ربط بوثيقة محفوظة" : "Associer un document enregistré"}<select name="documentId" defaultValue=""><option value="">{isArabic ? "قائمة تحقق فقط" : "Checklist uniquement"}</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label><label className="consent-check"><input name="required" type="checkbox" defaultChecked />{isArabic ? "مستند مطلوب" : "Pièce requise"}</label><button className="button">{isArabic ? "إضافة" : "Ajouter à la checklist"}</button></form>
    <section className="dossier-items">{dossier.items.length === 0 ? <div className="empty-state"><p>{isArabic ? "أضف المستندات التي تريد متابعتها." : "Ajoutez les pièces à préparer pour cette démarche."}</p></div> : dossier.items.map((item) => <article className="dossier-item-card" key={item.id}><div><span className={`status-badge status-${item.status}`}>{item.status}</span>{item.required && <span className="required-mark"> · {isArabic ? "مطلوب" : "Requis"}</span>}<h2>{item.label}</h2>{item.linkedDocumentId && <Link className="text-link" href={`/${locale}/mes-documents/${item.linkedDocumentId}`}>{isArabic ? "فتح الوثيقة" : "Ouvrir le document associé"}</Link>}</div><div className="profile-item-actions"><button className="text-link" type="button" onClick={() => void changeStatus(item)}>{item.status === "reviewed" ? (isArabic ? "إلغاء المراجعة" : "Annuler la revue") : item.status === "added" ? (isArabic ? "مراجعة" : "Marquer vérifié") : (isArabic ? "تمت الإضافة" : "Marquer comme ajouté")}</button><button className="text-link destructive" type="button" onClick={() => void removeItem(item.id)}>{isArabic ? "حذف" : "Retirer"}</button></div></article>)}</section>
  </div>;
}
