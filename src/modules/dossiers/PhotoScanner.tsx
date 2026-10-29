"use client";

import { useEffect, useRef, useState } from "react";

type Props = { locale: string; dossierId: string; itemId: string; onSaved: () => Promise<void> };

export function PhotoScanner({ locale, dossierId, itemId, onSaved }: Props) {
  const ar = locale === "ar";
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [crop, setCrop] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [contrast, setContrast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => () => image?.close(), [image]);
  useEffect(() => {
    if (!image || !canvas.current) return;
    const view = canvas.current;
    const x = image.width * crop / 100; const y = image.height * crop / 100;
    const width = image.width - x * 2; const height = image.height - y * 2;
    const scale = Math.min(1, 2200 / Math.max(width, height));
    const swapped = rotation % 180 !== 0;
    view.width = Math.round((swapped ? height : width) * scale);
    view.height = Math.round((swapped ? width : height) * scale);
    const context = view.getContext("2d"); if (!context) return;
    context.fillStyle = "white"; context.fillRect(0, 0, view.width, view.height);
    context.save(); context.translate(view.width / 2, view.height / 2); context.rotate(rotation * Math.PI / 180);
    context.filter = contrast ? "grayscale(1) contrast(1.5) brightness(1.1)" : "none";
    context.drawImage(image, x, y, width, height, -width * scale / 2, -height * scale / 2, width * scale, height * scale);
    context.restore();
  }, [image, crop, rotation, contrast]);

  async function select(file?: File) {
    setMessage("");
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024) { setMessage(ar ? "اختر صورة JPEG أو PNG لا تتجاوز 10 ميغابايت." : "Choisissez une image JPEG ou PNG de 10 Mo maximum."); return; }
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (bitmap.width * bitmap.height > 40_000_000) { bitmap.close(); throw new Error("IMAGE_DIMENSIONS"); }
      setImage(bitmap); setCrop(0); setRotation(0);
    } catch { setMessage(ar ? "تعذر فتح الصورة أو أبعادها كبيرة جداً." : "Impossible d’ouvrir cette image, ou ses dimensions sont trop grandes."); }
  }

  async function save() {
    if (!canvas.current || !image) return;
    setBusy(true); setMessage("");
    try {
      const photo = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob((blob) => blob ? resolve(blob) : reject(new Error("CANVAS_UNAVAILABLE")), "image/png"));
      const conversion = new FormData(); conversion.set("photo", photo, "scan.png");
      const converted = await fetch(`/api/v1/me/dossiers/${dossierId}/exports/photo`, { method: "POST", body: conversion });
      if (!converted.ok) throw new Error("PHOTO_CONVERSION_UNAVAILABLE");
      const upload = new FormData(); upload.set("file", await converted.blob(), "scan.pdf");
      const response = await fetch(`/api/v1/me/dossiers/${dossierId}/items/${itemId}/attachment`, { method: "POST", body: upload });
      if (!response.ok) throw new Error("UPLOAD_UNAVAILABLE");
      setImage(null); await onSaved(); setMessage(ar ? "أُضيف المسح بصيغة PDF بعد الفحص." : "Le scan PDF a été analysé puis ajouté.");
    } catch { setMessage(ar ? "تعذر تحويل الصورة أو إرفاقها. تحقق من الاتصال وخدمة الفحص الأمني." : "Conversion ou envoi impossible. Vérifiez la connexion et la disponibilité de l’antivirus."); }
    finally { setBusy(false); }
  }

  return <details className="dossier-photo-scanner"><summary>{ar ? "مسح صورة بالكاميرا" : "Scanner une photo avec l’appareil"}</summary>
    <p className="form-hint">{ar ? "المعاينة محلية. لا تُرسل الصورة إلا بعد تأكيد إضافة PDF. ليس فحصاً رسمياً للوثيقة." : "La prévisualisation reste sur cet appareil. La photo est envoyée uniquement après confirmation. Ce scan ne valide pas la pièce."}</p>
    <label>{ar ? "التقاط أو اختيار صورة" : "Prendre ou choisir une photo"}<input type="file" accept="image/jpeg,image/png" capture="environment" disabled={busy} onChange={(event) => void select(event.target.files?.[0])} /></label>
    {image && <div><canvas ref={canvas} style={{ maxWidth: "100%", maxHeight: "50vh", objectFit: "contain", border: "1px solid currentColor" }} aria-label={ar ? "معاينة المسح" : "Prévisualisation du scan"} />
      <label>{ar ? "قص الهوامش" : "Recadrer les marges"} {crop}%<input type="range" min={0} max={40} step={1} value={crop} onChange={(event) => setCrop(Number(event.target.value))} disabled={busy} /></label>
      <label><input type="checkbox" checked={contrast} onChange={(event) => setContrast(event.target.checked)} disabled={busy} />{ar ? "زيادة التباين" : "Améliorer le contraste"}</label>
      <button className="text-link" type="button" disabled={busy} onClick={() => setRotation((value) => (value + 90) % 360)}>{ar ? "تدوير" : "Pivoter"}</button>
      <button className="button" type="button" disabled={busy} onClick={() => void save()}>{busy ? (ar ? "جارٍ الفحص…" : "Analyse…") : (ar ? "تأكيد وإضافة PDF" : "Confirmer et ajouter le PDF")}</button>
      <button className="text-link" type="button" disabled={busy} onClick={() => setImage(null)}>{ar ? "إلغاء" : "Annuler"}</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
