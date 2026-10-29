"use client";

import Link from "next/link";
import { DossierShareManager } from "@/modules/dossiers/DossierShareManager";
import { PhotoScanner } from "@/modules/dossiers/PhotoScanner";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Item = { id: string; linkedDocumentId: string | null; storedFileId: string | null; kind: string; status: "missing" | "added" | "reviewed" | "expired"; required: boolean; label: string };
type Dossier = { id: string; title: string; items: Item[]; procedure?: { guideId: string; version: number; country: string; verifiedAt: string; sources: Array<{ id: string; name: string; url: string }> } | null };
type PersonalDocument = { id: string; title: string; status: string };

export function DossierDetail({ locale, dossierId }: { locale: string; dossierId: string }) {
  const isArabic = locale === "ar";
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [documents, setDocuments] = useState<PersonalDocument[]>([]);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
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
    const element = event.currentTarget;
    const form = new FormData(element);
    const documentId = String(form.get("documentId") ?? "");
    const selected = documents.find((item) => item.id === documentId);
    const label = String(form.get("label") ?? "").trim() || selected?.title || "";
    const response = await fetch(`/api/v1/me/dossiers/${dossierId}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, required: form.get("required") === "on", documentId: documentId || undefined }) });
    const result = await response.json();
    if (!response.ok) { setError(result.message ?? (isArabic ? "تعذر إضافة العنصر." : "Impossible d’ajouter cet élément.")); return; }
    element.reset(); await load();
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

  async function exportDossier(format: "zip" | "pdf") {
    setExporting(true); setError("");
    try {
      const response = await fetch(`/api/v1/me/dossiers/${dossierId}/exports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format }) });
      if (!response.ok) {
        const result = await response.json() as { code?: string };
        const message = result.code === "DOSSIER_CHANGED" ? (isArabic ? "تغيرت محتويات الملف. أعد التحميل ثم حاول مجدداً." : "Le dossier a changé. Rechargez-le puis réessayez.")
          : result.code === "INCOMPLETE_DOCUMENT" ? (isArabic ? "أكمل الحقول المطلوبة في الوثائق قبل التصدير." : "Complétez les champs requis des documents avant l’export.")
            : ["UNSAFE_PDF", "INCOMPATIBLE_PDF", "INCOMPLETE_DOSSIER"].includes(result.code ?? "") ? (isArabic ? "يتعذر دمج إحدى القطع بأمان. يمكنك تصدير ZIP مع بيان المحتويات." : "Une pièce ne peut pas être fusionnée en toute sécurité. Exportez le ZIP et son manifeste.")
              : (isArabic ? "تعذر التصدير. قد يكون الملف كبيراً أو خدمة PDF غير متاحة." : "Export indisponible : dossier trop volumineux ou service PDF non disponible.");
        throw new Error(message);
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = objectUrl; anchor.download = `tndocs-dossier-${dossierId}.${format}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : (isArabic ? "تعذر التصدير." : "Export impossible.")); }
    finally { setExporting(false); }
  }

  if (!dossier) return <div className="empty-state">{error || (isArabic ? "جارٍ التحميل…" : "Chargement…")}</div>;
  const requiredCount = dossier.items.filter((item) => item.required).length;
  const completedCount = dossier.items.filter((item) => item.required && (item.status === "added" || item.status === "reviewed")).length;
  return <div className="dossier-detail"><Link className="back-link" href={`/${locale}/dossiers`}>← {isArabic ? "العودة إلى الملفات" : "Retour aux dossiers"}</Link><div className="section-heading"><div className="eyebrow">{isArabic ? "قائمة المستندات" : "CHECKLIST PERSONNALISÉE"}</div><h1>{dossier.title}</h1><p>{isArabic ? `${completedCount} من ${requiredCount} مستند مطلوب` : `${completedCount} élément(s) requis sur ${requiredCount} ajouté(s)`}</p></div>{error && <p className="form-message form-error" role="alert">{error}</p>}
    {dossier.procedure && <aside className="auth-card"><h2>{isArabic ? "قائمة مرتبطة بإصدار إجراء متحقق منه" : "Checklist liée à une version vérifiée"}</h2><p>{isArabic ? "الإصدار" : "Version"} {dossier.procedure.version} · <bdi>{dossier.procedure.country}</bdi> · {new Date(dossier.procedure.verifiedAt).toLocaleDateString(locale)}</p><p>{isArabic ? "لن تؤدي تحديثات الإجراء إلى تغيير هذه القائمة تلقائياً. راجع المصدر قبل الإيداع." : "Une nouvelle version de la procédure ne modifie pas cette checklist. Revérifiez la source avant le dépôt."}</p><ul>{dossier.procedure.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a></li>)}</ul></aside>}
    <DossierShareManager dossierId={dossierId} locale={locale} />
    <div className="dossier-export-actions"><button className="button button-secondary" type="button" disabled={exporting} onClick={() => void exportDossier("zip")}>{exporting ? (isArabic ? "جارٍ التصدير…" : "Export…") : (isArabic ? "تنزيل ZIP مع بيان المحتويات" : "Exporter ZIP avec manifeste")}</button><button className="button button-secondary" type="button" disabled={exporting} onClick={() => void exportDossier("pdf")}>{isArabic ? "دمج القطع بصيغة PDF" : "Fusionner les pièces en PDF"}</button><p className="form-hint">{isArabic ? "يشمل ZIP القطع المتاحة والوثائق بصيغة Word. يتضمن PDF القطع القابلة للدمج فقط. لا يثبت هذا قبول الملف من الإدارة." : "Le ZIP contient les pièces disponibles et les documents Word. Le PDF assemble les pièces compatibles. Cet export ne garantit pas l’acceptation du dossier par une administration."}</p></div>
    <form className="auth-card dossier-item-form" onSubmit={addItem}><div className="eyebrow">{isArabic ? "إضافة عنصر" : "AJOUTER UNE PIÈCE"}</div><label className="profile-field">{isArabic ? "اسم العنصر" : "Nom de la pièce"}<input name="label" maxLength={240} placeholder={isArabic ? "مثال: نسخة من جواز السفر" : "Ex. copie du passeport"} /></label><label className="profile-field">{isArabic ? "ربط بوثيقة محفوظة" : "Associer un document enregistré"}<select name="documentId" defaultValue=""><option value="">{isArabic ? "قائمة تحقق فقط" : "Checklist uniquement"}</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label><label className="consent-check"><input name="required" type="checkbox" defaultChecked />{isArabic ? "مستند مطلوب" : "Pièce requise"}</label><button className="button">{isArabic ? "إضافة" : "Ajouter à la checklist"}</button></form>
    <section className="dossier-items">{dossier.items.length === 0 ? <div className="empty-state"><p>{isArabic ? "أضف المستندات التي تريد متابعتها." : "Ajoutez les pièces à préparer pour cette démarche."}</p></div> : dossier.items.map((item) => <article className="dossier-item-card" key={item.id}><div><span className={`status-badge status-${item.status}`}>{item.status}</span>{item.required && <span className="required-mark"> · {isArabic ? "مطلوب" : "Requis"}</span>}<h2>{item.label}</h2>{item.linkedDocumentId && <Link className="text-link" href={`/${locale}/mes-documents/${item.linkedDocumentId}`}>{isArabic ? "فتح الوثيقة" : "Ouvrir le document associé"}</Link>}
      <form className="dossier-attachment-form" onSubmit={(event) => void uploadAttachment(event, item.id)}><label>{isArabic ? "إرفاق PDF أو صورة" : "Joindre un PDF ou une image"}<input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required /></label><button className="text-link" type="submit">{isArabic ? "فحص وإرفاق" : "Analyser et joindre"}</button><span className="form-hint">{isArabic ? "10 ميغابايت كحد أقصى؛ تُشفّر الملفات بعد الفحص." : "10 Mo maximum ; chiffrement après analyse antivirus."}</span></form>
      <PhotoScanner locale={locale} dossierId={dossierId} itemId={item.id} onSaved={load} />
      {item.storedFileId && <div className="dossier-attachment-actions"><a className="text-link" href={`/api/v1/me/dossiers/${dossierId}/items/${item.id}/attachment`}>{isArabic ? "تنزيل المرفق" : "Télécharger la pièce jointe"}</a><button className="text-link destructive" type="button" onClick={() => void removeAttachment(item.id)}>{isArabic ? "حذف المرفق" : "Supprimer la pièce jointe"}</button></div>}</div><div className="profile-item-actions"><button className="text-link" type="button" onClick={() => void changeStatus(item)}>{item.status === "reviewed" ? (isArabic ? "إلغاء المراجعة" : "Annuler la revue") : item.status === "added" ? (isArabic ? "مراجعة" : "Marquer vérifié") : (isArabic ? "تمت الإضافة" : "Marquer comme ajouté")}</button><button className="text-link destructive" type="button" onClick={() => void removeItem(item.id)}>{isArabic ? "حذف" : "Retirer"}</button></div></article>)}</section>
  </div>;
}
