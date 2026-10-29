"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { renderTemplateText } from "@/modules/documents/form-schema";
import type { DocumentContent } from "@/modules/documents/schema";
type SharedDossier = { title: string; allowDownload: boolean; omittedCount: number; expiresAt: string; items: Array<{ id: string; label: string; required: boolean; status: string; hasAttachment: boolean; document: DocumentContent | null; revision: number | null }> };
export function SharedDossierViewer({ locale }: { locale: string }) {
  const ar = locale === "ar", [token, setToken] = useState(""), [dossier, setDossier] = useState<SharedDossier | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const value = window.location.hash.slice(1); if (/^[A-Za-z0-9_-]{43}$/.test(value)) { setToken(value); window.history.replaceState(null, "", window.location.pathname); } }, []);
  async function open() {
    setBusy(true); setDossier(null); setMessage("");
    try { const response = await fetch("/api/v1/dossier-shares/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); if (!response.ok) throw new Error("unavailable"); setDossier(await response.json()); }
    catch { setMessage(ar ? "تعذر فتح المشاركة. سجّل الدخول بحساب موثّق يطابق بريد المستلم؛ قد يكون الرابط منتهياً أو ملغى." : "Partage inaccessible. Connectez-vous avec le compte vérifié du destinataire ; le lien peut aussi avoir expiré ou être révoqué."); }
    finally { setBusy(false); }
  }
  async function download(itemId?: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(itemId ? `/api/v1/dossier-shares/items/${itemId}/attachment` : "/api/v1/dossier-shares/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (!response.ok) { setDossier(null); throw new Error("unavailable"); }
      const objectUrl = URL.createObjectURL(await response.blob()), anchor = document.createElement("a"); anchor.href = objectUrl;
      const mime = response.headers.get("content-type"); anchor.download = itemId ? `tndocs-piece.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg"}` : "tndocs-dossier-partage.zip"; anchor.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch { setMessage(ar ? "لم يعد التنزيل متاحاً. أعد فتح المشاركة للتحقق من صلاحيتها." : "Téléchargement indisponible. Rouvrez le partage pour vérifier sa validité."); }
    finally { setBusy(false); }
  }
  return <main className="container section" dir={ar ? "rtl" : "ltr"} style={{ maxWidth: 900 }}><h1>{ar ? "ملف مشترك خاص" : "Dossier partagé privé"}</h1><p>{ar ? "يلزم حساب موثّق يحمل البريد الذي اختاره المالك. افتح الرابط مجدداً بعد تسجيل الدخول إذا أغلقت هذه الصفحة." : "Un compte vérifié à l’adresse choisie par le propriétaire est requis. Rouvrez le lien après connexion si vous fermez cette page."}</p><p><Link href={`/${locale}/connexion`} target="_blank" rel="noopener noreferrer">{ar ? "تسجيل الدخول" : "Se connecter"}</Link></p><button className="button" type="button" disabled={!token || busy} onClick={() => void open()}>{ar ? "فتح المشاركة" : "Ouvrir le partage"}</button>{message && <p role="status">{message}</p>}{dossier && <section><h2>{dossier.title}</h2><p>{ar ? "هذا الملف ليس مصادقة إدارية." : "Ce dossier ne constitue pas une validation administrative."}</p>{dossier.omittedCount > 0 && <p>{ar ? "بعض القطع سُحبت ولم تعد متاحة." : "Certaines pièces ont été retirées et ne sont plus accessibles."}</p>}{dossier.allowDownload && <button className="button" disabled={busy} onClick={() => void download()}>{ar ? "تنزيل ZIP" : "Télécharger le ZIP"}</button>}<ul>{dossier.items.map(item => <li key={item.id}><h3>{item.label}</h3><span>{item.status}</span>{item.document && <details><summary>{ar ? "عرض الوثيقة" : "Consulter le document"} · {item.revision}</summary><div className="template-body" dir={item.document.locale === "ar" ? "rtl" : "ltr"}>{renderTemplateText(item.document.body, item.document.answers)}</div></details>}{item.hasAttachment && dossier.allowDownload && <button type="button" disabled={busy} onClick={() => void download(item.id)}>{ar ? "تنزيل القطعة" : "Télécharger la pièce"}</button>}</li>)}</ul></section>}</main>;
}
