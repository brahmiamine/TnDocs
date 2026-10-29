"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Item = { id: string; linkedDocumentId: string | null; storedFileId: string | null; kind: string; status: "missing" | "added" | "reviewed" | "expired"; required: boolean; label: string };
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

  async function uploadAttachment(event: FormEvent<HTMLFormElement>, itemId: string) {
    event.preventDefault(); setError("");
    const form = event.currentTarget;
    const response = await fetch(`/api/v1/me/dossiers/${dossierId}/items/${itemId}/attachment`, { method: "POST", body: new FormData(form) });
    const result = await response.json() as { code?: string };
    if (!response.ok) {
      setError(result.code === "UNSUPPORTED_FILE_TYPE" ? (isArabic ? "يسمح فقط بملفات PDF وJPEG وPNG." : "Formats acceptés : PDF, JPEG et PNG.")
        : result.code === "IMAGE_DIMENSIONS_INVALID" ? (isArabic ? "أبعاد الصورة غير صالحة أو كبيرة جداً." : "Les dimensions de l’image sont invalides ou trop grandes.")
        : result.code === "UNSAFE_FILE" ? (isArabic ? "رُفض الملف بعد فحص الأمان." : "Le fichier a été refusé par l’analyse de sécurité.")
          : result.code === "ANTIVIRUS_UNAVAILABLE" ? (isArabic ? "الفحص الأمني غير متاح حالياً." : "L’analyse antivirus est indisponible pour le moment.")
            : result.code === "STORAGE_QUOTA_EXCEEDED" ? (isArabic ? "تم تجاوز مساحة التخزين المسموح بها." : "Le quota de stockage de 100 Mo est atteint.")
              : (isArabic ? "تعذر إرفاق الملف. الحد الأقصى 10 ميغابايت." : "Impossible de joindre le fichier. Taille maximale : 10 Mo."));
      return;
    }
    form.reset(); await load();
  }

  async function removeAttachment(itemId: string) {
    const response = await fetch(`/api/v1/me/dossiers/${dossierId}/items/${itemId}/attachment`, { method: "DELETE" });
    if (!response.ok) { setError(isArabic ? "تعذر حذف الملف." : "Impossible de supprimer la pièce jointe."); return; }
    await load();
  }

  if (!dossier) return <div className="empty-state">{error || (isArabic ? "جارٍ التحميل…" : "Chargement…")}</div>;
  const requiredCount = dossier.items.filter((item) => item.required).length;
  const completedCount = dossier.items.filter((item) => item.required && (item.status === "added" || item.status === "reviewed")).length;
  return <div className="dossier-detail"><Link className="back-link" href={`/${locale}/dossiers`}>← {isArabic ? "العودة إلى الملفات" : "Retour aux dossiers"}</Link><div className="section-heading"><div className="eyebrow">{isArabic ? "قائمة المستندات" : "CHECKLIST PERSONNALISÉE"}</div><h1>{dossier.title}</h1><p>{isArabic ? `${completedCount} من ${requiredCount} مستند مطلوب` : `${completedCount} élément(s) requis sur ${requiredCount} ajouté(s)`}</p><div className="dossier-export-actions"><a className="button button-quiet" href={`/api/v1/me/dossiers/${dossierId}/export`}>{isArabic ? "تنزيل الملف (ZIP)" : "Télécharger le dossier (ZIP)"}</a><a className="button button-quiet" href={`/api/v1/me/dossiers/${dossierId}/export/pdf`}>{isArabic ? "تنزيل PDF مجمع" : "Télécharger le PDF fusionné"}</a></div></div>{error && <p className="form-message form-error" role="alert">{error}</p>}
    <form className="auth-card dossier-item-form" onSubmit={addItem}><div className="eyebrow">{isArabic ? "إضافة عنصر" : "AJOUTER UNE PIÈCE"}</div><label className="profile-field">{isArabic ? "اسم العنصر" : "Nom de la pièce"}<input name="label" maxLength={240} placeholder={isArabic ? "مثال: نسخة من جواز السفر" : "Ex. copie du passeport"} /></label><label className="profile-field">{isArabic ? "ربط بوثيقة محفوظة" : "Associer un document enregistré"}<select name="documentId" defaultValue=""><option value="">{isArabic ? "قائمة تحقق فقط" : "Checklist uniquement"}</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label><label className="consent-check"><input name="required" type="checkbox" defaultChecked />{isArabic ? "مستند مطلوب" : "Pièce requise"}</label><button className="button">{isArabic ? "إضافة" : "Ajouter à la checklist"}</button></form>
    <section className="dossier-items">{dossier.items.length === 0 ? <div className="empty-state"><p>{isArabic ? "أضف المستندات التي تريد متابعتها." : "Ajoutez les pièces à préparer pour cette démarche."}</p></div> : dossier.items.map((item) => <article className="dossier-item-card" key={item.id}><div><span className={`status-badge status-${item.status}`}>{item.status}</span>{item.required && <span className="required-mark"> · {isArabic ? "مطلوب" : "Requis"}</span>}<h2>{item.label}</h2>{item.linkedDocumentId && <Link className="text-link" href={`/${locale}/mes-documents/${item.linkedDocumentId}`}>{isArabic ? "فتح الوثيقة" : "Ouvrir le document associé"}</Link>}
      <form className="dossier-attachment-form" onSubmit={(event) => void uploadAttachment(event, item.id)}><label>{isArabic ? "إرفاق PDF أو صورة" : "Joindre un PDF ou une image"}<input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required /></label><button className="text-link" type="submit">{isArabic ? "فحص وإرفاق" : "Analyser et joindre"}</button><span className="form-hint">{isArabic ? "10 ميغابايت كحد أقصى؛ تُشفّر الملفات بعد الفحص." : "10 Mo maximum ; chiffrement après analyse antivirus."}</span></form>
      {item.storedFileId && <div className="dossier-attachment-actions"><a className="text-link" href={`/api/v1/me/dossiers/${dossierId}/items/${item.id}/attachment`}>{isArabic ? "تنزيل المرفق" : "Télécharger la pièce jointe"}</a><button className="text-link destructive" type="button" onClick={() => void removeAttachment(item.id)}>{isArabic ? "حذف المرفق" : "Supprimer la pièce jointe"}</button></div>}</div><div className="profile-item-actions"><button className="text-link" type="button" onClick={() => void changeStatus(item)}>{item.status === "reviewed" ? (isArabic ? "إلغاء المراجعة" : "Annuler la revue") : item.status === "added" ? (isArabic ? "مراجعة" : "Marquer vérifié") : (isArabic ? "تمت الإضافة" : "Marquer comme ajouté")}</button><button className="text-link destructive" type="button" onClick={() => void removeItem(item.id)}>{isArabic ? "حذف" : "Retirer"}</button></div></article>)}</section>
  </div>;
}
