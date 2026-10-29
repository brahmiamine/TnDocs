"use client";

import { useEffect, useRef, useState } from "react";
import { renderTemplateText } from "@/modules/documents/form-schema";

type SharedContent = { title?: string; locale: "fr" | "ar"; body: string; answers: Record<string, unknown> };

export function ShareViewer({ locale }: { locale: "fr" | "ar" }) {
  const isArabic = locale === "ar";
  const [content, setContent] = useState<SharedContent | null>(null);
  const [message, setMessage] = useState(isArabic ? "جارٍ التحقق من الرابط…" : "Vérification du lien…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setMessage(isArabic ? "رابط المشاركة غير صالح أو لم يعد متاحاً." : "Ce lien de partage est invalide ou n’est plus disponible.");
      return;
    }
    void fetch("/api/v1/shares/access", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store", referrerPolicy: "no-referrer",
    }).then(async (response) => {
      const result = await response.json() as { content?: SharedContent };
      if (!response.ok || !result.content) throw new Error("Unavailable");
      setContent(result.content);
      setMessage("");
    }).catch(() => setMessage(isArabic ? "انتهت صلاحية الرابط أو تم إلغاؤه." : "Ce lien a expiré ou a été révoqué."));
  }, [isArabic]);

  return <main className="share-viewer">
    <div className="eyebrow">{isArabic ? "نسخة مشتركة للقراءة فقط" : "RÉVISION PARTAGÉE EN LECTURE SEULE"}</div>
    {content ? <><h1>{content.title || (isArabic ? "وثيقة مشتركة" : "Document partagé")}</h1><div className="template-body share-viewer-body" dir={content.locale === "ar" ? "rtl" : "ltr"}>{renderTemplateText(content.body, content.answers)}</div><p className="form-hint">{isArabic ? "هذه نسخة ثابتة. لا يمكن تعديلها من هذا الرابط." : "Cette révision est figée et ne peut pas être modifiée depuis ce lien."}</p></> : <p role="status">{message}</p>}
  </main>;
}
